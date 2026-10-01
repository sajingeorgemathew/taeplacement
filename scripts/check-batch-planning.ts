/**
 * Checks for PLACEMENT-07B: Batch Planning visibility.
 *
 *   npx tsx scripts/check-batch-planning.ts
 *
 * ---------------------------------------------------------------------------
 * This script NEVER touches the database and NEVER sends anything
 * ---------------------------------------------------------------------------
 *
 * It imports only pure modules: the planning grouping, the document-needs
 * summary, the city normalization and mapping, the planning URL parser, and
 * the placement vocabulary. It also reads the planning page, the planning
 * components, and the planning reads as TEXT, to assert that nothing on the
 * planning surface mutates a record or selects a private column.
 *
 * The fixtures are invented placeholders and deliberately not real students.
 */

import fs from "node:fs";
import path from "node:path";

import type { PartnerListItem } from "../src/lib/partners/queries";
import {
  PLACEMENT_STATUSES,
  type PlacementDocumentStatus,
  type PlacementStatus,
} from "../src/lib/placement/constants";
import type { PlacementBoardStudent } from "../src/lib/placement/queries";
import {
  MISSING_CITY_KEY,
  MISSING_CITY_LABEL,
  buildBatchPlanning,
  canOfferFindPlacement,
  countStudents,
  planningObservation,
  studentsInCity,
  summarizePartners,
  type BatchPlanning,
} from "../src/lib/planning/batch";
import { cityDisplayLabel, normalizeCityName, tidyCityName } from "../src/lib/planning/city";
import {
  PLANNING_BREAKDOWN_STATUSES,
  PLANNING_EXTRA_STATUSES,
  PLANNING_STUDENT_FILTERS,
} from "../src/lib/planning/constants";
import {
  PLANNING_DRILLDOWN_KEYS,
  clearedDrilldown,
  emptyPlanningValues,
  planningBatchChoices,
  planningCity,
  planningDrilldownHref,
  planningException,
  planningHref,
  planningNeed,
  planningRequirement,
  planningStudentStatus,
  planningValuesFrom,
  planningView,
  resolveBatch,
} from "../src/lib/planning/filters";
import { buildCityAreaIndex, resolveCityArea } from "../src/lib/planning/mapping";
import {
  CHECKLIST_READ_CHUNK,
  NEED_KINDS,
  STAFF_REVIEW_STATUSES,
  STUDENT_ACTION_STATUSES,
  buildBatchDocumentNeeds,
  chunkIds,
  isNeedKind,
  needKindForStatus,
  needRequirement,
  needStudentIds,
  staffReviewHeadline,
  studentActionHeadline,
  studentNeedLabel,
  type NeedChecklistRow,
  type NeedRequirement,
} from "../src/lib/planning/needs";
import type {
  BatchRow,
  PlacementAreaCityRow,
  PlacementAreaRow,
} from "../src/lib/supabase/database.types";

