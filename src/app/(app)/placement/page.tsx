import {
  Building2,
  CheckCircle2,
  ClipboardList,
  PauseCircle,
  UserCheck,
} from "lucide-react";

import PlacementBoard from "@/components/placement/PlacementBoard";
import PlacementList from "@/components/placement/PlacementList";
import PlacementToolbar from "@/components/placement/PlacementToolbar";
import PlacementViewSwitch from "@/components/placement/PlacementViewSwitch";
import SummaryBlock from "@/components/ui/SummaryBlock";
import { canManagePlacements, getStaffSession } from "@/lib/auth/session";
import { studentCountLabel } from "@/lib/format";
import { listPartners, listPlacementAreas } from "@/lib/partners/queries";
import { todayKey } from "@/lib/placement/attention";
import {
  getPlacementCounts,
  listPlacementStudents,
} from "@/lib/placement/queries";
import {
  hasActivePlacementFilters,
  isCurrentOperationsView,
  placementFiltersFrom,
  placementHref,
  placementToolbarValuesFrom,
  placementViewFrom,
} from "@/lib/placement/filters";
import {
  ALL_STUDENTS_VALUE,
  OPERATIONS_PARAM,
} from "@/lib/placement/operations";
import { listBatches } from "@/lib/students/queries";

export const metadata = {
  title: "Placement",
};

const BASE_PATH = "/placement";
const PLANNING_PATH = "/placement/planning";

/** Batch Planning, keeping the chosen batch and an explicit Show All scope. */
function planningLink(batchId: string, currentOperations: boolean): string {
  const params = new URLSearchParams();
  if (batchId) params.set("batch", batchId);
  if (!currentOperations) params.set(OPERATIONS_PARAM, ALL_STUDENTS_VALUE);
  const query = params.toString();
  return query ? `${PLANNING_PATH}?${query}` : PLANNING_PATH;
}

export default async function PlacementPage(
  props: PageProps<"/placement">,
) {
  const searchParams = await props.searchParams;
  const values = placementToolbarValuesFrom(searchParams);
  const view = placementViewFrom(values);

  const filters = placementFiltersFrom(values);
  const [students, counts, batches, areas, partners, session] =
    await Promise.all([
      listPlacementStudents(filters),
      // The summary blocks count the same population the page shows, so a
      // block and the list its link opens always agree.
      getPlacementCounts({ currentOperations: filters.currentOperations }),
      listBatches(),
      listPlacementAreas(),
      listPartners(),
      getStaffSession(),
    ]);

  const canManage = canManagePlacements(session);
  const filtered = hasActivePlacementFilters(values);
  const currentOperations = isCurrentOperationsView(values);
  const shownLabel = currentOperations
    ? `${studentCountLabel(students.length)} in current placement operations`
    : `${studentCountLabel(students.length)} across all batches`;
  // Summary links keep the scope staff chose; the default scope needs nothing
  // in the URL.
  const scopeQuery = currentOperations
    ? ""
    : `&${OPERATIONS_PARAM}=${ALL_STUDENTS_VALUE}`;
  const activeAreas = areas.filter((area) => area.is_active);
  // One today for the whole board, resolved on the server, so every card reads
  // its planned and actual dates against the same day.
  const today = todayKey();

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
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <SummaryBlock
            label="Ready for Placement"
            value={counts.readyForPlacement}
            note="Documents complete. These students are waiting for a partner."
            tone="ready"
            icon={UserCheck}
            href={`${BASE_PATH}?view=list&status=ready_for_placement${scopeQuery}`}
          />
          <SummaryBlock
            label="Placement Assigned"
            value={counts.assigned}
            note="Matched with a placement partner."
            tone="info"
            icon={Building2}
            href={`${BASE_PATH}?view=list&status=placement_assigned${scopeQuery}`}
          />
          <SummaryBlock
            label="On Placement"
            value={counts.started}
            note="At their partner right now. Finished, never cancelled."
            tone="ready"
            icon={ClipboardList}
            href={`${BASE_PATH}?view=list&status=placement_started${scopeQuery}`}
          />
          <SummaryBlock
            label="On Hold"
            value={counts.onHold}
            note="Paused on purpose. Released by staff, never automatically."
            tone="attention"
            icon={PauseCircle}
            href={`${BASE_PATH}?view=list&status=on_hold${scopeQuery}`}
          />
          <SummaryBlock
            label="Placement Completed"
            value={counts.byStatus.placement_completed}
            note="Their whole placement requirement is finished. Off the working board."
            tone="ready"
            icon={CheckCircle2}
            href={`${BASE_PATH}?view=list&status=placement_completed${scopeQuery}`}
          />
        </div>
      </section>

      <div className="mb-7 flex flex-col gap-6">
        <PlacementViewSwitch
          current={view}
          boardHref={placementHref(BASE_PATH, values, { view: "" })}
          // The batch already chosen here carries into planning, and so does
          // an explicit Show All scope, so switching views keeps the batch a
          // planner is looking at even when it is a historical one.
          planningHref={planningLink(values.batch, currentOperations)}
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
        <section aria-labelledby="placement-board-heading">
          <h2
            id="placement-board-heading"
            className="mb-2 text-[26px] font-semibold tracking-tight text-ink"
          >
            Placement Board
          </h2>
          <p className="mb-6 text-[17px] text-ink-muted">
            {filtered
              ? `Showing ${shownLabel} for the current search and filters.`
              : `Showing ${shownLabel}. The six columns staff work in, ending with the students who are at a partner right now. A student whose placement ends without finishing their requirement comes back here, ready to be placed again. Only a student whose whole requirement is complete leaves the board.`}
          </p>

          <PlacementBoard
            students={students}
            canManage={canManage}
            today={today}
          />
        </section>
      ) : (
        <section aria-labelledby="placement-list-heading">
          <h2
            id="placement-list-heading"
            className="mb-2 text-[26px] font-semibold tracking-tight text-ink"
          >
            {currentOperations ? "Current Placement Operations" : "All Students"}
          </h2>
          <p className="mb-6 text-[17px] text-ink-muted">
            {filtered
              ? `Showing ${shownLabel} for the current search and filters.`
              : currentOperations
                ? `Active students in batches tracked in Placement Operations, including those whose placement requirement is already complete. Showing ${shownLabel}.`
                : `Every active student, including untracked and archived batches and those whose placement requirement is already complete. Showing ${shownLabel}.`}
          </p>

          <PlacementList
            students={students}
            emptyMessage={
              filtered
                ? "No students match this search. Try clearing the filters."
                : currentOperations
                  ? "No students are in current placement operations yet. Switch a batch on in Batch Management, or choose Show All Students."
                  : "There are no students yet."
            }
          />
        </section>
      )}
    </>
  );
}
