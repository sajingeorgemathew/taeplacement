import { ArrowRight, History } from "lucide-react";
import Link from "next/link";

import { formatDate, studentCountLabel } from "@/lib/format";
import type { BatchRow } from "@/lib/supabase/database.types";

type Counts = {
  total: number;
  needingPlacement: number;
  placementReady: number;
};

const EMPTY_COUNTS: Counts = {
  total: 0,
  needingPlacement: 0,
  placementReady: 0,
};

function CountLine({ counts }: { counts: Counts }) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <span className="rounded-full border border-attention-line bg-attention-soft px-4 py-2 text-[15px] font-medium text-attention-ink">
        {counts.needingPlacement} needing placement
      </span>
      <span className="rounded-full border border-ready-line bg-ready-soft px-4 py-2 text-[15px] font-medium text-ready-ink">
        {counts.placementReady} placement ready
      </span>
    </div>
  );
}

/** Large batch card. Browsing by batch is the primary way into the roster. */
export default function BatchCard({
  batch,
  counts = EMPTY_COUNTS,
}: {
  batch: BatchRow;
  counts?: Counts;
}) {
  const startDate = formatDate(batch.start_date);

  return (
    <div className="flex flex-col rounded-3xl border border-line bg-surface p-7">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[24px] font-semibold leading-tight tracking-tight text-ink">
          {batch.name}
        </h3>
        {batch.status === "archived" ? (
          <span className="shrink-0 rounded-full border border-line bg-surface-muted px-3.5 py-1.5 text-[14px] font-medium text-ink-muted">
            Archived
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-[16px] text-ink-muted">
        {batch.program}
        {batch.schedule_label ? ` - ${batch.schedule_label}` : ""}
      </p>
      {startDate ? (
        <p className="mt-1 text-[15px] text-ink-muted">Starts {startDate}</p>
      ) : null}

      <p className="mt-5 text-[28px] font-semibold leading-none text-ink">
        {counts.total}
      </p>
      <p className="mt-2 text-[15px] text-ink-muted">
        {studentCountLabel(counts.total)} in this batch
      </p>

      <CountLine counts={counts} />

      <div className="h-6" />

      <Link
        href={`/students/batches/${batch.id}`}
        className="mt-auto inline-flex items-center justify-between gap-2 rounded-2xl border border-line px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
      >
        <span>View Batch</span>
        <ArrowRight size={20} aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * Previous / Returning students. This is a view over is_returning, not a batch
 * record, so it gets its own card rather than a fake batch.
 */
export function ReturningCard({ total }: { total: number }) {
  return (
    <div className="flex flex-col rounded-3xl border border-line bg-surface p-7">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[24px] font-semibold leading-tight tracking-tight text-ink">
          Previous / Returning
        </h3>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-ink-muted">
          <History size={22} aria-hidden="true" />
        </span>
      </div>

      <p className="mt-2 text-[16px] text-ink-muted">
        Students marked as returning
      </p>

      <p className="mt-5 text-[28px] font-semibold leading-none text-ink">
        {total}
      </p>
      <p className="mt-2 text-[15px] text-ink-muted">
        {studentCountLabel(total)} marked returning
      </p>

      <div className="h-6" />

      <Link
        href="/students/returning"
        className="mt-auto inline-flex items-center justify-between gap-2 rounded-2xl border border-line px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
      >
        <span>View Returning</span>
        <ArrowRight size={20} aria-hidden="true" />
      </Link>
    </div>
  );
}
