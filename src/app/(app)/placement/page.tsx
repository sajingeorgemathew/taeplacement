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
const PLANNING_PATH = "/placement/planning";

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
            label="On Placement"
            value={counts.started}
            note="At their partner right now. Finished, never cancelled."
            tone="ready"
            icon={ClipboardList}
            href={`${BASE_PATH}?view=list&status=placement_started`}
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
        <PlacementViewSwitch
          current={view}
          boardHref={placementHref(BASE_PATH, values, { view: "" })}
          // The batch already chosen here carries into planning, so switching
          // views keeps the batch a planner is looking at.
          planningHref={
            values.batch
              ? `${PLANNING_PATH}?batch=${encodeURIComponent(values.batch)}`
              : PLANNING_PATH
          }
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
              ? `Showing ${studentCountLabel(students.length)} for the current search.`
              : `The six columns staff work in, ending with the students who are at a partner right now. A student whose placement ends without finishing their requirement comes back here, ready to be placed again. Only a student whose whole requirement is complete leaves the board.`}
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
