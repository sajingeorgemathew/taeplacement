/**
 * Checks for PLACEMENT-07A: programs, the current-operations rule, the
 * program dashboard counts, program filtering, the batch tracking setting,
 * and the default working scope of the Placement, Students, and Batch
 * Planning pages.
 *
 *   npx tsx scripts/check-program-operations.ts
 *
 * ---------------------------------------------------------------------------
 * This script NEVER touches the database and NEVER sends anything
 * ---------------------------------------------------------------------------
 *
 * It imports only pure modules: the program vocabulary, the operations rule
 * and summary builder, the two filter parsers, the form schemas, and the
 * tracking form helpers. It also reads migration 0010 as text, to assert on
 * what the SQL does rather than on what a comment says about it.
 *
 * The fixtures are invented placeholders and deliberately not real students.
 */

import fs from "node:fs";
import path from "node:path";

import {
  placementTrackingChangeFrom,
  placementTrackingUpdate,
} from "../src/lib/batches/tracking";
import {
  DEFAULT_PROGRAM,
  PROGRAM_OPTIONS,
  isProgram,
  type PlacementStatus,
} from "../src/lib/placement/constants";
import {
  clearedPlacementValues,
  hasActivePlacementFilters,
  isCurrentOperationsView,
  placementFiltersFrom,
  placementHref,
  placementScopeFrom,
  placementToolbarValuesFrom,
} from "../src/lib/placement/filters";
import {
  ALL_STUDENTS_VALUE,
  batchChoicesForScope,
  buildProgramOperationsSummary,
  buildProgramOverview,
  CURRENT_OPERATIONS_VALUE,
  emptyProgramOperationsSummary,
  historicalBatches,
  isCurrentOperationsValue,
  isOperationalBatch,
  isTrackedStudent,
  isTrackedStudentRow,
  OPERATIONS_PARAM,
  operationalBatches,
  operationsScopeFrom,
  PROGRAM_PRIMARY_STAGES,
  PROGRAM_SECONDARY_STAGES,
  programOperationsHref,
  type OverviewBatchShape,
  type SummaryBatchShape,
  type SummaryStudentShape,
} from "../src/lib/placement/operations";
import type { PlacementFilters } from "../src/lib/placement/queries";
import {
  planningBatchChoices,
  planningHref,
  planningScopeFrom,
  planningValuesFrom,
  resolveBatch,
} from "../src/lib/planning/filters";
import {
  batchOptionsForProgram,
  clearedToolbarValues,
  hasActiveFilters,
  studentFiltersFrom,
  studentHref,
  studentRosterFiltersFrom,
  studentScopeFrom,
  toolbarValuesFrom,
} from "../src/lib/students/filters";
import type { StudentFilters } from "../src/lib/students/queries";
import type { BatchRow } from "../src/lib/supabase/database.types";
import {
  BatchFormSchema,
  StudentFormSchema,
  batchFormDataToObject,
  studentFormDataToObject,
} from "../src/lib/students/schema";

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

function migrationSource(name: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), "supabase", "migrations", `${name}.sql`),
    "utf8",
  );
}

/**
 * The migration with every `--` comment and every string literal removed:
 * statements only. The column COMMENT is a string literal that talks about
 * deleting and archiving, so a check on what the SQL DOES has to look past
 * what the SQL SAYS.
 */
