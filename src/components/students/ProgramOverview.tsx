import { ArrowRight, History, Settings } from "lucide-react";
import Link from "next/link";

import { formatDate, studentCountLabel } from "@/lib/format";
import type {
  OverviewBatchShape,
  ProgramOverview,
  ProgramOverviewBatch,
} from "@/lib/placement/operations";

/**
 * The program-first overview on the Students page.
 *
 * PROGRAM is the primary shape: one compact section per supported program,
 * PSW and ECEA, side by side on desktop. Inside each, the tracked active
 * batches of that program are compact rows, not one tall card after another.
 *
 * What a section shows comes straight from buildProgramOverview(): the
 * program's count in current placement operations (the dashboard's number)
 * and its operational batches. An active batch nobody has switched on, or an
 * archived batch, is not here; it is reachable through Show All Students, its
 * own batch page, and Batch Management.
 */
export default function ProgramOverviewGrid<B extends OverviewBatchShape>({
  programs,
}: {
  programs: ProgramOverview<B>[];
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {programs.map((program) => (
        <ProgramSection key={program.program} program={program} />
      ))}
    </div>
  );
}

function ProgramSection<B extends OverviewBatchShape>({
  program,
}: {
  program: ProgramOverview<B>;
}) {
  return (
    <section
      aria-labelledby={`program-${program.program}-heading`}
      className="flex flex-col rounded-3xl border border-line bg-surface p-6 sm:p-7"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3
            id={`program-${program.program}-heading`}
            className="text-[26px] font-semibold leading-tight tracking-tight text-ink"
          >
            {program.label}
          </h3>
          <p className="mt-1 text-[16px] text-ink-muted">{program.fullName}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[30px] font-semibold leading-none text-ink">
            {program.trackedStudents}
          </p>
          <p className="mt-1.5 text-[14px] text-ink-muted">
            in current operations
          </p>
        </div>
      </div>

      <div className="mt-5">
        {program.batches.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface-muted px-5 py-4">
            <p className="text-[15px] text-ink-muted">
              No {program.label} batch is tracked in Placement Operations yet.
              An admin can switch one on in Batch Management.
            </p>
            <Link
              href="/admin/batches"
              className="mt-3 inline-flex items-center gap-1.5 text-[15px] font-medium text-brand-strong hover:underline"
            >
              <Settings size={16} aria-hidden="true" />
              Open Batch Management
            </Link>
          </div>
        ) : (
          <BatchRowList batches={program.batches} />
        )}
      </div>
    </section>
  );
}

/** Compact batch rows: name, schedule and start on one muted line, count, link. */
export function BatchRowList<B extends OverviewBatchShape>({
  batches,
}: {
  batches: ProgramOverviewBatch<B>[];
}) {
  return (
    <ul className="flex flex-col gap-2">
      {batches.map((batch) => (
        <li key={batch.id}>
          <BatchRowItem batch={batch} />
        </li>
      ))}
    </ul>
  );
}

function BatchRowItem<B extends OverviewBatchShape>({
  batch,
}: {
  batch: ProgramOverviewBatch<B>;
}) {
  const startDate = formatDate(batch.start_date);
  const detail = [
    batch.schedule_label,
    startDate ? `Starts ${startDate}` : null,
  ]
    .filter(Boolean)
    .join(" - ");

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-surface-muted px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-medium text-ink">{batch.name}</p>
        {detail ? (
          <p className="mt-0.5 text-[14px] text-ink-muted">{detail}</p>
        ) : null}
      </div>
      <p className="text-[15px] text-ink-muted">
        {studentCountLabel(batch.studentCount)}
      </p>
      <Link
        href={`/students/batches/${batch.id}`}
        className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-[15px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
      >
        View Batch
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * Previous / Returning, as one compact row rather than a card. It is a view
 * over students.is_returning, not a batch, and it is never scoped: a returning
 * student is a returning student whichever batch they came from.
 */
export function ReturningRow({ total }: { total: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-surface px-5 py-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-ink-muted">
        <History size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-medium text-ink">Previous / Returning</p>
        <p className="mt-0.5 text-[14px] text-ink-muted">
          Students marked as returning, across programs and batches.
        </p>
      </div>
      <p className="text-[15px] text-ink-muted">{studentCountLabel(total)}</p>
      <Link
        href="/students/returning"
        className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3.5 py-2 text-[15px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
      >
        View Returning
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}
