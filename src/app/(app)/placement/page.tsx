import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Columns3,
  List,
  PauseCircle,
  UserCheck,
} from "lucide-react";
import Link from "next/link";

import PlacementBoard from "@/components/placement/PlacementBoard";
import PlacementList from "@/components/placement/PlacementList";
import PlacementToolbar from "@/components/placement/PlacementToolbar";
import SummaryBlock from "@/components/ui/SummaryBlock";
import { canManagePlacements, getStaffSession } from "@/lib/auth/session";
import { formatShortDate, studentCountLabel, studentFullName } from "@/lib/format";
import { listPartners, listPlacementAreas } from "@/lib/partners/queries";
import {
  getPlacementCounts,
  listPlacementStudents,
} from "@/lib/placement/queries";
import {
  hasActivePlacementFilters,
  placementFiltersFrom,
  placementHref,
  placementToolbarValuesFrom,
  placementViewFrom,
} from "@/lib/placement/filters";
import { listBatches } from "@/lib/students/queries";

export const metadata = {
  title: "Placement",
};

const BASE_PATH = "/placement";

/** The two view controls. Board is the default. */
function ViewSwitch({
  current,
  boardHref,
  listHref,
}: {
  current: "board" | "list";
  boardHref: string;
  listHref: string;
}) {
  const base =
    "inline-flex items-center gap-2 rounded-2xl px-6 py-4 text-[17px] font-semibold transition-colors";
  const on = "bg-brand text-white";
  const off =
    "border border-line bg-surface text-ink hover:border-brand hover:bg-brand-soft hover:text-brand-strong";

  return (
    <div
      role="group"
      aria-label="Choose how to view placement"
      className="flex flex-wrap gap-3"
    >
      <Link
        href={boardHref}
        aria-current={current === "board" ? "true" : undefined}
        className={`${base} ${current === "board" ? on : off}`}
      >
        <Columns3 size={22} aria-hidden="true" />
        Board
      </Link>
      <Link
        href={listHref}
        aria-current={current === "list" ? "true" : undefined}
        className={`${base} ${current === "list" ? on : off}`}
      >
        <List size={22} aria-hidden="true" />
        List
      </Link>
    </div>
  );
}

