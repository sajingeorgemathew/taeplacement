import Link from "next/link";

import { studentCountLabel } from "@/lib/format";
import {
  PROGRAM_FULL_NAMES,
  PROGRAM_LABELS,
  PLACEMENT_STATUS_TONES,
  type Tone,
} from "@/lib/placement/constants";
import {
  PROGRAM_PRIMARY_STAGES,
  PROGRAM_SECONDARY_STAGES,
  programOperationsHref,
  type ProgramOperationsSummary,
} from "@/lib/placement/operations";

/**
 * The operational tones with their established meanings: coral for work the
 * student still owes, green for ready / happening / done, blue for arranged.
 */
const TONE_VALUE: Record<Tone, string> = {
  ready: "text-ready-ink",
  info: "text-info-ink",
  attention: "text-attention-ink",
  warning: "text-warning-ink",
  neutral: "text-ink",
};

const TONE_HOVER: Record<Tone, string> = {
  ready: "hover:border-ready-line hover:bg-ready-soft",
  info: "hover:border-info-line hover:bg-info-soft",
  attention: "hover:border-attention-line hover:bg-attention-soft",
  warning: "hover:border-warning-line hover:bg-warning-soft",
  neutral: "hover:border-line-strong hover:bg-surface-muted",
};

/**
 * One program's current placement operations.
 *
 * PSW and ECEA render through this same component so the two lanes read
 * identically: the program, how many students are being worked today, then
 * the five lifecycle stages as large clickable numbers. Needs Review and On
 * Hold sit underneath as a quieter line; they are real, but they are
 * exceptions to the flow rather than steps in it.
 *
 * Every number links to the Placement List filtered to this program and that
 * status, so a count is always one click from the students behind it.
 */
export default function ProgramOperationsCard({
  summary,
}: {
  summary: ProgramOperationsSummary;
}) {
  const program = summary.program;
  const untracked = summary.totalTrackedStudents === 0;

  return (
    <section
      aria-labelledby={`program-${program}-heading`}
      className="flex flex-col rounded-3xl border border-line bg-surface p-7 sm:p-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h3
            id={`program-${program}-heading`}
            className="text-[30px] font-semibold leading-none tracking-tight text-ink"
          >
            {PROGRAM_LABELS[program]}
          </h3>
          <p className="mt-2 text-[15px] text-ink-muted">
            {PROGRAM_FULL_NAMES[program]}
          </p>
        </div>
        <Link
          href={programOperationsHref(program)}
          className="text-[16px] font-medium text-brand-strong hover:underline"
        >
          Open {PROGRAM_LABELS[program]} list
        </Link>
      </div>

      <p className="mt-6 text-[18px] text-ink">
        <span className="text-[34px] font-semibold leading-none text-ink">
          {summary.totalTrackedStudents}
        </span>{" "}
        <span className="text-ink-muted">
          {summary.totalTrackedStudents === 1 ? "student" : "students"} in
          current placement operations
        </span>
      </p>

      {untracked ? (
        <p className="mt-3 text-[15px] text-ink-muted">
          No {PROGRAM_LABELS[program]} batch is tracked yet. An admin switches
          a batch on in Batch Management with &ldquo;Track in Placement
          Operations&rdquo;.
        </p>
      ) : null}

      <ul className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {PROGRAM_PRIMARY_STAGES.map((stage) => {
          const tone = PLACEMENT_STATUS_TONES[stage.status];
          const value = summary[stage.field];
          return (
            <li key={stage.status}>
              <Link
                href={programOperationsHref(program, stage.status)}
                className={`flex h-full flex-col justify-between rounded-2xl border border-line bg-surface-muted px-5 py-5 transition-colors ${TONE_HOVER[tone]}`}
                aria-label={`${PROGRAM_LABELS[program]} ${stage.label}: ${studentCountLabel(value)}`}
              >
                <span className="text-[15px] font-medium leading-snug text-ink-muted">
                  {stage.label}
                </span>
                <span
                  className={`mt-4 text-[40px] font-semibold leading-none ${TONE_VALUE[tone]}`}
                >
                  {value}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
        {PROGRAM_SECONDARY_STAGES.map((stage) => (
          <li key={stage.status}>
            <Link
              href={programOperationsHref(program, stage.status)}
              className="text-ink-muted hover:text-brand-strong hover:underline"
            >
              {stage.label}{" "}
              <span className="font-semibold text-ink">{summary[stage.field]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
