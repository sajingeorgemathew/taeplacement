import { ArrowRight, MapPinOff, Settings, TriangleAlert } from "lucide-react";
import Link from "next/link";

import PlacementList from "@/components/placement/PlacementList";
import PlacementViewSwitch from "@/components/placement/PlacementViewSwitch";
import AreaCard from "@/components/planning/AreaCard";
import BatchSelector from "@/components/planning/BatchSelector";
import BatchSummary from "@/components/planning/BatchSummary";
import ExceptionCards from "@/components/planning/ExceptionCards";
import PlanningFilterChips, {
  type PlanningChip,
} from "@/components/planning/PlanningFilterChips";
import PlanningPartnerList from "@/components/planning/PlanningPartnerList";
import BackLink from "@/components/ui/BackLink";
import { canManagePlacements, getStaffSession } from "@/lib/auth/session";
import { formatDate, studentCountLabel } from "@/lib/format";
import { areaColorStyle } from "@/lib/partners/area-colors";
import { listPartners, listPlacementAreas } from "@/lib/partners/queries";
import {
  AVAILABILITY_STATUSES,
  AVAILABILITY_STATUS_LABELS,
  PLACEMENT_STATUS_LABELS,
  type AvailabilityStatus,
} from "@/lib/placement/constants";
import {
  getPrimaryContacts,
  listPlacementStudents,
} from "@/lib/placement/queries";
import {
  buildBatchPlanning,
  countStudents,
  planningObservation,
  summarizePartners,
  type PlanningAreaGroup,
} from "@/lib/planning/batch";
import {
  PLANNING_STUDENT_FILTERS,
  PLANNING_STATUS_LABELS,
} from "@/lib/planning/constants";
import {
  ALL_STUDENTS_VALUE,
  OPERATIONS_PARAM,
  isOperationalBatch,
} from "@/lib/placement/operations";
import {
  planningAvailability,
  planningBatchChoices,
  planningException,
  planningHref,
  planningScopeFrom,
  planningStudentStatus,
  planningValuesFrom,
  resolveBatch,
  type PlanningValues,
} from "@/lib/planning/filters";
import { listCityAreaMappings } from "@/lib/planning/queries";
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

