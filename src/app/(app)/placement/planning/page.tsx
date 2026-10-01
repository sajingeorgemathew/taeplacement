import { MapPinOff, Settings, TriangleAlert } from "lucide-react";
import Link from "next/link";

import PlacementViewSwitch from "@/components/placement/PlacementViewSwitch";
import AreaCard from "@/components/planning/AreaCard";
import BatchNeeds from "@/components/planning/BatchNeeds";
import BatchSelector from "@/components/planning/BatchSelector";
import BatchSummary from "@/components/planning/BatchSummary";
import CityBreakdown from "@/components/planning/CityBreakdown";
import ExceptionCards from "@/components/planning/ExceptionCards";
import PlanningFilterChips, {
  type PlanningChip,
} from "@/components/planning/PlanningFilterChips";
import PlanningPartnerList from "@/components/planning/PlanningPartnerList";
import PlanningStudentList from "@/components/planning/PlanningStudentList";
import BackLink from "@/components/ui/BackLink";
import { canManagePlacements, getStaffSession } from "@/lib/auth/session";
import { partnerCountLabel, studentCountLabel } from "@/lib/format";
import { areaColorStyle } from "@/lib/partners/area-colors";
import { listPartners, listPlacementAreas } from "@/lib/partners/queries";
import {
  AVAILABILITY_STATUSES,
  AVAILABILITY_STATUS_LABELS,
  PLACEMENT_STATUSES,
  PLACEMENT_STATUS_LABELS,
  type AvailabilityStatus,
  type PlacementStatus,
} from "@/lib/placement/constants";
import {
  ALL_STUDENTS_VALUE,
  OPERATIONS_PARAM,
  isOperationalBatch,
} from "@/lib/placement/operations";
import {
  getPrimaryContacts,
  listPlacementStudents,
  type PlacementBoardStudent,
} from "@/lib/placement/queries";
import {
  buildBatchPlanning,
  countStudents,
  planningObservation,
  studentsInCity,
  summarizePartners,
  type PlanningAreaGroup,
  type PlanningStatusCounts,
} from "@/lib/planning/batch";
import {
  PLANNING_STATUS_LABELS,
  PLANNING_STUDENT_FILTERS,
} from "@/lib/planning/constants";
import {
  planningAvailability,
  planningBatchChoices,
  planningCity,
  planningDrilldownHref,
  planningException,
  planningHref,
  planningNeed,
  planningRequirement,
  planningScopeFrom,
  planningStudentStatus,
  planningValuesFrom,
  planningView,
  resolveBatch,
  type PlanningValues,
} from "@/lib/planning/filters";
import {
  NEED_KIND_LABELS,
  buildBatchDocumentNeeds,
  needRequirement,
  needStudentIds,
  type NeedKind,
} from "@/lib/planning/needs";
import {
  listCityAreaMappings,
  readBatchChecklist,
} from "@/lib/planning/queries";
import { listBatches } from "@/lib/students/queries";
import type { BatchRow } from "@/lib/supabase/database.types";

export const metadata = {
  title: "Batch Planning",
};

const BASE_PATH = "/placement/planning";