// ---------------------------------------------------------------------------
// Tiny assertion harness
// ---------------------------------------------------------------------------

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
    return;
  }
  failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
  console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n${title}`);
}

function same<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sourceOf(relative: string): string {
  return fs.readFileSync(path.join(process.cwd(), relative), "utf8");
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-09-26T12:00:00");

function batch(partial: Partial<BatchRow> & Pick<BatchRow, "id" | "name">): BatchRow {
  return {
    program: "PSW",
    start_date: null,
    schedule_label: null,
    status: "active",
    sort_order: null,
    placement_tracking_enabled: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

const PSW_BATCH = batch({
  id: "b-psw",
  name: "PSW - September 2026",
  program: "PSW",
  start_date: "2026-09-08",
  placement_tracking_enabled: true,
  sort_order: 3,
});
const ECEA_BATCH = batch({
  id: "b-ecea",
  name: "ECEA - September 2026",
  program: "ECEA",
  start_date: "2026-09-15",
  placement_tracking_enabled: true,
  sort_order: 4,
});
const OLD_BATCH = batch({
  id: "b-april",
  name: "PSW - April 2026",
  start_date: "2026-04-06",
  placement_tracking_enabled: false,
  sort_order: 1,
});
const ARCHIVED_BATCH = batch({
  id: "b-archived",
  name: "PSW - January 2026",
  start_date: "2026-01-12",
  status: "archived",
  placement_tracking_enabled: true,
  sort_order: 0,
});
const BATCHES = [ARCHIVED_BATCH, OLD_BATCH, PSW_BATCH, ECEA_BATCH];

function area(
  partial: Partial<PlacementAreaRow> & Pick<PlacementAreaRow, "id" | "name">,
): PlacementAreaRow {
  return {
    description: null,
    sort_order: 0,
    color_key: "slate",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

const PEEL = area({ id: "a-peel", name: "Peel", color_key: "blue", sort_order: 1 });
const TORONTO = area({ id: "a-toronto", name: "Toronto", color_key: "green", sort_order: 2 });
const DURHAM = area({ id: "a-durham", name: "Durham", color_key: "amber", sort_order: 3, is_active: false });
const AREAS = [PEEL, TORONTO, DURHAM];

function mapping(city: string, areaId: string): PlacementAreaCityRow {
  return {
    id: `m-${normalizeCityName(city)}`,
    normalized_city_name: normalizeCityName(city),
    city_name: tidyCityName(city),
    area_id: areaId,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as PlacementAreaCityRow;
}

const MAPPINGS = [
  mapping("Mississauga", PEEL.id),
  mapping("Brampton", PEEL.id),
  mapping("Toronto", TORONTO.id),
  mapping("Scarborough", TORONTO.id),
  mapping("Oshawa", DURHAM.id),
];

function partner(
  id: string,
  areaId: string | null,
  availability: PartnerListItem["availability_status"],
  extra: Partial<PartnerListItem> = {},
): PartnerListItem {
  return {
    id,
    name: `Partner ${id}`,
    area_id: areaId,
    area: AREAS.find((row) => row.id === areaId) ?? null,
    availability_status: availability,
    next_intake_date: null,
    next_follow_up_at: null,
    relationship_status: "active",
    contactCount: 1,
    noteCount: 0,
    ...extra,
  } as PartnerListItem;
}

const PARTNERS = [
  partner("p1", PEEL.id, "available_now"),
  partner("p2", PEEL.id, "unknown"),
  partner("p3", PEEL.id, "upcoming", { next_intake_date: "2026-10-20" }),
  partner("p4", TORONTO.id, "not_available"),
  partner("p5", TORONTO.id, "available_now", {
    next_follow_up_at: "2026-09-25T00:00:00Z",
  }),
  partner("p6", null, "available_now"),
  partner("p7", DURHAM.id, "available_now"),
];

function student(
  id: string,
  batchRow: BatchRow,
  city: string | null,
  placementStatus: PlacementStatus,
  extra: Partial<PlacementBoardStudent> = {},
): PlacementBoardStudent {
  return {
    id,
    student_number: `S-${id}`,
    first_name: `First ${id}`,
    middle_name: null,
    last_name: `Last ${id}`,
    program: batchRow.program,
    batch_id: batchRow.id,
    batch: {
      id: batchRow.id,
      name: batchRow.name,
      program: batchRow.program,
      start_date: batchRow.start_date,
      status: batchRow.status,
      placement_tracking_enabled: batchRow.placement_tracking_enabled,
    },
    city,
    province: "Ontario",
    address_line: null,
    placement_status: placementStatus,
    document_status: "pending",
    is_active: true,
    readiness: undefined,
    currentPlacement: null,
    noteCount: 0,
    ...extra,
  } as PlacementBoardStudent;
}

const placementAt = (partnerId: string, status: "assigned" | "started") =>
  ({
    id: `pl-${partnerId}`,
    partner_id: partnerId,
    status,
    partner: PARTNERS.find((row) => row.id === partnerId) ?? null,
  }) as unknown as PlacementBoardStudent["currentPlacement"];

const PSW_STUDENTS: PlacementBoardStudent[] = [
  student("s1", PSW_BATCH, "Mississauga", "documents_pending"),
  student("s2", PSW_BATCH, " MISSISSAUGA ", "ready_for_placement"),
  student("s3", PSW_BATCH, "Brampton", "ready_for_placement"),
  student("s4", PSW_BATCH, "Toronto", "placement_assigned", {
    currentPlacement: placementAt("p4", "assigned"),
  }),
  student("s5", PSW_BATCH, "Scarborough", "placement_started", {
    currentPlacement: placementAt("p5", "started"),
  }),
  student("s6", PSW_BATCH, "Etobicoke", "documents_pending"),
  student("s7", PSW_BATCH, null, "needs_review"),
  student("s8", PSW_BATCH, "Oshawa", "on_hold"),
  student("s9", PSW_BATCH, "Mississauga", "placement_completed"),
];

const ECEA_STUDENTS: PlacementBoardStudent[] = [
  student("e1", ECEA_BATCH, "Brampton", "ready_for_placement"),
  student("e2", ECEA_BATCH, "Toronto", "documents_pending"),
  student("e3", ECEA_BATCH, "   ", "ready_for_placement"),
];

function requirement(
  id: string,
  name: string,
  sortOrder: number,
  extra: Partial<NeedRequirement> = {},
): NeedRequirement {
  return {
    id,
    name,
    short_name: null,
    is_required: true,
    is_active: true,
    sort_order: sortOrder,
    ...extra,
  };
}

const R_SEROLOGY = requirement("r-serology", "Serology Report", 10, { short_name: "Serology" });
const R_IMMUN = requirement("r-immun", "Immunization Record", 20);
const R_BLOOD = requirement("r-blood", "Blood Report", 40, { short_name: "Blood" });
const R_CPR = requirement("r-cpr", "Standard First Aid & CPR Certificate - Level C", 70);
const R_VSC = requirement("r-vsc", "Vulnerable Sector Police Check Certificate", 90);
const R_WHMIS = requirement("r-whmis", "WHMIS Certificate", 100);
const R_OPTIONAL = requirement("r-optional", "Driver Abstract", 200, { is_required: false });
const R_ARCHIVED = requirement("r-archived", "Retired Requirement", 300, { is_active: false });
const REQUIREMENTS = [R_SEROLOGY, R_IMMUN, R_BLOOD, R_CPR, R_VSC, R_WHMIS, R_OPTIONAL, R_ARCHIVED];

/**
 * Checklist rows as the TABLE holds them, note and student_message included,
 * so the test proves the summary never reads either column even when handed
 * a wider row.
 */
type WideRow = NeedChecklistRow & { note: string | null; student_message: string | null };

const PRIVATE_NOTE = "PRIVATE-NOTE-medical-detail";
const PRIVATE_MESSAGE = "PRIVATE-STUDENT-MESSAGE";

function row(
  studentId: string,
  requirementId: string,
  status: PlacementDocumentStatus,
): WideRow {
  return {
    student_id: studentId,
    requirement_id: requirementId,
    status,
    note: PRIVATE_NOTE,
    student_message: PRIVATE_MESSAGE,
  };
}

const CHECKLIST_ROWS: WideRow[] = [
  row("s1", R_VSC.id, "requested"),
  row("s1", R_CPR.id, "needs_update"),
  row("s1", R_SEROLOGY.id, "not_reviewed"),
  row("s1", R_BLOOD.id, "received"),
  row("s1", R_IMMUN.id, "not_applicable"),
  row("s2", R_VSC.id, "requested"),
  row("s2", R_WHMIS.id, "requested"),
  row("s3", R_VSC.id, "requested"),
  row("s3", R_SEROLOGY.id, "not_reviewed"),
  row("s3", R_ARCHIVED.id, "requested"),
  row("s3", R_OPTIONAL.id, "requested"),
  row("s4", R_VSC.id, "received"),
  row("s4", R_CPR.id, "received"),
  row("s6", R_CPR.id, "needs_update"),
  row("s6", R_VSC.id, "needs_update"),
  row("s7", R_SEROLOGY.id, "not_reviewed"),
  row("s7", R_BLOOD.id, "not_reviewed"),
  row("s7", R_IMMUN.id, "not_reviewed"),
  // Another batch and an unknown student: both must be ignored.
  row("e1", R_VSC.id, "requested"),
  row("ghost", R_VSC.id, "requested"),
];

const psw = buildBatchPlanning({
  students: PSW_STUDENTS,
  partners: PARTNERS,
  areas: AREAS,
  mappings: MAPPINGS,
  today: NOW,
});
const ecea = buildBatchPlanning({
  students: ECEA_STUDENTS,
  partners: PARTNERS,
  areas: AREAS,
  mappings: MAPPINGS,
  today: NOW,
});

const needs = buildBatchDocumentNeeds({
  studentIds: PSW_STUDENTS.map((s) => s.id),
  requirements: REQUIREMENTS,
  rows: CHECKLIST_ROWS,
});

function sumStatuses(planning: BatchPlanning): number {
  return PLACEMENT_STATUSES.reduce(
    (total, status) => total + planning.counts.byStatus[status],
    0,
  );
}

// ---------------------------------------------------------------------------
// A. Status totals
// ---------------------------------------------------------------------------

section("A. Status totals");

check("PSW batch total is every active student", psw.counts.total === 9);
check("PSW statuses sum to the total", sumStatuses(psw) === psw.counts.total);
check(
  "PSW counts are plain tallies of placement_status",
  psw.counts.byStatus.documents_pending === 2 &&
    psw.counts.byStatus.ready_for_placement === 2 &&
    psw.counts.byStatus.placement_assigned === 1 &&
    psw.counts.byStatus.placement_started === 1 &&
    psw.counts.byStatus.placement_completed === 1 &&
    psw.counts.byStatus.needs_review === 1 &&
    psw.counts.byStatus.on_hold === 1,
);
check("ECEA batch total is every active student", ecea.counts.total === 3);
check("ECEA statuses sum to the total", sumStatuses(ecea) === ecea.counts.total);
check(
  "ECEA counts use the same statuses",
  ecea.counts.byStatus.ready_for_placement === 2 &&
    ecea.counts.byStatus.documents_pending === 1,
);
check(
  "the five primary stages are the lifecycle in order",
  same(PLANNING_BREAKDOWN_STATUSES, [
    "documents_pending",
    "ready_for_placement",
    "placement_assigned",
    "placement_started",
    "placement_completed",
  ]),
);
check(
  "Needs Review and On Hold are the secondary stages",
  same(PLANNING_EXTRA_STATUSES, ["needs_review", "on_hold"]),
);
check(
  "primary and secondary stages together are every placement status",
  [...PLANNING_BREAKDOWN_STATUSES, ...PLANNING_EXTRA_STATUSES].length ===
    PLACEMENT_STATUSES.length &&
    PLACEMENT_STATUSES.every((status) =>
      (
        [...PLANNING_BREAKDOWN_STATUSES, ...PLANNING_EXTRA_STATUSES] as string[]
      ).includes(status),
    ),
);
check(
  "the drill-down filters offer every placement status",
  PLACEMENT_STATUSES.every((status) =>
    (PLANNING_STUDENT_FILTERS as readonly string[]).includes(status),
  ),
);

// ---------------------------------------------------------------------------
// B. Cities
// ---------------------------------------------------------------------------

section("B. Cities");

check(
  "normalization trims, collapses whitespace, and lowercases",
  normalizeCityName("  Missis  sauga ") === "missis sauga" &&
    normalizeCityName("MISSISSAUGA") === "mississauga",
);
check("blank city normalizes to the missing key", normalizeCityName("   ") === MISSING_CITY_KEY);
check(
  "display label is the most common spelling",
  cityDisplayLabel(["Mississauga", " MISSISSAUGA ", "Mississauga"]) === "Mississauga",
);

const cityTotal = psw.cities.reduce((total, city) => total + city.count, 0);
check("city counts add back to the batch total", cityTotal === psw.counts.total);
check(
  "every student appears in exactly one city row",
  new Set(psw.cities.flatMap((city) => city.students.map((s) => s.id))).size ===
    psw.counts.total,
);

const mississauga = psw.cities.find((city) => city.key === "mississauga");
check(
  "three spellings of Mississauga are one row of 3 labelled Mississauga",
  mississauga?.count === 3 && mississauga.label === "Mississauga",
);
check(
  "a mapped city resolves its active Area",
  mississauga?.state === "mapped" && mississauga.area?.id === PEEL.id,
);
check("largest city first", psw.cities[0]?.key === "mississauga");

const etobicoke = psw.cities.find((city) => city.key === "etobicoke");
check(
  "an unmapped city stays explicit with no Area",
  etobicoke?.state === "unmapped" && etobicoke.area === null,
);

const oshawa = psw.cities.find((city) => city.key === "oshawa");
check(
  "a city mapped to an archived Area is Needs Review, naming the archived Area",
  oshawa?.state === "needs_review" && oshawa.area?.id === DURHAM.id,
);

const missingRow = psw.cities[psw.cities.length - 1];
check(
  "City Missing is its own row, last, with the missing key and label",
  missingRow?.state === "missing" &&
    missingRow.key === MISSING_CITY_KEY &&
    missingRow.label === MISSING_CITY_LABEL &&
    missingRow.count === 1 &&
    missingRow.students[0]?.id === "s7",
);
check(
  "City Missing count equals the existing missing exception",
  missingRow?.count === psw.missing.counts.total,
);
check(
  "ECEA blank-whitespace city is City Missing too",
  ecea.cities[ecea.cities.length - 1]?.state === "missing" &&
    ecea.missing.counts.total === 1,
);
check(
  "the mapping resolver never guesses an Area for an unknown city",
  resolveCityArea("Nowhere", buildCityAreaIndex(MAPPINGS, AREAS)).state === "unmapped",
);

// ---------------------------------------------------------------------------
// C. Area summaries
// ---------------------------------------------------------------------------

section("C. Area summaries");

const peel = psw.areas.find((group) => group.area.id === PEEL.id);
const toronto = psw.areas.find((group) => group.area.id === TORONTO.id);

check("only active Areas holding a student become cards", psw.areas.length === 2);
check("archived Durham is not a card", !psw.areas.some((g) => g.area.id === DURHAM.id));
check("Peel has the right student count", peel?.counts.total === 4);
check(
  "Peel stage counts are correct",
  peel?.counts.byStatus.documents_pending === 1 &&
    peel.counts.byStatus.ready_for_placement === 2 &&
    peel.counts.byStatus.placement_completed === 1 &&
    peel.counts.byStatus.placement_assigned === 0,
);
check(
  "Peel city breakdown is Mississauga 3, Brampton 1",
  peel?.cities.length === 2 &&
    peel.cities[0].label === "Mississauga" &&
    peel.cities[0].count === 3 &&
    peel.cities[1].label === "Brampton" &&
    peel.cities[1].count === 1,
);
check("Peel partner count is 3", peel?.partners.total === 3);
check("Peel available-now count is 1", peel?.partners.availableNow === 1);
check(
  "Peel upcoming and unknown are counted, not hidden",
  peel?.partners.upcoming === 1 && peel.partners.unknown === 1,
);
check("Toronto has the right student count", toronto?.counts.total === 2);
check(
  "Toronto stage counts are correct",
  toronto?.counts.byStatus.placement_assigned === 1 &&
    toronto.counts.byStatus.placement_started === 1,
);
check(
  "Toronto partner counts are correct",
  toronto?.partners.total === 2 &&
    toronto.partners.availableNow === 1 &&
    toronto.partners.notAvailable === 1,
);
check("a due partner follow-up is counted", toronto?.partners.followUpDue === 1);
check(
  "an unassigned partner belongs to no Area",
  !psw.areas.some((g) => g.partners.total > 0 && PARTNERS.filter((p) => p.area_id === g.area.id).length !== g.partners.total),
);
check(
  "Area students plus exceptions equal the batch total",
  psw.areas.reduce((t, g) => t + g.counts.total, 0) +
    psw.unmapped.counts.total +
    psw.missing.counts.total ===
    psw.counts.total,
);
check(
  "the observation is descriptive and never subtracts",
  peel !== undefined &&
    planningObservation(peel) ===
      "2 students are ready for placement. 1 partner in this Area is currently marked Available Now. 1 partner has not been checked yet.",
  peel ? planningObservation(peel) ?? "null" : "no Peel",
);
check(
  "no available partner reads as a neutral sentence",
  planningObservation({
    area: PEEL,
    students: [],
    counts: { ...countStudents([]), byStatus: { ...countStudents([]).byStatus, ready_for_placement: 4 }, total: 4 },
    cities: [],
    partners: summarizePartners([partner("x", PEEL.id, "unknown")], NOW),
  }) ===
    "4 students are ready for placement. No partner in this Area is currently marked Available Now. 1 partner has not been checked yet.",
);

// ---------------------------------------------------------------------------
// D. Document needs
// ---------------------------------------------------------------------------

section("D. Document needs");

check(
  "requested and needs_update are student action",
  same(STUDENT_ACTION_STATUSES, ["requested", "needs_update"]) &&
    needKindForStatus("requested") === "action" &&
    needKindForStatus("needs_update") === "action",
);
check(
  "not_reviewed is staff review",
  same(STAFF_REVIEW_STATUSES, ["not_reviewed"]) &&
    needKindForStatus("not_reviewed") === "review",
);
check(
  "received and not_applicable are neither",
  needKindForStatus("received") === null && needKindForStatus("not_applicable") === null,
);

const byName = (list: { requirement: NeedRequirement }[]) =>
  list.map((need) => need.requirement.name);

check(
  "student action is grouped by requirement, largest first",
  same(byName(needs.action.requirements), [
    R_VSC.name,
    R_CPR.name,
    R_WHMIS.name,
    R_OPTIONAL.name,
  ]),
  byName(needs.action.requirements).join(" | "),
);
check(
  "one requirement across multiple students aggregates correctly",
  needs.action.requirements[0]?.studentCount === 4 &&
    same(needs.action.requirements[0].studentIds, ["s1", "s2", "s3", "s6"]),
);
check(
  "one student's multiple requirements aggregate correctly",
  needs.byStudent.get("s1")?.studentActions === 2 &&
    needs.byStudent.get("s1")?.notReviewed === 1,
);
check("distinct students needing action is 4", needs.action.studentCount === 4);
check(
  "staff review is grouped by requirement",
  same(byName(needs.review.requirements), [R_SEROLOGY.name, R_IMMUN.name, R_BLOOD.name]),
  byName(needs.review.requirements).join(" | "),
);
check(
  "staff review counts distinct students, not rows",
  needs.review.studentCount === 3 && same(needs.review.studentIds, ["s1", "s3", "s7"]),
);
check(
  "a student with only not_reviewed items has no student action",
  needs.byStudent.get("s7")?.studentActions === 0 &&
    needs.byStudent.get("s7")?.notReviewed === 3,
);
check(
  "received is omitted",
  !needs.byStudent.has("s4") &&
    !byName(needs.action.requirements).includes(R_BLOOD.name),
);
check(
  "not_applicable is omitted",
  !needs.review.requirements.some((n) => n.requirement.id === R_IMMUN.id && n.studentIds.includes("s1")),
);
check(
  "an archived requirement is never listed",
  !byName(needs.action.requirements).includes(R_ARCHIVED.name),
);
check(
  "an optional requirement is listed when a student needs it, and marked optional",
  needs.action.requirements.some(
    (n) => n.requirement.id === R_OPTIONAL.id && n.requirement.is_required === false,
  ),
);
check(
  "rows from another batch or an unknown student are ignored",
  !needs.action.studentIds.includes("e1") && !needs.action.studentIds.includes("ghost"),
);

const serialized = JSON.stringify({
  action: needs.action,
  review: needs.review,
  byStudent: [...needs.byStudent.entries()],
});
check(
  "no internal note is exposed",
  !serialized.includes(PRIVATE_NOTE) && !serialized.includes('"note"'),
);
check(
  "no student message is exposed",
  !serialized.includes(PRIVATE_MESSAGE) && !serialized.includes("student_message"),
);
check(
  "no requirement description is exposed",
  !serialized.includes("description"),
);

check(
  "the attention line reads as counts only",
  studentNeedLabel(needs.byStudent.get("s1")) === "2 student actions, 1 item not reviewed" &&
    studentNeedLabel(needs.byStudent.get("s7")) === "3 items not reviewed" &&
    studentNeedLabel(needs.byStudent.get("s2")) === "2 student actions" &&
    studentNeedLabel(undefined) === null,
);
check(
  "headlines never call not_reviewed a missing student document",
  staffReviewHeadline(4) === "4 students have checklist items not yet reviewed." &&
    studentActionHeadline(5) === "5 students need to act on a placement document." &&
    !staffReviewHeadline(4).toLowerCase().includes("missing"),
);

const emptyNeeds = buildBatchDocumentNeeds({
  studentIds: ["s4"],
  requirements: REQUIREMENTS,
  rows: CHECKLIST_ROWS,
});
check(
  "a batch with nothing outstanding summarizes to zero on both sides",
  emptyNeeds.action.studentCount === 0 &&
    emptyNeeds.review.studentCount === 0 &&
    emptyNeeds.action.requirements.length === 0,
);

check(
  "checklist ids are read in fixed slices",
  chunkIds(Array.from({ length: CHECKLIST_READ_CHUNK * 2 + 1 }, (_, i) => `id${i}`)).length === 3 &&
    chunkIds([]).length === 0 &&
    chunkIds(["a", "b"], 1).length === 2,
);

// ---------------------------------------------------------------------------
// E. Drill-down
// ---------------------------------------------------------------------------

section("E. Drill-down");

check(
  "a requirement click returns the matching students",
  same(needStudentIds(needs, "action", R_CPR.id), ["s1", "s6"]),
);
check(
  "a staff-review requirement click returns the matching students",
  same(needStudentIds(needs, "review", R_SEROLOGY.id), ["s1", "s3", "s7"]),
);
check(
  "a kind without a requirement returns every student of that kind",
  same(needStudentIds(needs, "action", null), ["s1", "s2", "s3", "s6"]) &&
    same(needStudentIds(needs, "review", null), ["s1", "s3", "s7"]),
);
check(
  "an unknown requirement returns nobody rather than everybody",
  needStudentIds(needs, "action", "r-unknown").length === 0 &&
    needRequirement(needs, "action", "r-unknown") === null,
);
check(
  "a requirement is only found under the kind it is needed for",
  needRequirement(needs, "review", R_VSC.id) === null &&
    needRequirement(needs, "action", R_VSC.id)?.id === R_VSC.id,
);
check(
  "a city click returns the students from that city",
  same(studentsInCity(psw, "mississauga").map((s) => s.id), ["s1", "s2", "s9"]),
);
check(
  "a city click on an unknown city returns nobody",
  studentsInCity(psw, "nowhere").length === 0,
);
check(
  "the existing status filter still narrows an Area",
  peel !== undefined &&
    peel.students.filter((s) => s.placement_status === "ready_for_placement").length === 2,
);
check(
  "the existing Area group still lists the right students",
  peel !== undefined && same(peel.students.map((s) => s.id), ["s1", "s2", "s3", "s9"]),
);

const overview = planningValuesFrom({ batch: PSW_BATCH.id });
check("no drill-down parameter is the overview", planningView(overview) === "overview");
check(
  "status alone is the batch-wide status drill-down",
  planningView(planningValuesFrom({ status: "ready_for_placement" })) === "status" &&
    planningStudentStatus(planningValuesFrom({ status: "ready_for_placement" })) ===
      "ready_for_placement",
);
check(
  "an unknown status is not a drill-down",
  planningView(planningValuesFrom({ status: "bogus" })) === "overview",
);
check(
  "city opens the city drill-down with a normalized key",
  planningView(planningValuesFrom({ city: " MISSISSAUGA " })) === "city" &&
    planningCity(planningValuesFrom({ city: " MISSISSAUGA " })) === "mississauga",
);
check(
  "a blank or absurd city opens nothing",
  planningCity(planningValuesFrom({ city: "   " })) === null &&
    planningCity(planningValuesFrom({ city: "x".repeat(500) })) === null,
);
check(
  "need opens the need drill-down for the two kinds only",
  planningView(planningValuesFrom({ need: "action" })) === "need" &&
    planningView(planningValuesFrom({ need: "review" })) === "need" &&
    planningView(planningValuesFrom({ need: "missing" })) === "overview" &&
    planningNeed(planningValuesFrom({ need: "missing" })) === null &&
    same(NEED_KINDS, ["action", "review"]) &&
    isNeedKind("action") &&
    !isNeedKind("ACTION"),
);
check(
  "requirement is accepted only as a well-formed id",
  planningRequirement(
    planningValuesFrom({ requirement: "5F0A1C2E-1111-4222-8333-444455556666" }),
  ) === "5f0a1c2e-1111-4222-8333-444455556666" &&
    planningRequirement(planningValuesFrom({ requirement: "r-vsc" })) === null &&
    planningRequirement(planningValuesFrom({ requirement: "'; drop table" })) === null,
);
check(
  "views resolve in priority order: exception, area, city, need, status",
  planningView(planningValuesFrom({ exception: "missing", area: "a", city: "x", need: "action", status: "on_hold" })) === "exception" &&
    planningView(planningValuesFrom({ area: "a", city: "x", need: "action", status: "on_hold" })) === "area" &&
    planningView(planningValuesFrom({ city: "x", need: "action", status: "on_hold" })) === "city" &&
    planningView(planningValuesFrom({ need: "action", status: "on_hold" })) === "need" &&
    planningException(planningValuesFrom({ exception: "unmapped" })) === "unmapped",
);
check(
  "the array form of a parameter takes its first value",
  planningValuesFrom({ city: ["brampton", "toronto"] }).city === "brampton",
);

const deep = planningValuesFrom({
  batch: PSW_BATCH.id,
  operations: "all",
  area: PEEL.id,
  status: "ready_for_placement",
  availability: "available_now",
});
const cityLink = planningDrilldownHref("/placement/planning", deep, { city: "brampton" });
check(
  "a drill-down link resets every other drill-down and keeps batch and scope",
  cityLink === `/placement/planning?batch=${PSW_BATCH.id}&city=brampton&operations=all`,
  cityLink,
);
check(
  "the drill-down keys are exactly the seven drill-down values",
  same(PLANNING_DRILLDOWN_KEYS, ["area", "exception", "status", "availability", "city", "need", "requirement"]) &&
    Object.values(clearedDrilldown).every((value) => value === ""),
);
check(
  "a plain href keeps the current drill-down and changes one value",
  planningHref("/placement/planning", deep, { status: "on_hold" }) ===
    `/placement/planning?batch=${PSW_BATCH.id}&area=${PEEL.id}&status=on_hold&availability=available_now&operations=all`,
);
check(
  "a need link carries the kind and the requirement",
  planningDrilldownHref("/placement/planning", overview, { need: "action", requirement: "abc" }) ===
    `/placement/planning?batch=${PSW_BATCH.id}&need=action&requirement=abc`,
);
check(
  "URL values round-trip through the parser",
  (() => {
    const href = planningDrilldownHref("/placement/planning", overview, { need: "review", requirement: R_VSC.id });
    const params = Object.fromEntries(new URL(`http://x${href}`).searchParams.entries());
    const parsed = planningValuesFrom(params);
    return parsed.need === "review" && parsed.requirement === R_VSC.id && parsed.batch === PSW_BATCH.id;
  })(),
);
check(
  "empty planning values carry every key",
  Object.keys(emptyPlanningValues).length === 9 &&
    "city" in emptyPlanningValues &&
    "need" in emptyPlanningValues &&
    "requirement" in emptyPlanningValues,
);