/**
 * Batch Placement Planning.
 *
 * One question: for the batch we are about to place, where are the students,
 * which operational Areas are those cities in, and what does the partner
 * network look like in those Areas?
 *
 * It is a VIEW. It assigns nobody. Student to partner assignment stays entirely
 * inside the PLACEMENT-04 Find Placement flow, and the only thing this page
 * does about it is offer a link to that flow for a student who is ready.
 *
 * Every number is derived at read time from students, partners, and the city
 * mapping. There is no planning table, no cached rollup, and no area stored on
 * a student.
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
          <Link
            href="/admin/batches"
            className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
          >
            <Settings size={20} aria-hidden="true" />
            Open Batch Management
          </Link>
        </Section>
      </>
    );
  }

  const [students, partners, primaryContacts] = await Promise.all([
    listPlacementStudents({ batchId: batch.id }),
    listPartners(),
    getPrimaryContacts(),
  ]);

  const today = new Date();
  const planning = buildBatchPlanning({
    students,
    partners,
    areas,
    mappings,
    today,
  });

  const canManage = canManagePlacements(session);
  const startDate = formatDate(batch.start_date);
  const batchLine = [
    studentCountLabel(planning.counts.total),
    batch.program,
    startDate ? `starts ${startDate}` : null,
    batch.status === "archived"
      ? "archived batch"
      : isOperationalBatch(batch)
        ? null
        : "not tracked in Placement Operations",
  ]
    .filter(Boolean)
    .join(" - ");

  const unmappedHref = planningHref(BASE_PATH, values, {
    area: "",
    exception: "unmapped",
    status: "",
    availability: "",
  });
  const missingHref = planningHref(BASE_PATH, values, {
    area: "",
    exception: "missing",
    status: "",
    availability: "",
  });
  const overviewHref = planningHref(BASE_PATH, values, {
    area: "",
    exception: "",
    status: "",
    availability: "",
  });

  const header = (
    <PlanningHeader
      values={values}
      batches={batches}
      selected={batch}
      batchLine={batchLine}
    />
  );

  // -------------------------------------------------------------------------
  // Planning exception drill-down: Unmapped City / City Missing
  // -------------------------------------------------------------------------

  const exception = planningException(values);
  if (exception) {
    const group =
      exception === "unmapped" ? planning.unmapped : planning.missing;

    return (
      <>
        <BackLink href={overviewHref} label="Back to Batch Planning" />

        <div className="mb-8">
          <h1 className="flex flex-wrap items-center gap-3 text-[34px] font-semibold leading-tight tracking-tight text-ink sm:text-[38px]">
            <MapPinOff size={30} aria-hidden="true" className="text-ink-muted" />
            {exception === "unmapped" ? "Unmapped City" : "City Missing"}
          </h1>
          <p className="mt-3 max-w-3xl text-[18px] text-ink-muted">
            {exception === "unmapped"
              ? `${studentCountLabel(group.counts.total)} in ${batch.name} live in a city that does not belong to an active Placement Area. Their Area is not guessed; an admin maps the city and they join an Area card straight away.`
              : `${studentCountLabel(group.counts.total)} in ${batch.name} have no city on their student record. Add the city on the student and they join their Area automatically.`}
          </p>
        </div>

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

            <Link
              href="/admin/city-area-mapping"
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              <Settings size={20} aria-hidden="true" />
              Manage City Mapping
            </Link>
          </Section>
        ) : null}

        <div className="mt-6">
          <Section title="Students">
            <PlacementList
              students={group.students}
              emptyMessage="No students in this batch are affected."
            />
          </Section>
        </div>
      </>
    );
  }

  // -------------------------------------------------------------------------
  // Area drill-down
  // -------------------------------------------------------------------------

  if (values.area) {
    const group = areaGroupFor(values.area);

    if (!group) {
      return (
        <>
          <BackLink href={overviewHref} label="Back to Batch Planning" />
          <Section
            title="That Placement Area is not available"
            description="It may have been archived or removed. Areas are configured in Admin, and Batch Planning only opens active ones."
          >
            <Link
              href={overviewHref}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              Back to Batch Planning
            </Link>
          </Section>
        </>
      );
    }

    const color = areaColorStyle(group.area.color_key);
    const observation = planningObservation(group);

    const statusFilter = planningStudentStatus(values);
    const shownStudents = statusFilter
      ? group.students.filter(
          (student) => student.placement_status === statusFilter,
        )
      : group.students;

    const studentChips: PlanningChip[] = [
      {
        key: "all",
        label: "All",
        count: group.counts.total,
        href: planningHref(BASE_PATH, values, { status: "" }),
        active: statusFilter === null,
      },
      ...PLANNING_STUDENT_FILTERS.map((status) => ({
        key: status,
        label: PLANNING_STATUS_LABELS[status],
        count: group.counts.byStatus[status],
        href: planningHref(BASE_PATH, values, { status }),
        active: statusFilter === status,
      })),
    ];

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

        <div className="mb-8">
          <h1 className="flex flex-wrap items-center gap-3 text-[34px] font-semibold leading-tight tracking-tight text-ink sm:text-[38px]">
            <span
              aria-hidden="true"
              className={`h-7 w-7 shrink-0 rounded-full ${color.swatch}`}
            />
            {group.area.name}
          </h1>
          <p className="mt-3 max-w-3xl text-[18px] text-ink-muted">
            {batch.name} - {studentCountLabel(group.counts.total)} in this Area,
            and {group.partners.total === 1
              ? "1 active placement partner"
              : `${group.partners.total} active placement partners`}
            .
          </p>
          {observation ? (
            <p className="mt-4 max-w-3xl rounded-2xl border border-line bg-surface px-6 py-4 text-[17px] text-ink">
              {observation}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Section
            title="Students in this Area"
            description="Active students in this batch whose city maps to this Area. Document readiness is the same X of Y the checklist and the board show."
          >
            <PlanningFilterChips
              legend="Filter students by placement status"
              chips={studentChips}
            />

            <div className="mt-6">
              <PlacementList
                students={shownStudents}
                emptyMessage={
                  statusFilter
                    ? `No student in this Area is ${PLACEMENT_STATUS_LABELS[statusFilter]} right now.`
                    : "No students from this batch live in this Area."
                }
                renderAction={
                  canManage
                    ? (student) =>
                        student.placement_status === "ready_for_placement" &&
                        !student.currentPlacement ? (
                          <Link
                            href={`/placement/find/${student.id}`}
                            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[16px] font-medium text-brand-strong transition-colors hover:bg-brand-soft"
                          >
                            Find Placement
                            <ArrowRight size={18} aria-hidden="true" />
                          </Link>
                        ) : null
                    : undefined
                }
              />
            </div>
          </Section>

          <Section
            title="Placement Partners in this Area"
            description="Availability as staff last recorded it. Available Now is highlighted, and Unknown partners stay listed: an unchecked partner is not a closed one. Partner count is not capacity."
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
  // Overview
  // -------------------------------------------------------------------------

  return (
    <>
      {header}

      <section aria-labelledby="batch-summary-heading" className="mb-10">
        <h2
          id="batch-summary-heading"
          className="mb-5 text-[24px] font-semibold tracking-tight text-ink"
        >
          {batch.name}
        </h2>
        <BatchSummary
          planning={planning}
          unmappedHref={unmappedHref}
          missingHref={missingHref}
        />
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
        </p>

        {planning.areas.length === 0 ? (
          <div className="rounded-3xl border border-line bg-surface p-8">
            <p className="text-[17px] text-ink-muted">
              No student in this batch has a city that maps to an active
              Placement Area yet. Map their cities in Admin and the Area cards
              appear here.
            </p>
            <Link
              href="/admin/city-area-mapping"
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              <Settings size={20} aria-hidden="true" />
              Manage City Mapping
            </Link>
          </div>
        ) : (
          <ul className="grid gap-5 xl:grid-cols-2">
            {planning.areas.map((group) => (
              <AreaCard
                key={group.area.id}
                group={group}
                href={planningHref(BASE_PATH, values, {
                  area: group.area.id,
                  exception: "",
                  status: "",
                  availability: "",
                })}
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
          network beside the students who need it.
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
