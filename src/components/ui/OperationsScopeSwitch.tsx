import { Radar, Users } from "lucide-react";
import Link from "next/link";

import type { OperationsScope } from "@/lib/placement/operations";

/**
 * The one control that widens or narrows the working population.
 *
 *   Current Operations   active students in active batches that are tracked
 *                        in Placement Operations. The default everywhere.
 *   Show All Students    the broader existing population: every active
 *                        student, untracked and archived batches included.
 *
 * Two links, nothing else. The choice lives in the URL (operations=all), so it
 * survives the ordinary filters, a reload, and a shared link, and Clear
 * filters never touches it. Nothing is deleted, archived, or changed by either
 * side; the old students are one click away in both directions.
 */
const BASE =
  "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[15px] font-semibold transition-colors";
const ON = "bg-brand text-white";
const OFF =
  "border border-line bg-surface text-ink hover:border-brand hover:bg-brand-soft hover:text-brand-strong";

export default function OperationsScopeSwitch({
  scope,
  currentHref,
  allHref,
  legend = "Which students to show",
}: {
  scope: OperationsScope;
  currentHref: string;
  allHref: string;
  legend?: string;
}) {
  const current = scope === "current";

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label={legend}
        className="flex flex-wrap items-center gap-2"
      >
        <Link
          href={currentHref}
          aria-current={current ? "page" : undefined}
          className={`${BASE} ${current ? ON : OFF}`}
        >
          <Radar size={18} aria-hidden="true" />
          Current Operations
        </Link>
        <Link
          href={allHref}
          aria-current={current ? undefined : "page"}
          className={`${BASE} ${current ? OFF : ON}`}
        >
          <Users size={18} aria-hidden="true" />
          Show All Students
        </Link>
      </div>
      <p className="text-[15px] text-ink-muted">
        {current
          ? "Active students in active batches tracked in Placement Operations. Older and untracked batches are one click away under Show All Students."
          : "Every active student, including batches that are not tracked in Placement Operations and archived batches."}
      </p>
    </div>
  );
}