// ---------------------------------------------------------------------------
// F. Current operations
// ---------------------------------------------------------------------------

section("F. Current operations");

const defaults = planningBatchChoices(planningValuesFrom({}), BATCHES);
check(
  "default choices are tracked active batches only",
  same(defaults.map((b) => b.id), [PSW_BATCH.id, ECEA_BATCH.id]),
);
check(
  "the default batch is the most recent tracked active batch",
  resolveBatch(planningValuesFrom({}), BATCHES)?.id === ECEA_BATCH.id,
);
check(
  "a direct URL to an untracked batch still opens it",
  resolveBatch(planningValuesFrom({ batch: OLD_BATCH.id }), BATCHES)?.id === OLD_BATCH.id,
);
check(
  "a direct URL to an archived batch still opens it and adds it to the choices",
  resolveBatch(planningValuesFrom({ batch: ARCHIVED_BATCH.id }), BATCHES)?.id === ARCHIVED_BATCH.id &&
    planningBatchChoices(planningValuesFrom({ batch: ARCHIVED_BATCH.id }), BATCHES).some(
      (b) => b.id === ARCHIVED_BATCH.id,
    ),
);
check(
  "Show all batches lists every batch",
  planningBatchChoices(planningValuesFrom({ operations: "all" }), BATCHES).length === BATCHES.length,
);
check(
  "a historical drill-down keeps the historical batch in the link",
  planningDrilldownHref("/placement/planning", planningValuesFrom({ batch: OLD_BATCH.id, operations: "all" }), { city: "toronto" }) ===
    `/placement/planning?batch=${OLD_BATCH.id}&city=toronto&operations=all`,
);
check(
  "the same grouping works for PSW and ECEA with one code path",
  ecea.areas.find((g) => g.area.id === PEEL.id)?.counts.total === 1 &&
    ecea.areas.find((g) => g.area.id === TORONTO.id)?.counts.total === 1 &&
    ecea.cities.reduce((t, c) => t + c.count, 0) === ecea.counts.total,
);

