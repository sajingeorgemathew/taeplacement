import { Building2, CalendarClock, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";

import {
  DocumentStatusPill,
  PlacementStatusPill,
} from "@/components/ui/StatusPill";
import { formatShortDate, studentFullName } from "@/lib/format";
import type { PlacementBoardStudent } from "@/lib/placement/queries";
import { locationLabel } from "@/lib/students/address";

/** "11 of 13". The same derived readiness the board and the checklist show. */
function ReadinessText({ student }: { student: PlacementBoardStudent }) {
  const readiness = student.readiness;
  if (!readiness || readiness.requiredTotal === 0) return null;

  const classes = readiness.isReady
    ? "border-ready-line bg-ready-soft text-ready-ink"
    : readiness.reviewedCount === 0
      ? "border-line bg-surface-muted text-ink-muted"
      : "border-attention-line bg-attention-soft text-attention-ink";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-4 py-2 text-[15px] font-medium ${classes}`}
    >
      {readiness.requiredReady} of {readiness.requiredTotal} ready
    </span>
  );
}

/**
 * One comfortable placement row.
 *
 * List View exists for searching, not for density: it is the same information
 * as a board card laid out along a line, and completed placements are visible
 * here because this is where history belongs.
 */
function PlacementRow({
  student,
  action,
}: {
  student: PlacementBoardStudent;
  /** Optional extra control rendered under the row, outside its link. */
  action?: React.ReactNode;
}) {
  const placement = student.currentPlacement;
  const plannedStart = formatShortDate(placement?.planned_start_date);

  return (
    <li>
      <Link
        href={`/students/${student.id}`}
        className="flex flex-col gap-5 rounded-3xl border border-line bg-surface p-6 transition-colors hover:border-brand hover:bg-brand-soft/40 sm:p-7 lg:flex-row lg:items-center"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[21px] font-semibold leading-tight text-ink">
              {studentFullName(student)}
            </span>
            <span className="text-[16px] text-ink-muted">
              {student.student_number}
            </span>
          </div>

          <p className="mt-2 text-[16px] text-ink-muted">
            {student.batch?.name ?? "No batch assigned"} - {student.program}
          </p>

          <p className="mt-1 flex items-start gap-2 text-[15px] text-ink-muted">
            <MapPin size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">{locationLabel(student)}</span>
          </p>

          {placement?.partner ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <Building2 size={17} aria-hidden="true" />
                {placement.partner.name}
              </span>
              {plannedStart ? (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock size={17} aria-hidden="true" />
                  Starts {plannedStart}
                </span>
              ) : null}
            </p>
          ) : null}

          {student.placement_status === "on_hold" &&
          student.placement_hold_reason ? (
            <p className="mt-2 text-[15px] text-attention-ink">
              On hold: {student.placement_hold_reason}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:w-[24rem] lg:shrink-0">
          <PlacementStatusPill status={student.placement_status} />
          <DocumentStatusPill status={student.document_status} />
          <ReadinessText student={student} />
        </div>

        <span className="flex items-center gap-1 text-[16px] font-medium text-brand-strong lg:shrink-0">
          Open Student
          <ChevronRight size={20} aria-hidden="true" />
        </span>
      </Link>
      {action ? <div className="mt-2 pl-6 sm:pl-7">{action}</div> : null}
    </li>
  );
}

export default function PlacementList({
  students,
  emptyMessage,
  renderAction,
}: {
  students: PlacementBoardStudent[];
  emptyMessage: string;
  /**
   * Optional per-row control, rendered OUTSIDE the row's link so nothing is
   * nested inside an anchor. Batch Planning uses it to point a ready student at
   * the existing Find Placement flow; every other caller passes nothing and the
   * markup is unchanged.
   */
  renderAction?: (student: PlacementBoardStudent) => React.ReactNode;
}) {
  if (students.length === 0) {
    return (
      <div className="rounded-3xl border border-line bg-surface p-8">
        <p className="text-[17px] text-ink-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {students.map((student) => (
        <PlacementRow
          key={student.id}
          student={student}
          action={renderAction?.(student)}
        />
      ))}
    </ul>
  );
}