function migrationStatements(name: string): string {
  return migrationSource(name)
    .split("\n")
    .map((line) => {
      const comment = line.indexOf("--");
      return comment === -1 ? line : line.slice(0, comment);
    })
    .join("\n")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BATCH_PSW_CURRENT = "00000000-0000-4000-8000-000000000001";
const BATCH_PSW_APRIL = "00000000-0000-4000-8000-000000000002";
const BATCH_PSW_ARCHIVED_ON = "00000000-0000-4000-8000-000000000003";
const BATCH_ECEA_CURRENT = "00000000-0000-4000-8000-000000000004";
const BATCH_ECEA_OFF = "00000000-0000-4000-8000-000000000005";

const batches: SummaryBatchShape[] = [
  { id: BATCH_PSW_CURRENT, status: "active", placement_tracking_enabled: true },
  // The old batch: still active in the database, deliberately not tracked.
  { id: BATCH_PSW_APRIL, status: "active", placement_tracking_enabled: false },
  // Archived with the flag still on: archived wins.
  {
    id: BATCH_PSW_ARCHIVED_ON,
    status: "archived",
    placement_tracking_enabled: true,
  },
  { id: BATCH_ECEA_CURRENT, status: "active", placement_tracking_enabled: true },
  { id: BATCH_ECEA_OFF, status: "active", placement_tracking_enabled: false },
];

function student(
  program: string,
  batchId: string | null,
  placementStatus: PlacementStatus,
  isActive = true,
): SummaryStudentShape {
  return {
    program,
    batch_id: batchId,
    placement_status: placementStatus,
    is_active: isActive,
  };
}

const students: SummaryStudentShape[] = [
  // Current PSW batch: 6 tracked students across the statuses.
  student("PSW", BATCH_PSW_CURRENT, "documents_pending"),
  student("PSW", BATCH_PSW_CURRENT, "documents_pending"),
  student("PSW", BATCH_PSW_CURRENT, "ready_for_placement"),
  student("PSW", BATCH_PSW_CURRENT, "placement_assigned"),
  student("PSW", BATCH_PSW_CURRENT, "placement_started"),
  student("PSW", BATCH_PSW_CURRENT, "on_hold"),
  // Inactive record in the current batch: never counted.
  student("PSW", BATCH_PSW_CURRENT, "ready_for_placement", false),
  // Old April batch: many students, all excluded.
  student("PSW", BATCH_PSW_APRIL, "ready_for_placement"),
  student("PSW", BATCH_PSW_APRIL, "placement_started"),
  student("PSW", BATCH_PSW_APRIL, "placement_completed"),
  student("PSW", BATCH_PSW_APRIL, "documents_pending"),
  // Archived batch with the flag on: excluded.
  student("PSW", BATCH_PSW_ARCHIVED_ON, "placement_completed"),
  // No batch at all: excluded.
  student("PSW", null, "ready_for_placement"),
  // Current ECEA batch: 4 tracked students.
  student("ECEA", BATCH_ECEA_CURRENT, "needs_review"),
  student("ECEA", BATCH_ECEA_CURRENT, "documents_pending"),
  student("ECEA", BATCH_ECEA_CURRENT, "ready_for_placement"),
  student("ECEA", BATCH_ECEA_CURRENT, "placement_completed"),
  // ECEA batch not yet switched on: excluded.
  student("ECEA", BATCH_ECEA_OFF, "ready_for_placement"),
  // A program outside the supported list, in a tracked batch: no card for it.
  student("Other", BATCH_PSW_CURRENT, "ready_for_placement"),
];

const batchesById = new Map(batches.map((batch) => [batch.id, batch]));

// ---------------------------------------------------------------------------
// A. Programs
// ---------------------------------------------------------------------------

section("A. Programs");

check("PSW is a supported program", isProgram("PSW"));
check("ECEA is a supported program", isProgram("ECEA"));
check(
  "PSW and ECEA are the two program options, in that order",
  PROGRAM_OPTIONS.length === 2 &&
    PROGRAM_OPTIONS[0] === "PSW" &&
    PROGRAM_OPTIONS[1] === "ECEA",
);
check("the default program is still PSW", DEFAULT_PROGRAM === "PSW");
check("lower-case psw is not a program", !isProgram("psw"));
check("an empty string is not a program", !isProgram(""));
check("a non-string is not a program", !isProgram(null) && !isProgram(7));

function studentForm(program: string | null) {
  const form = new FormData();
  form.set("student_number", "T-0001");
  form.set("first_name", "Placeholder");
  form.set("placement_status", "needs_review");
  form.set("document_status", "not_reviewed");
  if (program !== null) form.set("program", program);
  return studentFormDataToObject(form);
}

const pswStudent = StudentFormSchema.safeParse(studentForm("PSW"));
const eceaStudent = StudentFormSchema.safeParse(studentForm("ECEA"));
const defaultStudent = StudentFormSchema.safeParse(studentForm(null));

check("student form accepts PSW", pswStudent.success && pswStudent.data.program === "PSW");
check(
  "student form accepts ECEA",
  eceaStudent.success && eceaStudent.data.program === "ECEA",
);
check(
  "student form without a program still defaults to PSW",
  defaultStudent.success && defaultStudent.data.program === "PSW",
);

function batchForm(program: string | null) {
  const form = new FormData();
  form.set("name", "Placeholder Batch");
  form.set("status", "active");
  if (program !== null) form.set("program", program);
  return batchFormDataToObject(form);
}

const pswBatch = BatchFormSchema.safeParse(batchForm("PSW"));
const eceaBatch = BatchFormSchema.safeParse(batchForm("ECEA"));
const defaultBatch = BatchFormSchema.safeParse(batchForm(null));

check("batch form accepts PSW", pswBatch.success && pswBatch.data.program === "PSW");
check("batch form accepts ECEA", eceaBatch.success && eceaBatch.data.program === "ECEA");
check(
  "batch form without a program still defaults to PSW",
  defaultBatch.success && defaultBatch.data.program === "PSW",
);
check(
  "the batch form never carries the tracking flag, so Save Batch cannot change it",
  pswBatch.success && !("placement_tracking_enabled" in pswBatch.data),
);

// ---------------------------------------------------------------------------
// B. Operational batch rule
// ---------------------------------------------------------------------------

section("B. Operational batch rule");

check(
  "active + tracking ON is included",
  isOperationalBatch({ status: "active", placement_tracking_enabled: true }),
);
check(
  "active + tracking OFF is excluded",
  !isOperationalBatch({ status: "active", placement_tracking_enabled: false }),
);
check(
  "archived + tracking ON is excluded",
  !isOperationalBatch({ status: "archived", placement_tracking_enabled: true }),
);
check(
  "archived + tracking OFF is excluded",
  !isOperationalBatch({ status: "archived", placement_tracking_enabled: false }),
);
check("a missing batch is excluded", !isOperationalBatch(null) && !isOperationalBatch(undefined));
check(
  "a batch row read before the migration (flag undefined) is excluded, not crashed on",
  !isOperationalBatch({
    status: "active",
    placement_tracking_enabled: undefined as unknown as boolean,
  }),
);

check(
  "an active student in a tracked batch is tracked",
  isTrackedStudent({ is_active: true, batch_id: BATCH_PSW_CURRENT }, batchesById),
);
check(
  "an active student in an untracked batch is not tracked",
  !isTrackedStudent({ is_active: true, batch_id: BATCH_PSW_APRIL }, batchesById),
);
check(
  "an active student in an archived batch is not tracked even with the flag on",
  !isTrackedStudent(
    { is_active: true, batch_id: BATCH_PSW_ARCHIVED_ON },
    batchesById,
  ),
);
check(
  "a student without a batch is not tracked",
  !isTrackedStudent({ is_active: true, batch_id: null }, batchesById),
);
check(
  "an inactive student is not tracked even in a tracked batch",
  !isTrackedStudent({ is_active: false, batch_id: BATCH_PSW_CURRENT }, batchesById),
);
check(
  "a student pointing at an unknown batch id is not tracked",
  !isTrackedStudent(
    { is_active: true, batch_id: "00000000-0000-4000-8000-0000000000ff" },
    batchesById,
  ),
);

// ---------------------------------------------------------------------------
// C. Program counts
// ---------------------------------------------------------------------------

section("C. Program counts");

const summary = buildProgramOperationsSummary(students, batches);
const psw = summary.PSW;
const ecea = summary.ECEA;

check("a summary exists for every supported program", Boolean(psw) && Boolean(ecea));
check(
  "PSW total counts only the current batch (6), not April, archived, no-batch, or inactive",
  psw.totalTrackedStudents === 6,
  String(psw.totalTrackedStudents),
);
check("PSW documents pending = 2", psw.documentsPending === 2);
check("PSW ready = 1 (April's ready students are excluded)", psw.readyForPlacement === 1);
check("PSW assigned = 1", psw.placementAssigned === 1);
check("PSW on placement = 1 (April's started student is excluded)", psw.onPlacement === 1);
check(
  "PSW completed = 0 (April and archived completions are excluded)",
  psw.placementCompleted === 0,
);
check("PSW on hold = 1", psw.onHold === 1);
check("PSW needs review = 0", psw.needsReview === 0);

check(
  "ECEA total counts only the tracked ECEA batch (4)",
  ecea.totalTrackedStudents === 4,
  String(ecea.totalTrackedStudents),
);
check("ECEA needs review = 1", ecea.needsReview === 1);
check("ECEA documents pending = 1", ecea.documentsPending === 1);
check("ECEA ready = 1 (the untracked ECEA batch is excluded)", ecea.readyForPlacement === 1);
check("ECEA assigned = 0", ecea.placementAssigned === 0);
check("ECEA on placement = 0", ecea.onPlacement === 0);
check("ECEA completed = 1", ecea.placementCompleted === 1);
check("ECEA on hold = 0", ecea.onHold === 0);

function statusSum(s: typeof psw): number {
  return (
    s.needsReview +
    s.documentsPending +
    s.readyForPlacement +
    s.placementAssigned +
    s.onPlacement +
    s.placementCompleted +
    s.onHold
  );
}
check("PSW status counts add up to the PSW total", statusSum(psw) === psw.totalTrackedStudents);
check("ECEA status counts add up to the ECEA total", statusSum(ecea) === ecea.totalTrackedStudents);
check(
  "a student with an unsupported program is on neither card",
  psw.totalTrackedStudents + ecea.totalTrackedStudents === 10,
);

const nothingTracked = buildProgramOperationsSummary(
  students,
  batches.map((batch) => ({ ...batch, placement_tracking_enabled: false })),
);
check(
  "with every flag off both programs still render, with zeros",
  nothingTracked.PSW.totalTrackedStudents === 0 &&
    nothingTracked.ECEA.totalTrackedStudents === 0,
);
check(
  "an empty roster yields the empty summary for both programs",
  JSON.stringify(buildProgramOperationsSummary([], [])) ===
    JSON.stringify({
      PSW: emptyProgramOperationsSummary("PSW"),
      ECEA: emptyProgramOperationsSummary("ECEA"),
    }),
);

check(
  "the five primary stages are the lifecycle in order",
  PROGRAM_PRIMARY_STAGES.map((stage) => stage.status).join(",") ===
    "documents_pending,ready_for_placement,placement_assigned,placement_started,placement_completed",
);
check(
  "needs review and on hold are the secondary stages",
  PROGRAM_SECONDARY_STAGES.map((stage) => stage.status).join(",") ===
    "needs_review,on_hold",
);

// ---------------------------------------------------------------------------
// D. Filtering
// ---------------------------------------------------------------------------

section("D. Filtering");

// Students page filters.
const sPsw = studentFiltersFrom(toolbarValuesFrom({ program: "PSW" }));
check("students: program=PSW filters PSW", sPsw.program === "PSW");

const sEcea = studentFiltersFrom(toolbarValuesFrom({ program: "ECEA" }));
check("students: program=ECEA filters ECEA", sEcea.program === "ECEA");

const sCombo = studentFiltersFrom(
  toolbarValuesFrom({ program: "ECEA", placement: "ready_for_placement" }),
);
check(
  "students: program + status compose",
  sCombo.program === "ECEA" && sCombo.placementStatus === "ready_for_placement",
);

const sBatch = studentFiltersFrom(
  toolbarValuesFrom({ program: "PSW", batch: BATCH_PSW_CURRENT }),
);
check(
  "students: program + batch compose",
  sBatch.program === "PSW" && sBatch.batchId === BATCH_PSW_CURRENT,
);

const sInvalid = studentFiltersFrom(
  toolbarValuesFrom({ program: "NURSING", placement: "ready_for_placement" }),
);
check(
  "students: an invalid program is ignored and the other filters survive",
  sInvalid.program === undefined &&
    sInvalid.placementStatus === "ready_for_placement",
);

const sAll = studentFiltersFrom(
  toolbarValuesFrom({
    q: "amina",
    program: "PSW",
    batch: BATCH_PSW_CURRENT,
    placement: "documents_pending",
    document: "pending",
    returning: "no",
  }),
);
check(
  "students: program composes with search, batch, placement, document, returning",
  sAll.search === "amina" &&
    sAll.program === "PSW" &&
    sAll.batchId === BATCH_PSW_CURRENT &&
    sAll.placementStatus === "documents_pending" &&
    sAll.documentStatus === "pending" &&
    sAll.returning === "no",
);
check(
  "students: a program alone counts as an active filter",
  hasActiveFilters(toolbarValuesFrom({ program: "ECEA" })),
);
check(
  "students: an array program value takes its first entry",
  toolbarValuesFrom({ program: ["ECEA", "PSW"] }).program === "ECEA",
);

// Placement page filters.
const pPsw = placementFiltersFrom(placementToolbarValuesFrom({ program: "PSW" }));
check("placement: program=PSW filters PSW", pPsw.program === "PSW");

const pEcea = placementFiltersFrom(placementToolbarValuesFrom({ program: "ECEA" }));
check("placement: program=ECEA filters ECEA", pEcea.program === "ECEA");

const pCombo = placementFiltersFrom(
  placementToolbarValuesFrom({
    view: "list",
    program: "ECEA",
    status: "placement_started",
  }),
);
check(
  "placement: program + status compose",
  pCombo.program === "ECEA" && pCombo.placementStatus === "placement_started",
);

const pBatch = placementFiltersFrom(
  placementToolbarValuesFrom({ program: "ECEA", batch: BATCH_ECEA_CURRENT }),
);
check(
  "placement: program + batch compose",
  pBatch.program === "ECEA" && pBatch.batchId === BATCH_ECEA_CURRENT,
);

const pInvalid = placementFiltersFrom(
  placementToolbarValuesFrom({ program: "psw", status: "on_hold" }),
);
check(
  "placement: an invalid program is ignored and the status survives",
  pInvalid.program === undefined && pInvalid.placementStatus === "on_hold",
);

const pAll = placementFiltersFrom(
  placementToolbarValuesFrom({
    q: "sunrise",
    program: "PSW",
    batch: BATCH_PSW_CURRENT,
    status: "placement_assigned",
    document: "ready",
    area: "area-1",
    partner: "partner-1",
    view: "list",
  }),
);
check(
  "placement: program composes with search, batch, status, document, area, partner",
  pAll.search === "sunrise" &&
    pAll.program === "PSW" &&
    pAll.batchId === BATCH_PSW_CURRENT &&
    pAll.placementStatus === "placement_assigned" &&
    pAll.documentStatus === "ready" &&
    pAll.areaId === "area-1" &&
    pAll.partnerId === "partner-1",
);
check(
  "placement: a program alone counts as an active filter",
  hasActivePlacementFilters(placementToolbarValuesFrom({ program: "PSW" })),
);

// URL round trips.
const values = placementToolbarValuesFrom({
  view: "list",
  program: "ECEA",
  status: "ready_for_placement",
});
const changed = placementHref("/placement", values, { batch: BATCH_ECEA_CURRENT });
const reparsed = placementToolbarValuesFrom(
  Object.fromEntries(new URL(changed, "http://x").searchParams.entries()),
);
check(
  "placement: changing one filter keeps program, status, and view in the URL",
  reparsed.program === "ECEA" &&
    reparsed.status === "ready_for_placement" &&
    reparsed.view === "list" &&
    reparsed.batch === BATCH_ECEA_CURRENT,
);
check(
  "placement: clearing the program removes it from the URL",
  !placementHref("/placement", values, { program: "" }).includes("program="),
);

// The current-operations parameter.
check(
  "operations: the parameter is called operations and the value is current",
  OPERATIONS_PARAM === "operations" && CURRENT_OPERATIONS_VALUE === "current",
);
check(
  "operations=current turns the filter on",
  placementFiltersFrom(placementToolbarValuesFrom({ operations: "current" }))
    .currentOperations === true,
);
check(
  "operations=all turns the filter off",
  placementFiltersFrom(placementToolbarValuesFrom({ operations: "all" }))
    .currentOperations === undefined,
);
for (const bad of ["", "Current", "All", "true", "1", "yes", "nope"]) {
  const parsed = placementFiltersFrom(
    placementToolbarValuesFrom({ operations: bad, status: "on_hold" }),
  );
  check(
    `operations=${JSON.stringify(bad)} is the default scope (current) and the status survives`,
    parsed.currentOperations === true && parsed.placementStatus === "on_hold",
  );
}
check(
  "the scope is not a filter: operations=current alone is not an active filter",
  !hasActivePlacementFilters(placementToolbarValuesFrom({ operations: "current" })),
);
check(
  "the scope is not a filter: operations=all alone is not an active filter",
  !hasActivePlacementFilters(placementToolbarValuesFrom({ operations: "all" })),
);
check(
  "isCurrentOperationsView is true by default and false only for operations=all",
  isCurrentOperationsView(placementToolbarValuesFrom({ operations: "current" })) &&
    isCurrentOperationsView(placementToolbarValuesFrom({})) &&
    !isCurrentOperationsView(placementToolbarValuesFrom({ operations: "all" })),
);
check(
  "an array operations value takes its first entry",
  isCurrentOperationsValue(
    placementToolbarValuesFrom({ operations: ["current", "x"] }).operations,
  ),
);
const opsValues = placementToolbarValuesFrom({
  view: "list",
  operations: "current",
  program: "PSW",
  status: "placement_started",
});
check(
  "changing another filter keeps operations=current in the URL",
  placementHref("/placement", opsValues, { batch: BATCH_PSW_CURRENT }).includes(
    "operations=current",
  ),
);
check(
  "clearing operations removes it and keeps the rest",
  (() => {
    const href = placementHref("/placement", opsValues, { operations: "" });
    return (
      !href.includes("operations=") &&
      href.includes("program=PSW") &&
      href.includes("status=placement_started") &&
      href.includes("view=list")
    );
  })(),
);

// Dashboard links.
check(
  "dashboard: ECEA Ready links to the current-operations Placement List",
  programOperationsHref("ECEA", "ready_for_placement") ===
    "/placement?view=list&operations=current&program=ECEA&status=ready_for_placement",
  programOperationsHref("ECEA", "ready_for_placement"),
);
check(
  "dashboard: ECEA On Placement links to placement_started",
  programOperationsHref("ECEA", "placement_started") ===
    "/placement?view=list&operations=current&program=ECEA&status=placement_started",
);
check(
  "dashboard: PSW Documents Pending links to documents_pending",
  programOperationsHref("PSW", "documents_pending") ===
    "/placement?view=list&operations=current&program=PSW&status=documents_pending",
);
check(
  "dashboard: a program link without a status is the whole tracked program list",
  programOperationsHref("PSW") ===
    "/placement?view=list&operations=current&program=PSW",
);
for (const stage of [...PROGRAM_PRIMARY_STAGES, ...PROGRAM_SECONDARY_STAGES]) {
  const parsed = placementFiltersFrom(
    placementToolbarValuesFrom(
      Object.fromEntries(
        new URL(programOperationsHref("ECEA", stage.status), "http://x")
          .searchParams.entries(),
      ),
    ),
  );
  check(
    `dashboard: the ${stage.label} link parses back to operations + program + status`,
    parsed.currentOperations === true &&
      parsed.program === "ECEA" &&
      parsed.placementStatus === stage.status,
  );
}

// Batch options once a program is chosen.
const toolbarBatches = [
  { id: "b1", program: "PSW" },
  { id: "b2", program: "ECEA" },
  { id: "b3", program: "PSW" },
];
check(
  "toolbar: no program offers every batch",
  batchOptionsForProgram(toolbarBatches, "", "").length === 3,
);
check(
  "toolbar: program=ECEA offers only ECEA batches",
  batchOptionsForProgram(toolbarBatches, "ECEA", "")
    .map((batch) => batch.id)
    .join(",") === "b2",
);
check(
  "toolbar: a batch already in the URL stays selectable across a program change",
  batchOptionsForProgram(toolbarBatches, "ECEA", "b1")
    .map((batch) => batch.id)
    .join(",") === "b1,b2",
);
check(
  "toolbar: an invalid program offers every batch",
  batchOptionsForProgram(toolbarBatches, "nope", "").length === 3,
);

// ---------------------------------------------------------------------------
// E. Batch setting
// ---------------------------------------------------------------------------

section("E. Batch setting");

const onForm = new FormData();
onForm.set("batch_id", BATCH_PSW_CURRENT);
onForm.set("placement_tracking_enabled", "on");
const onChange = placementTrackingChangeFrom(onForm);
check(
  "a ticked checkbox reads as enabled for that batch",
  onChange?.batchId === BATCH_PSW_CURRENT && onChange.enabled === true,
);

const offForm = new FormData();
offForm.set("batch_id", BATCH_PSW_CURRENT);
const offChange = placementTrackingChangeFrom(offForm);
check(
  "an unticked checkbox (absent from the submission) reads as disabled",
  offChange?.batchId === BATCH_PSW_CURRENT && offChange.enabled === false,
);

const noBatch = new FormData();
noBatch.set("placement_tracking_enabled", "on");
check("a submission without a batch is refused", placementTrackingChangeFrom(noBatch) === null);

// The form carries extra fields, as a hostile or buggy client might send them.
// None of them may reach the update.
const noisyForm = new FormData();
noisyForm.set("batch_id", BATCH_PSW_CURRENT);
noisyForm.set("placement_tracking_enabled", "on");
noisyForm.set("status", "archived");
noisyForm.set("is_active", "false");
noisyForm.set("placement_status", "placement_completed");
const noisy = placementTrackingChangeFrom(noisyForm);
const update = placementTrackingUpdate(noisy?.enabled ?? false);
check(
  "the update contains exactly one key, placement_tracking_enabled",
  Object.keys(update).join(",") === "placement_tracking_enabled" &&
    update.placement_tracking_enabled === true,
  JSON.stringify(update),
);
check(
  "the update never carries a batch status, student status, or is_active",
  !("status" in update) && !("is_active" in update) && !("placement_status" in update),
);
check(
  "disabling produces the same single-key update with false",
  JSON.stringify(placementTrackingUpdate(false)) ===
    '{"placement_tracking_enabled":false}',
);

// The migration, statements only.
const sql = migrationStatements("0010_batch_placement_tracking");
check(
  "0010 adds placement_tracking_enabled as boolean not null default false",
  sql.includes(
    "alter table public.batches add column if not exists placement_tracking_enabled boolean not null default false",
  ),
);
check("0010 comments on the column", migrationSource("0010_batch_placement_tracking").includes(
  "comment on column public.batches.placement_tracking_enabled",
));
check("0010 never drops anything", !/\bdrop\b/.test(sql));
check("0010 never deletes or truncates", !/\b(delete|truncate)\b/.test(sql));
check("0010 never updates or inserts rows", !/\b(update|insert)\b/.test(sql));
check(
  "0010 never touches students, placements, documents, or the email log",
  !/public\.(students|student_placements|student_placement_documents|student_email_log)/.test(
    sql,
  ),
);
check(
  "0010 adds no policy and no function, so the 0001 batch permissions are unchanged",
  !/\b(create policy|create or replace function|create function|grant|revoke)\b/.test(sql),
);

// ---------------------------------------------------------------------------
// F. Dashboard count and drill-down list agree
// ---------------------------------------------------------------------------

section("F. Dashboard count and drill-down population");

/**
 * A student row as the Placement List reads it: the batch joined in. The same
 * fixture roster as the dashboard summary above, so the two can be compared.
 */
type JoinedRow = SummaryStudentShape & {
  batch: SummaryBatchShape | null;
};

const joinedRows: JoinedRow[] = students.map((s) => ({
  ...s,
  batch: s.batch_id ? (batchesById.get(s.batch_id) ?? null) : null,
}));

/**
 * The filter path of listPlacementStudents(), reproduced over the fixture:
 * is_active and the three column equalities go to the database, current
 * operations is applied to the joined row through isTrackedStudentRow(). The
 * shape is what matters here; the rule itself is the shared import.
 */
function drillDown(filters: PlacementFilters): JoinedRow[] {
  let rows = joinedRows.filter((row) => row.is_active);
  if (filters.program) rows = rows.filter((row) => row.program === filters.program);
  if (filters.batchId) rows = rows.filter((row) => row.batch_id === filters.batchId);
  if (filters.placementStatus) {
    rows = rows.filter((row) => row.placement_status === filters.placementStatus);
  }
  if (filters.currentOperations) rows = rows.filter((row) => isTrackedStudentRow(row));
  return rows;
}

function filtersForHref(href: string): PlacementFilters {
  return placementFiltersFrom(
    placementToolbarValuesFrom(
      Object.fromEntries(new URL(href, "http://x").searchParams.entries()),
    ),
  );
}

// Every clickable number on both cards must equal the length of the list its
// link opens.
for (const program of PROGRAM_OPTIONS) {
  const card = summary[program];
  check(
    `${program} total equals the ${program} drill-down list`,
    drillDown(filtersForHref(programOperationsHref(program))).length ===
      card.totalTrackedStudents,
  );
  for (const stage of [...PROGRAM_PRIMARY_STAGES, ...PROGRAM_SECONDARY_STAGES]) {
    const list = drillDown(filtersForHref(programOperationsHref(program, stage.status)));
    check(
      `${program} ${stage.label} count (${card[stage.field]}) equals its drill-down list`,
      list.length === card[stage.field],
      `list had ${list.length}`,
    );
  }
}

// The exclusions, seen from the list side.
const pswReadyCurrent = drillDown(
  filtersForHref(programOperationsHref("PSW", "ready_for_placement")),
);
check(
  "drill-down: the April-style untracked batch is excluded",
  pswReadyCurrent.every((row) => row.batch_id !== BATCH_PSW_APRIL),
);
check(
  "drill-down: the tracked active batch is included",
  pswReadyCurrent.some((row) => row.batch_id === BATCH_PSW_CURRENT),
);
check(
  "drill-down: a student with no batch is excluded",
  pswReadyCurrent.every((row) => row.batch_id !== null),
);
const pswCompletedCurrent = drillDown(
  filtersForHref(programOperationsHref("PSW", "placement_completed")),
);
check(
  "drill-down: archived + tracking true is excluded",
  pswCompletedCurrent.length === 0 &&
    joinedRows.some(
      (row) =>
        row.batch_id === BATCH_PSW_ARCHIVED_ON &&
        row.placement_status === "placement_completed",
    ),
);
check(
  "drill-down: an inactive student is excluded",
  drillDown({ currentOperations: true, program: "PSW" }).every((row) => row.is_active),
);

// program + current operations + status compose, and dropping operations=current
// restores the ordinary list, April students and all.
const eceaReadyCurrent = drillDown({
  currentOperations: true,
  program: "ECEA",
  placementStatus: "ready_for_placement",
});
check(
  "program + operations + status: ECEA Ready is exactly the one tracked ECEA student",
  eceaReadyCurrent.length === 1 &&
    eceaReadyCurrent[0].batch_id === BATCH_ECEA_CURRENT,
);
const eceaReadyAll = drillDown({ program: "ECEA", placementStatus: "ready_for_placement" });
check(
  "without operations=current ECEA Ready also shows the untracked ECEA batch",
  eceaReadyAll.length === 2 &&
    eceaReadyAll.some((row) => row.batch_id === BATCH_ECEA_OFF),
);
const pswReadyAll = drillDown({ program: "PSW", placementStatus: "ready_for_placement" });
check(
  "without operations=current PSW Ready shows current, April, and no-batch students",
  pswReadyAll.length === 3 &&
    pswReadyAll.some((row) => row.batch_id === BATCH_PSW_APRIL) &&
    pswReadyAll.some((row) => row.batch_id === null),
);
check(
  "without any filter the ordinary list is every active student",
  drillDown({}).length === students.filter((s) => s.is_active).length,
);
check(
  "operations=all in the URL opens the ordinary PSW list, April and all",
  drillDown(filtersForHref("/placement?view=list&operations=all&program=PSW")).length ===
    drillDown({ program: "PSW" }).length,
);
check(
  "an unknown operations value in the URL is the default scope, not Show All",
  drillDown(filtersForHref("/placement?view=list&operations=nope&program=PSW")).length ===
    drillDown({ program: "PSW", currentOperations: true }).length,
);

// The two shapes of the one rule never disagree.
check(
  "isTrackedStudentRow agrees with isTrackedStudent on every fixture row",
  joinedRows.every(
    (row) => isTrackedStudentRow(row) === isTrackedStudent(row, batchesById),
  ),
);

// ---------------------------------------------------------------------------
// G. Default working scope: Placement, Students, program overview, planning
// ---------------------------------------------------------------------------

section("G. Default working scope");

// The one resolver behind every page.
check(
  "an absent value resolves to current",
  operationsScopeFrom("") === "current" && operationsScopeFrom(undefined) === "current",
);
check("current resolves to current", operationsScopeFrom("current") === "current");
check("all resolves to all", operationsScopeFrom("all") === "all");
check(
  "unknown values resolve to current, never to all",
  ["All", "ALL", "everything", "true", "nope"].every(
    (value) => operationsScopeFrom(value) === "current",
  ),
);
check(
  "the Show All value is the word all",
  ALL_STUDENTS_VALUE === "all" && OPERATIONS_PARAM === "operations",
);

// --- Placement
const placementDefault = placementFiltersFrom(placementToolbarValuesFrom({}));
check(
  "placement: opened without a parameter it is current placement operations",
  placementDefault.currentOperations === true &&
    placementScopeFrom(placementToolbarValuesFrom({})) === "current",
);
const placementDefaultRows = drillDown(placementDefault);
check(
  "placement: the default scope excludes the untracked active April batch",
  placementDefaultRows.every((row) => row.batch_id !== BATCH_PSW_APRIL) &&
    placementDefaultRows.every((row) => row.batch_id !== BATCH_ECEA_OFF),
);
check(
  "placement: the default scope excludes archived + tracking true and no-batch students",
  placementDefaultRows.every(
    (row) => row.batch_id !== BATCH_PSW_ARCHIVED_ON && row.batch_id !== null,
  ),
);
check(
  "placement: the default scope is exactly the dashboard's tracked population",
  placementDefaultRows.length ===
    joinedRows.filter((row) => isTrackedStudent(row, batchesById)).length,
);
const placementAll = placementFiltersFrom(
  placementToolbarValuesFrom({ operations: "all" }),
);
const placementAllRows = drillDown(placementAll);
check(
  "placement: Show All restores the broader population, April, archived, and no-batch included",
  placementAll.currentOperations === undefined &&
    placementAllRows.length === students.filter((s) => s.is_active).length &&
    placementAllRows.some((row) => row.batch_id === BATCH_PSW_APRIL) &&
    placementAllRows.some((row) => row.batch_id === BATCH_PSW_ARCHIVED_ON) &&
    placementAllRows.some((row) => row.batch_id === null),
);
check(
  "placement: Show All is wider than the default, never narrower",
  placementAllRows.length > placementDefaultRows.length,
);

// The chosen scope survives the ordinary filters.
const allValues = placementToolbarValuesFrom({ operations: "all", view: "list" });
const allWithStatus = placementHref("/placement", allValues, {
  status: "ready_for_placement",
});
check(
  "placement: choosing a status keeps operations=all in the URL",
  allWithStatus.includes("operations=all") &&
    allWithStatus.includes("status=ready_for_placement"),
);
const allWithProgram = filtersForHref(
  placementHref("/placement", allValues, { program: "PSW", batch: BATCH_PSW_APRIL }),
);
check(
  "placement: program + batch compose inside Show All and still reach April",
  allWithProgram.currentOperations === undefined &&
    allWithProgram.program === "PSW" &&
    allWithProgram.batchId === BATCH_PSW_APRIL &&
    drillDown(allWithProgram).length === 4,
);
const allCleared = placementHref("/placement", {
  ...allValues,
  q: "x",
  program: "PSW",
  status: "on_hold",
}, clearedPlacementValues());
check(
  "placement: Clear filters keeps Show All and the view, drops the filters",
  allCleared.includes("operations=all") &&
    allCleared.includes("view=list") &&
    !allCleared.includes("program=") &&
    !allCleared.includes("status=") &&
    !allCleared.includes("q="),
);
check(
  "placement: switching back to current removes the parameter entirely",
  !placementHref("/placement", allValues, { operations: "" }).includes("operations="),
);
const currentWithFilters = filtersForHref(
  placementHref("/placement", placementToolbarValuesFrom({}), {
    program: "ECEA",
    status: "ready_for_placement",
  }),
);
check(
  "placement: program + status inside the default scope is the one tracked ECEA student",
  currentWithFilters.currentOperations === true &&
    drillDown(currentWithFilters).length === 1 &&
    drillDown(currentWithFilters)[0].batch_id === BATCH_ECEA_CURRENT,
);
check(
  "placement: dashboard links (operations=current) resolve to the same default scope",
  placementScopeFrom(
    placementToolbarValuesFrom(
      Object.fromEntries(
        new URL(programOperationsHref("PSW"), "http://x").searchParams.entries(),
      ),
    ),
  ) === "current",
);

// --- Students
/** The filter path of listStudents(), reproduced over the same fixture. */
function roster(filters: StudentFilters): JoinedRow[] {
  let rows = joinedRows.filter((row) => row.is_active);
  if (filters.program) rows = rows.filter((row) => row.program === filters.program);
  if (filters.batchId) rows = rows.filter((row) => row.batch_id === filters.batchId);
  if (filters.placementStatus) {
    rows = rows.filter((row) => row.placement_status === filters.placementStatus);
  }
  if (filters.currentOperations) rows = rows.filter((row) => isTrackedStudentRow(row));
  return rows;
}

const studentsDefault = studentRosterFiltersFrom(toolbarValuesFrom({}));
const studentsDefaultRows = roster(studentsDefault);
check(
  "students: opened without a parameter the roster is current placement operations",
  studentsDefault.currentOperations === true &&
    studentScopeFrom(toolbarValuesFrom({})) === "current",
);
check(
  "students: the default roster excludes untracked active batches (April, ECEA off)",
  studentsDefaultRows.every(
    (row) => row.batch_id !== BATCH_PSW_APRIL && row.batch_id !== BATCH_ECEA_OFF,
  ),
);
check(
  "students: the default roster excludes archived + tracking true and no-batch students",
  studentsDefaultRows.every(
    (row) => row.batch_id !== BATCH_PSW_ARCHIVED_ON && row.batch_id !== null,
  ),
);
check(
  "students: the default roster equals the Placement default and the dashboard population",
  studentsDefaultRows.length === placementDefaultRows.length,
);
const studentsAll = studentRosterFiltersFrom(toolbarValuesFrom({ operations: "all" }));
const studentsAllRows = roster(studentsAll);
check(
  "students: Show All restores the broader active roster, April and archived included",
  studentsAll.currentOperations === undefined &&
    studentsAllRows.length === students.filter((s) => s.is_active).length &&
    studentsAllRows.some((row) => row.batch_id === BATCH_PSW_APRIL) &&
    studentsAllRows.some((row) => row.batch_id === BATCH_PSW_ARCHIVED_ON),
);
check(
  "students: an unknown operations value is the default scope, not Show All",
  studentRosterFiltersFrom(toolbarValuesFrom({ operations: "nope" }))
    .currentOperations === true,
);
check(
  "students: the scope-free filters (batch page, returning page) never carry the scope",
  studentFiltersFrom(toolbarValuesFrom({})).currentOperations === undefined &&
    studentFiltersFrom(toolbarValuesFrom({ operations: "all" })).currentOperations ===
      undefined,
);
check(
  "students: the scope is not a filter",
  !hasActiveFilters(toolbarValuesFrom({ operations: "all" })) &&
    !hasActiveFilters(toolbarValuesFrom({ operations: "current" })),
);
const studentsAllValues = toolbarValuesFrom({ operations: "all" });
const studentsAllSearch = studentHref("/students", studentsAllValues, {
  q: "amina",
  placement: "ready_for_placement",
});
check(
  "students: search + status keep operations=all in the URL",
  studentsAllSearch.includes("operations=all") &&
    studentsAllSearch.includes("q=amina") &&
    studentsAllSearch.includes("placement=ready_for_placement"),
);
const studentsAllProgramBatch = studentRosterFiltersFrom(
  toolbarValuesFrom({ operations: "all", program: "PSW", batch: BATCH_PSW_APRIL }),
);
check(
  "students: program + batch compose inside Show All and reach the April batch",
  studentsAllProgramBatch.currentOperations === undefined &&
    roster(studentsAllProgramBatch).length === 4,
);
const studentsCurrentProgram = studentRosterFiltersFrom(
  toolbarValuesFrom({ program: "PSW", placement: "ready_for_placement" }),
);
check(
  "students: program + status inside the default scope is the one tracked PSW ready student",
  roster(studentsCurrentProgram).length === 1 &&
    roster(studentsCurrentProgram)[0].batch_id === BATCH_PSW_CURRENT,
);
const studentsCleared = studentHref(
  "/students",
  { ...studentsAllValues, q: "x", program: "ECEA", returning: "yes" },
  clearedToolbarValues(),
);
check(
  "students: Clear filters keeps Show All and drops the filters",
  studentsCleared === "/students?operations=all",
  studentsCleared,
);
check(
  "students: switching back to current removes the parameter entirely",
  studentHref("/students", studentsAllValues, { operations: "" }) === "/students",
);

// --- Program overview
const overviewBatches: (OverviewBatchShape & { id: string })[] = [
  {
    id: BATCH_PSW_CURRENT,
    name: "PSW Current",
    program: "PSW",
    schedule_label: "Weekday",
    start_date: "2026-09-01",
    status: "active",
    placement_tracking_enabled: true,
  },
  {
    id: BATCH_PSW_APRIL,
    name: "PSW April",
    program: "PSW",
    schedule_label: null,
    start_date: "2026-04-01",
    status: "active",
    placement_tracking_enabled: false,
  },
  {
    id: BATCH_PSW_ARCHIVED_ON,
    name: "PSW Archived",
    program: "PSW",
    schedule_label: null,
    start_date: "2025-09-01",
    status: "archived",
    placement_tracking_enabled: true,
  },
  {
    id: BATCH_ECEA_CURRENT,
    name: "ECEA Current",
    program: "ECEA",
    schedule_label: "Weekend",
    start_date: null,
    status: "active",
    placement_tracking_enabled: true,
  },
  {
    id: BATCH_ECEA_OFF,
    name: "ECEA Off",
    program: "ECEA",
    schedule_label: null,
    start_date: "2026-06-01",
    status: "active",
    placement_tracking_enabled: false,
  },
];
const activeCountByBatch = new Map<string, number>();
for (const row of students) {
  if (!row.is_active || !row.batch_id) continue;
  activeCountByBatch.set(row.batch_id, (activeCountByBatch.get(row.batch_id) ?? 0) + 1);
}
const overview = buildProgramOverview(overviewBatches, summary, activeCountByBatch);
const overviewPsw = overview.find((p) => p.program === "PSW");
const overviewEcea = overview.find((p) => p.program === "ECEA");

check(
  "overview: PSW and ECEA both render, in that order",
  overview.map((p) => p.program).join(",") === "PSW,ECEA",
);
check(
  "overview: each program carries its code and full name",
  overviewPsw?.label === "PSW" &&
    overviewPsw.fullName === "Personal Support Worker" &&
    overviewEcea?.label === "ECEA" &&
    overviewEcea.fullName === "Early Childhood Education Assistant",
);
check(
  "overview: the program count is the dashboard's tracked count (PSW 6, ECEA 4)",
  overviewPsw?.trackedStudents === 6 && overviewEcea?.trackedStudents === 4,
);
check(
  "overview: PSW lists only its tracked active batch",
  overviewPsw?.batches.map((b) => b.id).join(",") === BATCH_PSW_CURRENT,
  overviewPsw?.batches.map((b) => b.name).join(","),
);
check(
  "overview: ECEA lists only its tracked active batch",
  overviewEcea?.batches.map((b) => b.id).join(",") === BATCH_ECEA_CURRENT,
);
check(
  "overview: an active but not tracked batch (April, ECEA off) is not shown",
  overview.every((p) =>
    p.batches.every((b) => b.id !== BATCH_PSW_APRIL && b.id !== BATCH_ECEA_OFF),
  ),
);
check(
  "overview: an archived batch with tracking true is not shown",
  overview.every((p) => p.batches.every((b) => b.id !== BATCH_PSW_ARCHIVED_ON)),
);
check(
  "overview: a batch row carries name, schedule label, start date, and its count",
  overviewPsw?.batches[0].name === "PSW Current" &&
    overviewPsw.batches[0].schedule_label === "Weekday" &&
    overviewPsw.batches[0].start_date === "2026-09-01" &&
    overviewPsw.batches[0].studentCount === activeCountByBatch.get(BATCH_PSW_CURRENT),
);
const secondPsw = {
  ...overviewBatches[0],
  id: "00000000-0000-4000-8000-000000000009",
  name: "PSW Second",
};
check(
  "overview: a program with two tracked batches lists both, in the given order",
  buildProgramOverview([...overviewBatches, secondPsw], summary, activeCountByBatch)
    .find((p) => p.program === "PSW")
    ?.batches.map((b) => b.name)
    .join(",") === "PSW Current,PSW Second",
);
const nothingOn = overviewBatches.map((b) => ({
  ...b,
  placement_tracking_enabled: false,
}));
const overviewNothing = buildProgramOverview(nothingOn, nothingTracked, activeCountByBatch);
check(
  "overview: both programs still render with zero and no batches when nothing is tracked",
  overviewNothing.length === 2 &&
    overviewNothing.every((p) => p.trackedStudents === 0 && p.batches.length === 0),
);
const onlyPsw = buildProgramOverview(
  overviewBatches.map((b) =>
    b.program === "ECEA" ? { ...b, placement_tracking_enabled: false } : b,
  ),
  buildProgramOperationsSummary(
    students,
    batches.map((b) =>
      b.id === BATCH_ECEA_CURRENT ? { ...b, placement_tracking_enabled: false } : b,
    ),
  ),
  activeCountByBatch,
);
check(
  "overview: ECEA still renders, with zero, when only PSW is tracked",
  onlyPsw.find((p) => p.program === "ECEA")?.trackedStudents === 0 &&
    onlyPsw.find((p) => p.program === "ECEA")?.batches.length === 0 &&
    onlyPsw.find((p) => p.program === "PSW")?.batches.length === 1,
);
check(
  "overview: historicalBatches is exactly the complement of operationalBatches",
  operationalBatches(overviewBatches).length + historicalBatches(overviewBatches).length ===
    overviewBatches.length &&
    historicalBatches(overviewBatches)
      .map((b) => b.id)
      .sort()
      .join(",") ===
      [BATCH_PSW_APRIL, BATCH_PSW_ARCHIVED_ON, BATCH_ECEA_OFF].sort().join(","),
);

// --- Batch Planning
const planningBatches: BatchRow[] = overviewBatches.map((b, index) => ({
  ...b,
  sort_order: index + 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}));

const planDefault = planningValuesFrom({});
check(
  "planning: the default scope is current",
  planningScopeFrom(planDefault) === "current",
);
check(
  "planning: default choices are the tracked active batches only",
  planningBatchChoices(planDefault, planningBatches)
    .map((b) => b.id)
    .join(",") === `${BATCH_PSW_CURRENT},${BATCH_ECEA_CURRENT}`,
);
check(
  "planning: default choices never surface April-style untracked or archived batches",
  planningBatchChoices(planDefault, planningBatches).every((b) => isOperationalBatch(b)),
);
check(
  "planning: the default batch is the most recent tracked active batch, not April",
  resolveBatch(planDefault, planningBatches)?.id === BATCH_PSW_CURRENT,
  resolveBatch(planDefault, planningBatches)?.name,
);
const planApril = planningValuesFrom({ batch: BATCH_PSW_APRIL });
check(
  "planning: a direct URL to an untracked batch still opens that batch",
  resolveBatch(planApril, planningBatches)?.id === BATCH_PSW_APRIL,
);
check(
  "planning: a direct URL to an untracked batch adds it to the choices",
  planningBatchChoices(planApril, planningBatches)
    .map((b) => b.id)
    .join(",") === `${BATCH_PSW_CURRENT},${BATCH_PSW_APRIL},${BATCH_ECEA_CURRENT}`,
);
const planArchived = planningValuesFrom({ batch: BATCH_PSW_ARCHIVED_ON });
check(
  "planning: a direct URL to an archived batch still opens that batch",
  resolveBatch(planArchived, planningBatches)?.id === BATCH_PSW_ARCHIVED_ON &&
    planningBatchChoices(planArchived, planningBatches).some(
      (b) => b.id === BATCH_PSW_ARCHIVED_ON,
    ),
);
const planAll = planningValuesFrom({ operations: "all" });
check(
  "planning: Show all batches lists every batch in admin order",
  planningScopeFrom(planAll) === "all" &&
    planningBatchChoices(planAll, planningBatches)
      .map((b) => b.id)
      .join(",") === planningBatches.map((b) => b.id).join(","),
);
const planAllApril = planningHref("/placement/planning", planAll, {
  batch: BATCH_PSW_APRIL,
});
check(
  "planning: choosing a batch keeps the Show all scope in the URL",
  planAllApril.includes("operations=all") &&
    planAllApril.includes(`batch=${BATCH_PSW_APRIL}`),
  planAllApril,
);
check(
  "planning: with nothing tracked the default falls back to the most recent active batch by start date",
  resolveBatch(
    planDefault,
    planningBatches.map((b) => ({ ...b, placement_tracking_enabled: false })),
  )?.id === BATCH_PSW_CURRENT,
);
check(
  "planning: with everything archived the default is still a batch, not blank",
  resolveBatch(
    planDefault,
    planningBatches.map((b) => ({ ...b, status: "archived" as const })),
  ) !== null,
);
check(
  "planning: the shared choice helper includes the selected batch under current scope only when needed",
  batchChoicesForScope(planningBatches, "current", null).length === 2 &&
    batchChoicesForScope(planningBatches, "current", BATCH_PSW_CURRENT).length === 2 &&
    batchChoicesForScope(planningBatches, "current", BATCH_PSW_APRIL).length === 3 &&
    batchChoicesForScope(planningBatches, "all", null).length === 5,
);

// ---------------------------------------------------------------------------

console.log("\n---");
console.log(`${passed} checks passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
