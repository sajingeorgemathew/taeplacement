import Link from "next/link";

import StatusPill from "@/components/ui/StatusPill";
import { formatDate, formatTimestamp } from "@/lib/format";
import {
  PLACEMENT_RECORD_STATUS_LABELS,
  PLACEMENT_RECORD_STATUS_TONES,
} from "@/lib/placement/constants";
import { formatCreditedHours } from "@/lib/placement/hours";
import type { StudentPlacement } from "@/lib/placement/queries";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[15px] text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-[16px] text-ink">{value ?? "Not recorded"}</dd>
    </div>
  );
}

/**
 * Every placement a student has ever had.
 *
 * Nothing is ever removed from this list. A placement that ended early is a
 * real thing that happened - often 120 real hours of it - and reading a year
 * later that a student transferred rather than "was cancelled" is usually the
 * most useful line on the page.
 */
export default function PlacementHistory({
  placements,
  emptyMessage,
}: {
  placements: StudentPlacement[];
  emptyMessage: string;
}) {
  if (placements.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface-muted p-6">
        <p className="text-[17px] text-ink-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {placements.map((placement) => (
        <li
          key={placement.id}
          className="rounded-2xl border border-line bg-surface-muted p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              {placement.partner ? (
                <Link
                  href={`/placement-partners/${placement.partner.id}`}
                  className="text-[19px] font-semibold leading-snug text-ink hover:text-brand-strong"
                >
                  {placement.partner.name}
                </Link>
              ) : (
                <p className="text-[19px] font-semibold text-ink">
                  Partner record not available
                </p>
              )}
              <p className="mt-1 text-[15px] text-ink-muted">
                Assigned {formatTimestamp(placement.assigned_at)}
                {placement.assignedByName
                  ? ` by ${placement.assignedByName}`
                  : ""}
              </p>
            </div>
            <StatusPill
              label={PLACEMENT_RECORD_STATUS_LABELS[placement.status]}
              tone={PLACEMENT_RECORD_STATUS_TONES[placement.status]}
            />
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Actual Start"
              value={formatDate(placement.actual_start_date)}
            />
            <Field
              label="Actual End"
              value={formatDate(placement.actual_end_date)}
            />
            <Field
              label="Credited Hours"
              value={formatCreditedHours(placement.credited_hours)}
            />
            <Field
              label="Planned Start"
              value={formatDate(placement.planned_start_date)}
            />
          </dl>

          {placement.completion_note ? (
            <div className="mt-4 rounded-xl border border-line bg-surface px-4 py-3">
              <p className="text-[15px] text-ink-muted">
                Completion / Transfer Note
              </p>
              <p className="mt-0.5 whitespace-pre-line break-words text-[16px] text-ink">
                {placement.completion_note}
              </p>
            </div>
          ) : null}

          {placement.assignment_note ? (
            <div className="mt-3 rounded-xl border border-line bg-surface px-4 py-3">
              <p className="text-[15px] text-ink-muted">Assignment Note</p>
              <p className="mt-0.5 whitespace-pre-line break-words text-[16px] text-ink">
                {placement.assignment_note}
              </p>
            </div>
          ) : null}

          {placement.status === "ended_early" ? (
            <p className="mt-3 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-[16px] text-warning-ink">
              Ended early
              {placement.end_reason
                ? `: ${placement.end_reason}`
                : ". No reason recorded."}{" "}
              The student may have continued their placement elsewhere.
            </p>
          ) : null}

          {placement.status === "cancelled" ? (
            <p className="mt-3 rounded-xl border border-line bg-surface px-4 py-3 text-[16px] text-ink-muted">
              Cancelled {formatTimestamp(placement.cancelled_at) ?? "earlier"}
              {placement.cancellation_reason
                ? `: ${placement.cancellation_reason}`
                : ". No reason recorded."}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