// ---------------------------------------------------------------------------
// G. Existing functionality
// ---------------------------------------------------------------------------

section("G. Existing functionality");

check(
  "Find Placement is offered only to a ready student with no live placement",
  canOfferFindPlacement(student("x", PSW_BATCH, "Toronto", "ready_for_placement")) &&
    !canOfferFindPlacement(student("x", PSW_BATCH, "Toronto", "documents_pending")) &&
    !canOfferFindPlacement(
      student("x", PSW_BATCH, "Toronto", "ready_for_placement", {
        currentPlacement: placementAt("p1", "assigned"),
      }),
    ) &&
    !canOfferFindPlacement(student("x", PSW_BATCH, "Toronto", "placement_assigned")),
);

const pageSource = sourceOf("src/app/(app)/placement/planning/page.tsx");
const componentSources = fs
  .readdirSync(path.join(process.cwd(), "src", "components", "planning"))
  .map((name) => sourceOf(path.join("src", "components", "planning", name)));
const libSources = ["batch.ts", "needs.ts", "filters.ts", "queries.ts", "constants.ts", "mapping.ts", "city.ts"].map(
  (name) => sourceOf(path.join("src", "lib", "planning", name)),
);
const planningSurface = [pageSource, ...componentSources, ...libSources].join("\n");

