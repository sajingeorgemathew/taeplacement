import { ChevronRight, MapPinOff, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { areaColorStyle } from "@/lib/partners/area-colors";
import type { BatchPlanning, PlanningCityRow } from "@/lib/planning/batch";

/**
 * "Where Students Live".
 *
 * The whole batch by normalized city, every student exactly once, with the
 * Placement Area each city maps to. The three non-answers are all shown
 * rather than hidden, and none of them is guessed into an Area:
 *
 *   Mapped         the Area, in the Area's own colour
 *   Unmapped City  "Unmapped", a decision for Admin at /admin/city-area-mapping
 *   Needs Review   the city maps to an ARCHIVED Area; named so it can be fixed
 *   City Missing   the student record has no city; a record correction
 *
 * Each city row opens the students who live there. City Missing opens the
 * existing PLACEMENT-05A view for students with no city.
 */

function AreaCell({ row }: { row: PlanningCityRow }) {
  if (row.state === "mapped" && row.area) {
    const color = areaColorStyle(row.area.color_key);
    return (
      <span className="inline-flex items-center gap-2 text-[16px] font-medium text-ink">
        <span
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 rounded-full ${color.swatch}`}
        />
        {row.area.name}
      </span>
    );
  }

  if (row.state === "needs_review" && row.area) {
    return (
      <span className="inline-flex items-start gap-1.5 text-[15px] font-medium text-attention-ink">
        <TriangleAlert size={17} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>
          Needs Area Review
          <span className="block text-[14px] font-normal">
            mapped to {row.area.name}, which is archived
          </span>
        </span>
      </span>
    );
  }

  if (row.state === "missing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-attention-ink">
        <TriangleAlert size={17} aria-hidden="true" />
        Needs attention
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-attention-ink">
      <MapPinOff size={17} aria-hidden="true" />
      Unmapped
    </span>
  );
}

export default function CityBreakdown({
  planning,
  cityHref,
  missingHref,
}: {
  planning: BatchPlanning;
  /** The drill-down for one normalized city. */
  cityHref: (key: string) => string;
  /** The existing City Missing drill-down. */
  missingHref: string;
}) {
  if (planning.cities.length === 0) {
    return (
      <div className="rounded-3xl border border-line bg-surface p-8">
        <p className="text-[17px] text-ink-muted">
          No active students are assigned to this batch yet.
        </p>
      </div>
    );
  }

  const mapped = planning.cities.filter((row) => row.state === "mapped");
  const distinctAreas = new Set(mapped.map((row) => row.area?.id)).size;

  return (
    <div className="rounded-3xl border border-line bg-surface p-3 sm:p-4">
      <div className="hidden grid-cols-[1fr_6rem_1fr_2rem] items-center gap-4 px-4 pb-2 pt-2 text-[14px] font-semibold uppercase tracking-wide text-ink-muted sm:grid">
        <span>City</span>
        <span className="text-right">Students</span>
        <span>Placement Area</span>
        <span />
      </div>

      <ul className="flex flex-col gap-1.5">
        {planning.cities.map((row) => {
          const href = row.state === "missing" ? missingHref : cityHref(row.key);
          return (
            <li key={row.key || "missing"}>
              <Link
                href={href}
                className={`grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-2xl border px-4 py-3.5 transition-colors hover:border-brand hover:bg-brand-soft/40 sm:grid-cols-[1fr_6rem_1fr_2rem] ${
                  row.state === "mapped"
                    ? "border-line bg-surface"
                    : "border-attention-line bg-attention-soft/40"
                }`}
              >
                <span className="text-[18px] font-medium text-ink">
                  {row.label}
                </span>
                <span className="text-right text-[20px] font-semibold text-ink">
                  {row.count}
                </span>
                <span className="col-span-2 sm:col-span-1">
                  <AreaCell row={row} />
                </span>
                <ChevronRight
                  size={20}
                  aria-hidden="true"
                  className="hidden text-ink-muted sm:block"
                />
                <span className="sr-only">
                  {" "}
                  - open the {row.count === 1 ? "student" : "students"} from{" "}
                  {row.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="px-4 pb-1 pt-4 text-[15px] text-ink-muted">
        {planning.counts.total === 1
          ? "1 student"
          : `${planning.counts.total} students`}{" "}
        across {planning.cities.length}{" "}
        {planning.cities.length === 1 ? "row" : "rows"},{" "}
        {distinctAreas === 1
          ? "1 Placement Area"
          : `${distinctAreas} Placement Areas`}
        . Cities are grouped by spelling only; nothing is corrected or guessed.
      </p>
    </div>
  );
}
