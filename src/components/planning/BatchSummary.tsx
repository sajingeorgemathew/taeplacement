import Link from "next/link";

import { formatDate, studentCountLabel } from "@/lib/format";
import {
  PLACEMENT_STATUS_LABELS,
  PLACEMENT_STATUS_TONES,
  type PlacementStatus,
  type Tone,
} from "@/lib/placement/constants";
import { isOperationalBatch } from "@/lib/placement/operations";
import type { BatchPlanning } from "@/lib/planning/batch";
import {
  PLANNING_BREAKDOWN_STATUSES,
  PLANNING_EXTRA_STATUSES,
  PLANNING_STATUS_LABELS,
} from "@/lib/planning/constants";
import type { BatchRow } from "@/lib/supabase/database.types";

/**
 * The batch header and executive summary.
 *
 * Batch name, program, and total first, then the placement lifecycle as five
 * large counts and the two exceptions (Needs Review, On Hold) on a quieter
 * line. Every count is a plain tally of students.placement_status for the
 * active students of this batch: nothing is re-derived from documents or
 * placement records, and there is no summary table anywhere.
 *
 * Every count is a link to the students in this batch with that status, so a
 * number is never a dead end.
 */

const TONE_CLASSES: Record<Tone, string> = {
  info: "border-info-line bg-info-soft text-info-ink",
  ready: "border-ready-line bg-ready-soft text-ready-ink",
  attention: "border-attention-line bg-attention-soft text-attention-ink",
  warning: "border-warning-line bg-warning-soft text-warning-ink",
  neutral: "border-line bg-surface text-ink",
};

function StageTile({
  status,
  value,
  href,
}: {
  status: PlacementStatus;
  value: number;
  href: string;
}) {
  const tone: Tone = value > 0 ? PLACEMENT_STATUS_TONES[status] : "neutral";
  return (
    <Link
      href={href}
      className={`block rounded-2xl border p-5 transition-shadow hover:shadow-sm ${TONE_CLASSES[tone]}`}
    >
      <p className="text-[36px] font-semibold leading-none">{value}</p>
      <p className="mt-2 text-[15px] font-medium leading-snug">
        {PLANNING_STATUS_LABELS[status]}
      </p>
      <span className="sr-only">
        {" "}
        - open {studentCountLabel(value)} {PLACEMENT_STATUS_LABELS[status]}
      </span>
    </Link>
  );
}

function ExceptionTile({
  status,
  value,
  href,
}: {
  status: PlacementStatus;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-3 rounded-2xl border px-5 py-3 text-[16px] font-medium transition-shadow hover:shadow-sm ${
        value > 0
          ? TONE_CLASSES[PLACEMENT_STATUS_TONES[status]]
          : "border-line bg-surface text-ink-muted"
      }`}
    >
      {PLANNING_STATUS_LABELS[status]}
      <span className="text-[22px] font-semibold leading-none">{value}</span>
    </Link>
  );
}

export default function BatchSummary({
  batch,
  planning,
  statusHrefs,
}: {
  batch: BatchRow;
  planning: BatchPlanning;
  /** Where each count leads: the students in this batch with that status. */
  statusHrefs: Record<PlacementStatus, string>;
}) {
  const { byStatus, total } = planning.counts;
  const startDate = formatDate(batch.start_date);
  const context = [
    batch.program,
    startDate ? `starts ${startDate}` : null,
    batch.status === "archived"
      ? "archived batch"
      : isOperationalBatch(batch)
        ? null
        : "not tracked in Placement Operations",
  ].filter(Boolean);

  return (
    <div className="rounded-3xl border border-line bg-surface p-7 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold uppercase tracking-wide text-ink-muted">
            Selected batch
          </p>
          <h2 className="mt-1 text-[32px] font-semibold leading-tight tracking-tight text-ink sm:text-[36px]">
            {batch.name}
          </h2>
          <p className="mt-2 text-[17px] text-ink-muted">{context.join(" - ")}</p>
        </div>
        <div className="text-right">
          <p className="text-[48px] font-semibold leading-none text-ink">{total}</p>
          <p className="mt-1.5 text-[16px] font-medium text-ink-muted">
            {total === 1 ? "student" : "students"}
          </p>
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {PLANNING_BREAKDOWN_STATUSES.map((status) => (
          <StageTile
            key={status}
            status={status}
            value={byStatus[status]}
            href={statusHrefs[status]}
          />
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {PLANNING_EXTRA_STATUSES.map((status) => (
          <ExceptionTile
            key={status}
            status={status}
            value={byStatus[status]}
            href={statusHrefs[status]}
          />
        ))}
      </div>
    </div>
  );
}