check(
  "the planning page gates Find Placement on the existing permission",
  pageSource.includes("canManagePlacements(session)") &&
    componentSources.some((s) => s.includes("canManage && canOfferFindPlacement(student)")) &&
    componentSources.some((s) => s.includes("/placement/find/")),
);
check(
  "the planning surface imports no server action",
  !/from\s+"@\/lib\/[a-z-]+\/actions"/.test(planningSurface) &&
    !/from\s+"\.\/actions"/.test(planningSurface) &&
    !planningSurface.includes('"use server"'),
);
check(
  "the planning reads never insert, update, upsert, or delete",
  !/\.(insert|update|upsert|delete)\(/.test(planningSurface) &&
    !/\.rpc\(/.test(planningSurface),
);
check(
  "the planning surface sends no email",
  !/resend|sendEmail|student_email_log/i.test(planningSurface),
);

const queriesSource = sourceOf("src/lib/planning/queries.ts");
check(
  "the checklist read selects only student_id, requirement_id, status",
  queriesSource.includes('.select("student_id, requirement_id, status")') &&
    !/select\([^)]*\bnote\b/.test(queriesSource) &&
    !/select\([^)]*student_message/.test(queriesSource),
);
check(
  "the requirement read does not select the description",
  !/select\([^)]*description/.test(queriesSource),
);

// ---------------------------------------------------------------------------
// H. Serology / Blood Report inspection (definitions only, never changed)
// ---------------------------------------------------------------------------

section("H. Serology / Blood Report: inspection only");

const seed = fs.readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "0002_placement_documents.sql"),
  "utf8",
);
check(
  "both Serology Report and Blood Report are seeded as separate requirements",
  seed.includes("('Serology Report', 'Serology'") && seed.includes("('Blood Report', 'Blood'"),
);
const laterMigrations = fs
  .readdirSync(path.join(process.cwd(), "supabase", "migrations"))
  .filter((name) => !name.startsWith("0002") && name > "0002" && name.endsWith(".sql"))
  .map((name) => fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", name), "utf8"))
  .join("\n");
check(
  "no later migration renames, archives, merges, or deletes either requirement",
  !/serology|blood report/i.test(
    laterMigrations
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n"),
  ),
);
check(
  "this ticket adds no migration",
  !fs.existsSync(path.join(process.cwd(), "supabase", "migrations", "0011_batch_planning_visibility.sql")) &&
    fs.readdirSync(path.join(process.cwd(), "supabase", "migrations")).filter((n) => n.endsWith(".sql")).length === 10,
);
check(
  "both requirements surface under their own database names in the summary",
  byName(needs.review.requirements).includes("Serology Report") &&
    byName(needs.review.requirements).includes("Blood Report"),
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