/** Available Now first, then Upcoming, Unknown, and finally Not Available. */
const AVAILABILITY_ORDER: Record<AvailabilityStatus, number> = {
  available_now: 0,
  upcoming: 1,
  unknown: 2,
  not_available: 3,
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-7 sm:p-8">
      <h2 className="text-[24px] font-semibold tracking-tight text-ink">
        {title}
      </h2>
      {description ? (
        <p className="mt-2 max-w-3xl text-[16px] text-ink-muted">{description}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function DrilldownTitle({
  icon,
  title,
  lead,
  note,
}: {
  icon?: React.ReactNode;
  title: string;
  lead: string;
  note?: string | null;
}) {
  return (
    <div className="mb-8">
      <h1 className="flex flex-wrap items-center gap-3 text-[34px] font-semibold leading-tight tracking-tight text-ink sm:text-[38px]">
        {icon}
        {title}
      </h1>
      <p className="mt-3 max-w-3xl text-[18px] text-ink-muted">{lead}</p>
      {note ? (
        <p className="mt-4 max-w-3xl rounded-2xl border border-line bg-surface px-6 py-4 text-[17px] text-ink">
          {note}
        </p>
      ) : null}
    </div>
  );
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
    >
      {children}
    </Link>
  );
}

/**
 * Batch Placement Planning.
 *
 * One question: for the batch we are about to place, where are the students,
 * which operational Areas are those cities in, what does the batch still need
 * on its document checklist, and what does the partner network look like in
 * those Areas?
 *
 * It is a VIEW. It assigns nobody and it changes no document. Student to
 * partner assignment stays entirely inside the PLACEMENT-04 Find Placement
 * flow, and the only thing this page does about it is offer a link to that
 * flow for a student who is ready.
 *
 * Every number is derived at read time from students, the checklist, partners,
 * and the city mapping. There is no planning table, no cached rollup, and no
 * area stored on a student.
 *
 * Reads, in order, never one per student:
 *
 *   1. batches, areas, city mappings, the session
 *   2. the batch's students (with readiness and the live placement already
 *      joined by listPlacementStudents), partners, primary contacts
 *   3. the batch's checklist rows and the active requirement list, one bulk
 *      read for the student ids from step 2
 */
export default async function BatchPlanningPage(
  props: PageProps<"/placement/planning">,
) {
  const searchParams = await props.searchParams;
  const values = planningValuesFrom(searchParams);

  const [batches, areas, mappings, session] = await Promise.all([
    listBatches(),
    listPlacementAreas(),
    listCityAreaMappings(),
    getStaffSession(),
  ]);

  const batch = resolveBatch(values, batches);

  if (!batch) {
    return (
      <>
        <PlanningHeader
          values={values}
          batches={batches}
          selected={null}
          batchLine="No batches have been created yet."
        />
        <Section
          title="No batch to plan"
          description="Batch Planning reads real batch records. Create one in Admin and assign students to it, and this page fills in on its own."
        >
          <PrimaryLink href="/admin/batches">
            <Settings size={20} aria-hidden="true" />
            Open Batch Management
          </PrimaryLink>
        </Section>
      </>
    );
  }

  const [students, partners, primaryContacts] = await Promise.all([
    listPlacementStudents({ batchId: batch.id }),
    listPartners(),
    getPrimaryContacts(),
  ]);

  const studentIds = students.map((student) => student.id);
  const checklist = await readBatchChecklist(studentIds);

  const today = new Date();
  const planning = buildBatchPlanning({
    students,
    partners,
    areas,
    mappings,
    today,
  });
  const needs = buildBatchDocumentNeeds({
    studentIds,
    requirements: checklist.requirements,
    rows: checklist.rows,
  });
  const studentsById = new Map(students.map((student) => [student.id, student]));

  const canManage = canManagePlacements(session);
  const batchLine = [
    studentCountLabel(planning.counts.total),
    batch.program,
    batch.status === "archived"
      ? "archived batch"
      : isOperationalBatch(batch)
        ? null
        : "not tracked in Placement Operations",
  ]
    .filter(Boolean)
    .join(" - ");

  /** A drill-down link: batch and scope kept, every drill-down reset. */
  const drill = (change: Partial<PlanningValues>) =>
    planningDrilldownHref(BASE_PATH, values, change);

  const overviewHref = drill({});
  const unmappedHref = drill({ exception: "unmapped" });
  const missingHref = drill({ exception: "missing" });
  const cityHref = (key: string) => drill({ city: key });
  const needHref = (kind: NeedKind, requirementId?: string) =>
    drill({ need: kind, requirement: requirementId ?? "" });
  const statusHrefs = Object.fromEntries(
    PLACEMENT_STATUSES.map((status) => [status, drill({ status })]),
  ) as Record<PlacementStatus, string>;

  const header = (
    <PlanningHeader
      values={values}
      batches={batches}
      selected={batch}
      batchLine={batchLine}
    />
  );

  /**
   * The status chips inside a student drill-down: All plus every placement
   * status, each with its count in this group. Zero counts stay visible.
   */
  function statusChips(
    counts: PlanningStatusCounts,
    active: PlacementStatus | null,
  ): PlanningChip[] {
    return [
      {
        key: "all",
        label: "All",
        count: counts.total,
        href: planningHref(BASE_PATH, values, { status: "" }),
        active: active === null,
      },
      ...PLANNING_STUDENT_FILTERS.map((status) => ({
        key: status,
        label: PLANNING_STATUS_LABELS[status],
        count: counts.byStatus[status],
        href: planningHref(BASE_PATH, values, { status }),
        active: active === status,
      })),
    ];
  }

  function withStatusFilter(
    list: PlacementBoardStudent[],
    status: PlacementStatus | null,
  ) {
    return status
      ? list.filter((student) => student.placement_status === status)
      : list;
  }

  function studentList(
    list: PlacementBoardStudent[],
    emptyMessage: string,
  ) {
    return (
      <PlanningStudentList
        students={list}
        needs={needs.byStudent}
        canManage={canManage}
        emptyMessage={emptyMessage}
      />
    );
  }

  const view = planningView(values);

  // -------------------------------------------------------------------------
  // Planning exception drill-down: Unmapped City / City Missing
  // -------------------------------------------------------------------------

  if (view === "exception") {
    const exception = planningException(values)!;
    const group =
      exception === "unmapped" ? planning.unmapped : planning.missing;

    return (
      <>
        <BackLink href={overviewHref} label="Back to Batch Planning" />

        <DrilldownTitle
          icon={<MapPinOff size={30} aria-hidden="true" className="text-ink-muted" />}
          title={exception === "unmapped" ? "Unmapped City" : "City Missing"}
          lead={
            exception === "unmapped"
              ? `${studentCountLabel(group.counts.total)} in ${batch.name} live in a city that does not belong to an active Placement Area. Their Area is not guessed; an admin maps the city and they join an Area card straight away.`
              : `${studentCountLabel(group.counts.total)} in ${batch.name} have no city on their student record. Add the city on the student and they join their Area automatically.`
          }
        />

        {exception === "unmapped" ? (
          <Section
            title="Cities to map"
            description="Each of these is one decision in Admin. A city mapped to an active Area moves every student who lives there at once."
          >
            <ul className="flex flex-col gap-2">
              {group.cities.map((city) => (
                <li
                  key={city.normalized}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-muted px-5 py-3.5"
                >
                  <span className="min-w-0">
                    <span className="block text-[17px] font-medium text-ink">
                      {city.label}
                    </span>
                    {city.archivedArea ? (
                      <span className="mt-0.5 flex items-start gap-1.5 text-[15px] text-attention-ink">
                        <TriangleAlert
                          size={16}
                          aria-hidden="true"
                          className="mt-1 shrink-0"
                        />
                        Needs Area Review - mapped to {city.archivedArea.name},
                        which is archived
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[17px] font-semibold text-ink">
                    {city.count}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6">
              <PrimaryLink href="/admin/city-area-mapping">
                <Settings size={20} aria-hidden="true" />
                Manage City Mapping
              </PrimaryLink>
            </div>
          </Section>
        ) : null}

        <div className="mt-6">
          <Section title="Students">
            {studentList(
              group.students,
              "No students in this batch are affected.",
            )}
          </Section>
        </div>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Area drill-down
  // -------------------------------------------------------------------------

  if (view === "area") {
    const group = areaGroupFor(values.area);

    if (!group) {
      return (
        <>
          <BackLink href={overviewHref} label="Back to Batch Planning" />
          <Section
            title="That Placement Area is not available"
            description="It may have been archived or removed. Areas are configured in Admin, and Batch Planning only opens active ones."
          >
            <PrimaryLink href={overviewHref}>Back to Batch Planning</PrimaryLink>
          </Section>
        </>
      );
    }

    const color = areaColorStyle(group.area.color_key);
    const observation = planningObservation(group);

    const statusFilter = planningStudentStatus(values);
    const shownStudents = withStatusFilter(group.students, statusFilter);

    const areaPartners = partnersInArea(group.area.id);
    const availabilityFilter = planningAvailability(values);
    const shownPartners = (
      availabilityFilter
        ? areaPartners.filter(
            (partner) => partner.availability_status === availabilityFilter,
          )
        : areaPartners
    )
      .slice()
      .sort(
        (a, b) =>
          AVAILABILITY_ORDER[a.availability_status] -
            AVAILABILITY_ORDER[b.availability_status] ||
          a.name.localeCompare(b.name),
      );

    const partnerChips: PlanningChip[] = [
      {
        key: "all",
        label: "All",
        count: group.partners.total,
        href: planningHref(BASE_PATH, values, { availability: "" }),
        active: availabilityFilter === null,
      },
      ...AVAILABILITY_STATUSES.map((status) => ({
        key: status,
        label: AVAILABILITY_STATUS_LABELS[status],
        count: areaPartners.filter(
          (partner) => partner.availability_status === status,
        ).length,
        href: planningHref(BASE_PATH, values, { availability: status }),
        active: availabilityFilter === status,
      })),
    ];

    return (
      <>
        <BackLink href={overviewHref} label="Back to Batch Planning" />

        <DrilldownTitle
          icon={
            <span
              aria-hidden="true"
              className={`h-7 w-7 shrink-0 rounded-full ${color.swatch}`}
            />
          }
          title={group.area.name}
          lead={`${batch.name} - ${studentCountLabel(group.counts.total)} in this Area, ${partnerCountLabel(group.partners.total)}, ${group.partners.availableNow} marked Available Now.`}
          note={observation}
        />

        <div className="flex flex-col gap-6">
          <Section
            title="Students in this Area"
            description="Active students in this batch whose city maps to this Area. Readiness is the same X of Y the checklist and the board show; the attention line counts checklist items the student must act on and items staff have not reviewed yet."
          >
            <PlanningFilterChips
              legend="Filter students by placement status"
              chips={statusChips(group.counts, statusFilter)}
            />

            <div className="mt-6">
              {studentList(
                shownStudents,
                statusFilter
                  ? `No student in this Area is ${PLACEMENT_STATUS_LABELS[statusFilter]} right now.`
                  : "No students from this batch live in this Area.",
              )}
            </div>
          </Section>

          <Section
            title="Placement Partners in this Area"
            description="Availability as staff last recorded it. Available Now is highlighted and listed first, and Unknown partners stay listed: an unchecked partner is not a closed one. Partner count is not capacity."
          >
            <PlanningFilterChips
              legend="Filter partners by availability"
              chips={partnerChips}
            />

            <div className="mt-6">
              <PlanningPartnerList
                partners={shownPartners}
                primaryContacts={primaryContacts}
                today={today}
                emptyMessage={
                  availabilityFilter
                    ? `No partner in this Area is marked ${AVAILABILITY_STATUS_LABELS[availabilityFilter]}.`
                    : "No active placement partners are assigned to this Area yet. Partners are grouped into areas on the Area Board."
                }
              />
            </div>
          </Section>
        </div>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // City drill-down: the students from one city
  // -------------------------------------------------------------------------

  if (view === "city") {
    const key = planningCity(values)!;
    const row = planning.cities.find((city) => city.key === key) ?? null;
    const cityStudents = studentsInCity(planning, key);
    const counts = countStudents(cityStudents);
    const statusFilter = planningStudentStatus(values);
    const shownStudents = withStatusFilter(cityStudents, statusFilter);

    const areaLine = !row
      ? `No student in ${batch.name} lives in this city.`
      : row.state === "mapped" && row.area
        ? `${studentCountLabel(row.count)} in ${batch.name} live here. ${row.label} maps to the ${row.area.name} Placement Area.`
        : row.state === "needs_review" && row.area
          ? `${studentCountLabel(row.count)} in ${batch.name} live here. ${row.label} is mapped to ${row.area.name}, which has been archived, so these students need an Area review.`
          : `${studentCountLabel(row.count)} in ${batch.name} live here. ${row.label} is not mapped to a Placement Area yet, and no Area is guessed for it.`;

    return (
      <>
        <BackLink href={overviewHref} label="Back to Batch Planning" />

        <DrilldownTitle
          title={row?.label ?? "City"}
          lead={areaLine}
        />

        {row && row.state !== "mapped" ? (
          <div className="mb-6">
            <PrimaryLink href="/admin/city-area-mapping">
              <Settings size={20} aria-hidden="true" />
              Manage City Mapping
            </PrimaryLink>
          </div>
        ) : null}

        <Section title="Students from this city">
          <PlanningFilterChips
            legend="Filter students by placement status"
            chips={statusChips(counts, statusFilter)}
          />
          <div className="mt-6">
            {studentList(
              shownStudents,
              statusFilter
                ? `No student from this city is ${PLACEMENT_STATUS_LABELS[statusFilter]} right now.`
                : "No student in this batch lives in this city.",
            )}
          </div>
        </Section>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Document-need drill-down: the students who need something
  // -------------------------------------------------------------------------

  if (view === "need") {
    const kind = planningNeed(values)!;
    const requirementId = planningRequirement(values);
    const requirement = requirementId
      ? needRequirement(needs, kind, requirementId)
      : null;
    const knownRequirement =
      !requirementId ||
      checklist.requirements.some((row) => row.id === requirementId);

    const ids = knownRequirement
      ? needStudentIds(needs, kind, requirementId)
      : [];
    const needStudents = ids
      .map((id) => studentsById.get(id))
      .filter((student): student is PlacementBoardStudent => Boolean(student));

    const what =
      kind === "action"
        ? requirement
          ? `${requirement.name} is requested from, or needs an update from, each of these students.`
          : "Each of these students has at least one checklist item that is requested or needs an update. The student has something to send."
        : requirement
          ? `${requirement.name} has not been reviewed by staff yet for each of these students.`
          : "Each of these students has at least one checklist item nobody on staff has reviewed yet.";

    const title = requirement
      ? `${NEED_KIND_LABELS[kind]}: ${requirement.short_name ?? requirement.name}`
      : NEED_KIND_LABELS[kind];

    return (
      <>
        <BackLink href={overviewHref} label="Back to Batch Planning" />

        <DrilldownTitle
          title={title}
          lead={`${studentCountLabel(needStudents.length)} in ${batch.name}. ${what}`}
          note={
            kind === "review"
              ? "Not Reviewed is a staff state, not a missing student document. The student may already have sent it; the item is waiting for a staff member to look."
              : null
          }
        />

        {!knownRequirement ? (
          <div className="mb-6 rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink">
            That requirement is not an active document requirement, so nothing
            is listed for it.
          </div>
        ) : null}

        <Section title="Students">
          {studentList(
            needStudents,
            kind === "action"
              ? "No student in this batch has a document to act on."
              : "Every checklist item in this batch has been reviewed.",
          )}
        </Section>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Batch status drill-down: every student in the batch with one status
  // -------------------------------------------------------------------------

  if (view === "status") {
    const status = planningStudentStatus(values)!;
    const shownStudents = withStatusFilter(planning.students, status);

    return (
      <>
        <BackLink href={overviewHref} label="Back to Batch Planning" />

        <DrilldownTitle
          title={PLACEMENT_STATUS_LABELS[status]}
          lead={`${studentCountLabel(shownStudents.length)} in ${batch.name} are ${PLACEMENT_STATUS_LABELS[status]}, as recorded on the student record.`}
        />

        <Section title="Students">
          <PlanningFilterChips
            legend="Switch placement status"
            chips={statusChips(planning.counts, status)}
          />
          <div className="mt-6">
            {studentList(
              shownStudents,
              `No student in this batch is ${PLACEMENT_STATUS_LABELS[status]} right now.`,
            )}
          </div>
        </Section>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Overview
  // -------------------------------------------------------------------------

  return (
    <>
      {header}

      <section aria-labelledby="batch-summary-heading" className="mb-10">
        <h2 id="batch-summary-heading" className="sr-only">
          Batch summary
        </h2>
        <BatchSummary batch={batch} planning={planning} statusHrefs={statusHrefs} />
      </section>

      <section aria-labelledby="city-breakdown-heading" className="mb-10">
        <h2
          id="city-breakdown-heading"
          className="mb-2 text-[24px] font-semibold tracking-tight text-ink"
        >
          Where Students Live
        </h2>
        <p className="mb-6 max-w-3xl text-[17px] text-ink-muted">
          Every student in this batch by city, and the Placement Area each city
          maps to. A city with no mapping stays Unmapped, and a student with no
          city stays City Missing; neither is guessed into an Area.
        </p>
        <CityBreakdown
          planning={planning}
          cityHref={cityHref}
          missingHref={missingHref}
        />
      </section>

      <section aria-labelledby="batch-needs-heading" className="mb-10">
        <h2
          id="batch-needs-heading"
          className="mb-2 text-[24px] font-semibold tracking-tight text-ink"
        >
          What This Batch Needs
        </h2>
        <p className="mb-6 max-w-3xl text-[17px] text-ink-muted">
          Counted from each student&apos;s placement document checklist as it
          stands. Received and not applicable items are complete and do not
          appear. Names and counts only; no note text is shown here.
        </p>
        <BatchNeeds needs={needs} href={needHref} />
      </section>

      <section aria-labelledby="area-cards-heading" className="mb-10">
        <h2
          id="area-cards-heading"
          className="mb-2 text-[24px] font-semibold tracking-tight text-ink"
        >
          Placement Areas
        </h2>
        <p className="mb-6 max-w-3xl text-[17px] text-ink-muted">
          Where this batch actually lives, grouped through the city to area
          mapping. Only areas holding a student from this batch are shown.
          Partner count is an availability picture, never capacity.
        </p>

        {planning.areas.length === 0 ? (
          <div className="rounded-3xl border border-line bg-surface p-8">
            <p className="text-[17px] text-ink-muted">
              No student in this batch has a city that maps to an active
              Placement Area yet. Map their cities in Admin and the Area cards
              appear here.
            </p>
            <div className="mt-6">
              <PrimaryLink href="/admin/city-area-mapping">
                <Settings size={20} aria-hidden="true" />
                Manage City Mapping
              </PrimaryLink>
            </div>
          </div>
        ) : (
          <ul className="grid gap-5 xl:grid-cols-2">
            {planning.areas.map((group) => (
              <AreaCard
                key={group.area.id}
                group={group}
                href={drill({ area: group.area.id })}
              />
            ))}
          </ul>
        )}
      </section>

      <ExceptionCards
        planning={planning}
        unmappedHref={unmappedHref}
        missingHref={missingHref}
      />
    </>
  );

  /** Active partners assigned to one area. Archived partners are excluded. */
  function partnersInArea(areaId: string) {
    return partners.filter((partner) => partner.area_id === areaId);
  }

  /**
   * The group for a drill-down.
   *
   * An active area with no students from this batch still opens: seeing that an
   * Area is empty, and which partners sit there anyway, is a real planning
   * answer. Archived areas do not open at all; their students are Needs Area
   * Review under Unmapped, where an admin can act on the mapping.
   */
  function areaGroupFor(areaId: string): PlanningAreaGroup | null {
    const existing = planning.areas.find((group) => group.area.id === areaId);
    if (existing) return existing;

    const area = areas.find((row) => row.id === areaId && row.is_active);
    if (!area) return null;

    return {
      area,
      students: [],
      counts: countStudents([]),
      cities: [],
      partners: summarizePartners(partnersInArea(areaId), today),
    };
  }
}

/**
 * The Board and List links for the batch being planned.
 *
 * A batch outside current operations is not in the Placement page's default
 * scope, so its links carry Show All Students; otherwise a planner would land
 * on an empty board for a batch they were just looking at.
 */
function placementLink(
  path: string,
  view: "board" | "list",
  batch: BatchRow | null,
): string {
  const params = new URLSearchParams();
  if (view === "list") params.set("view", "list");
  if (batch) {
    params.set("batch", batch.id);
    if (!isOperationalBatch(batch)) {
      params.set(OPERATIONS_PARAM, ALL_STUDENTS_VALUE);
    }
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** The title, the batch selector, and the Placement view switch. */
function PlanningHeader({
  values,
  batches,
  selected,
  batchLine,
}: {
  values: PlanningValues;
  batches: Awaited<ReturnType<typeof listBatches>>;
  selected: BatchRow | null;
  batchLine: string;
}) {
  const scope = planningScopeFrom(values);
  // The batch on screen is always offered, even when it was reached by a
  // direct link to an old batch or is the fallback when nothing is tracked.
  const choices = planningBatchChoices(values, batches, selected?.id ?? null);

  return (
    <>
      <div className="mb-8">
        <h1 className="text-[38px] font-semibold leading-tight tracking-tight text-ink sm:text-[42px]">
          Batch Placement Planning
        </h1>
        <p className="mt-3 max-w-3xl text-[18px] text-ink-muted">
          Where does this batch need placement coverage? Students are grouped by
          the Placement Area their city belongs to, so you can see the partner
          network beside the students who need it, and what the batch still
          needs before it can be placed.
        </p>
      </div>

      <div className="mb-8 flex flex-col gap-6">
        <PlacementViewSwitch
          current="planning"
          // The batch already chosen here carries into the board and the
          // list only when the URL named it; the planning default is not
          // forced onto the other views.
          boardHref={placementLink(
            "/placement",
            "board",
            values.batch ? selected : null,
          )}
          planningHref={BASE_PATH}
          listHref={placementLink(
            "/placement",
            "list",
            values.batch ? selected : null,
          )}
        />

        {batches.length > 0 ? (
          <div className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-6 sm:p-7">
            <BatchSelector
              batches={choices}
              scope={scope}
              selectedId={selected?.id ?? null}
              basePath={BASE_PATH}
            />
            <p className="text-[16px] text-ink-muted">{batchLine}</p>
          </div>
        ) : null}
      </div>
    </>
  );
}