export default async function PlacementPage(
  props: PageProps<"/placement">,
) {
  const searchParams = await props.searchParams;
  const values = placementToolbarValuesFrom(searchParams);
  const view = placementViewFrom(values);

  const [students, counts, batches, areas, partners, session] =
    await Promise.all([
      listPlacementStudents(placementFiltersFrom(values)),
      getPlacementCounts(),
      listBatches(),
      listPlacementAreas(),
      listPartners(),
      getStaffSession(),
    ]);

  const canManage = canManagePlacements(session);
  const filtered = hasActivePlacementFilters(values);
  const activeAreas = areas.filter((area) => area.is_active);

  // Students whose placement has already STARTED are kept off the working
  // board: they are not waiting on anything staff can do here, and the start /
  // check-in workflow is PLACEMENT-05. They get a small summary of their own so
  // they are still visible and reachable.
  const started = students.filter(
    (student) => student.placement_status === "placement_started",
  );

  return (
    <>
      <div className="mb-10">
        <h1 className="text-[38px] font-semibold leading-tight tracking-tight text-ink sm:text-[42px]">
          Placement
        </h1>
        <p className="mt-3 max-w-2xl text-[18px] text-ink-muted">
          Track student readiness and placement assignments.
        </p>
      </div>

      <section aria-labelledby="placement-summary-heading" className="mb-10">
        <h2 id="placement-summary-heading" className="sr-only">
          Placement summary
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryBlock
            label="Ready for Placement"
            value={counts.readyForPlacement}
            note="Documents complete. These students are waiting for a partner."
            tone="ready"
            icon={UserCheck}
            href={`${BASE_PATH}?view=list&status=ready_for_placement`}
          />
          <SummaryBlock
            label="Placement Assigned"
            value={counts.assigned}
            note="Matched with a placement partner."
            tone="info"
            icon={Building2}
            href={`${BASE_PATH}?view=list&status=placement_assigned`}
          />
          <SummaryBlock
            label="On Hold"
            value={counts.onHold}
            note="Paused on purpose. Released by staff, never automatically."
            tone="attention"
            icon={PauseCircle}
            href={`${BASE_PATH}?view=list&status=on_hold`}
          />
          <SummaryBlock
            label="Placement Completed"
            value={counts.byStatus.placement_completed}
            note="Their whole placement requirement is finished. Off the working board."
            tone="ready"
            icon={CheckCircle2}
            href={`${BASE_PATH}?view=list&status=placement_completed`}
          />
        </div>
      </section>

      <div className="mb-7 flex flex-col gap-6">
        <ViewSwitch
          current={view}
          boardHref={placementHref(BASE_PATH, values, { view: "" })}
          listHref={placementHref(BASE_PATH, values, { view: "list" })}
        />
        <PlacementToolbar
          basePath={BASE_PATH}
          values={values}
          batches={batches}
          areas={activeAreas}
          partners={partners}
          showFilters={view === "list"}
        />
      </div>

      {view === "board" ? (
        <>
          <section aria-labelledby="placement-board-heading">
            <h2
              id="placement-board-heading"
              className="mb-2 text-[26px] font-semibold tracking-tight text-ink"
            >
              Placement Board
            </h2>
            <p className="mb-6 text-[17px] text-ink-muted">
              {filtered
                ? `Showing ${studentCountLabel(students.length)} for the current search.`
                : `The five columns staff work in. A student whose placement ends without finishing their requirement comes back here, ready to be placed again. Only a student whose whole requirement is complete leaves the board.`}
            </p>

            <PlacementBoard students={students} canManage={canManage} />
          </section>

          {started.length > 0 ? (
            <section
              aria-labelledby="active-placements-heading"
              className="mt-10 rounded-3xl border border-line bg-surface p-7 sm:p-8"
            >
              <h2
                id="active-placements-heading"
                className="text-[24px] font-semibold tracking-tight text-ink"
              >
                Placements Already Started
              </h2>
              <p className="mt-2 text-[16px] text-ink-muted">
                {studentCountLabel(started.length)} on placement right now.
                Finishing one of these - and saying whether it completes the
                student&apos;s placement requirement - is done on their own
                placement page.
              </p>

              <ul className="mt-6 flex flex-col gap-3">
                {started.map((student) => (
                  <li key={student.id}>
                    <Link
                      href={`/students/${student.id}/placement`}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface-muted p-5 transition-colors hover:border-brand hover:bg-brand-soft/40"
                    >
                      <span className="min-w-0">
                        <span className="block text-[18px] font-semibold text-ink">
                          {studentFullName(student)}
                        </span>
                        <span className="mt-1 block text-[15px] text-ink-muted">
                          {student.currentPlacement?.partner?.name ??
                            "Partner not recorded"}
                          {student.currentPlacement?.actual_start_date
                            ? ` - started ${formatShortDate(student.currentPlacement.actual_start_date)}`
                            : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-[16px] font-medium text-brand-strong">
                        View Placement
                        <ChevronRight size={20} aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <section aria-labelledby="placement-list-heading">
          <h2
            id="placement-list-heading"
            className="mb-2 text-[26px] font-semibold tracking-tight text-ink"
          >
            All Students
          </h2>
          <p className="mb-6 text-[17px] text-ink-muted">
            {filtered
              ? `Showing ${studentCountLabel(students.length)} for the current search and filters.`
              : `Every active student, including those whose placement requirement is already complete. Showing all ${studentCountLabel(students.length)}.`}
          </p>

          <PlacementList
            students={students}
            emptyMessage={
              filtered
                ? "No students match this search. Try clearing the filters."
                : "There are no students yet."
            }
          />
        </section>
      )}
    </>
  );
}
