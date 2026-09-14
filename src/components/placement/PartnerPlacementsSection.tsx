import { ChevronRight, GraduationCap } from "lucide-react";
import Link from "next/link";

import StatusPill from "@/components/ui/StatusPill";
import { formatDate, studentCountLabel, studentFullName } from "@/lib/format";
import {
  PLACEMENT_RECORD_STATUS_LABELS,
  PLACEMENT_RECORD_STATUS_TONES,
} from "@/lib/placement/constants";
import { formatCreditedHours } from "@/lib/placement/hours";
import type { PartnerPlacement, PartnerPlacements } from "@/lib/placement/queries";

/**
 * The one line that says how a past placement ended.
 *
 * A transfer and a cancellation are different facts and are never collapsed
 * into each other: a student who worked here and moved on ended early, and
 * their credited hours still stand.
 */
function outcomeLine(placement: PartnerPlacement): string | null {
  if (placement.status === "ended_early") {
    return placement.end_reason
      ? `Ended early: ${placement.end_reason}`
      : "Ended early. The student may have continued elsewhere.";
  }
  if (placement.status === "cancelled") {
    return placement.cancellation_reason
      ? `Cancelled: ${placement.cancellation_reason}`
      : "Cancelled before the placement started.";
  }
  return placement.completion_note;
}

/**
 * The one line of dates under a student's name.
 *
 * A live placement is answering an operational question - when does this
 * student start, or when did they, and when should they finish - so a started
 * placement leads with its ACTUAL start and its planned end. A finished one
 * leads with the day it ended, because that is what history is for.
 */
function dateLine(placement: PartnerPlacement): string | null {
  if (placement.status === "started") {
    const startedOn = formatDate(placement.actual_start_date);
    const plannedEnd = formatDate(placement.planned_end_date);
    const parts = [
      startedOn ? `started ${startedOn}` : "start date not recorded",
      plannedEnd ? `planned end ${plannedEnd}` : null,
    ].filter(Boolean);
    return parts.join(" - ");
  }

  if (placement.status === "assigned") {
    const plannedStart = formatDate(placement.planned_start_date);
    return plannedStart
      ? `planned start ${plannedStart}`
      : "no planned start date yet";
  }

  const endedOn = formatDate(placement.actual_end_date);
  return endedOn ? `ended ${endedOn}` : null;
}

function PlacementRow({ placement }: { placement: PartnerPlacement }) {
  const student = placement.student;
  const hours = formatCreditedHours(placement.credited_hours);
  const outcome = outcomeLine(placement);
  const dates = dateLine(placement);

  if (!student) {
    return (
      <li className="rounded-2xl border border-line bg-surface-muted p-5">
        <p className="text-[16px] text-ink-muted">
          A placement record whose student is no longer readable.
        </p>
      </li>
    );
  }

  return (
    <li>
      <Link
        href={`/students/${student.id}`}
        className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-muted p-5 transition-colors hover:border-brand hover:bg-brand-soft/40 lg:flex-row lg:items-center"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[19px] font-semibold leading-snug text-ink">
              {studentFullName(student)}
            </span>
            <span className="text-[15px] text-ink-muted">
              {student.student_number}
            </span>
          </div>
          <p className="mt-1 text-[15px] text-ink-muted">
            {student.batch?.name ?? "No batch assigned"}
            {dates ? ` - ${dates}` : ""}
          </p>
          {outcome ? (
            <p className="mt-1 break-words text-[15px] text-ink-muted">
              {outcome}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
          {hours ? (
            <StatusPill label={`${hours} credited`} tone="ready" />
          ) : null}
          <StatusPill
            label={PLACEMENT_RECORD_STATUS_LABELS[placement.status]}
            tone={PLACEMENT_RECORD_STATUS_TONES[placement.status]}
          />
        </div>

        <span className="flex items-center gap-1 text-[16px] font-medium text-brand-strong lg:shrink-0">
          Open Student
          <ChevronRight size={20} aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

/**
 * The students placed at one partner.
 *
 * This is what the PLACEMENT-03 Current Placements placeholder becomes: the
 * real relationships, the live ones first and the finished ones below with
 * their outcome and their credited hours.
 *
 * It is not a check-in log, not attendance, and not a timesheet. credited_hours
 * is one accepted total per placement; what happens DURING a placement is
 * PLACEMENT-05.
 */
export default function PartnerPlacementsSection({
  placements,
}: {
  placements: PartnerPlacements;
}) {
  const { current, history } = placements;

  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="mb-4 text-[16px] text-ink-muted">
          {current.length === 0
            ? "No students are placed here right now."
            : `${studentCountLabel(current.length)} placed here right now, whether they are waiting to start or already on placement.`}
        </p>

        {current.length === 0 ? (
          <div className="flex items-start gap-4 rounded-2xl border border-line bg-surface-muted p-6">
            <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-ink-muted">
              <GraduationCap size={22} aria-hidden="true" />
            </span>
            <p className="text-[17px] text-ink-muted">
              A student assigned to this partner will appear here. Assignments
              start from a Ready student on the Placement Board.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {current.map((placement) => (
              <PlacementRow key={placement.id} placement={placement} />
            ))}
          </ul>
        )}
      </div>

      {history.length > 0 ? (
        <div className="border-t border-line pt-7">
          <h3 className="text-[19px] font-semibold text-ink">
            Past Placements
          </h3>
          <p className="mb-4 mt-1 text-[16px] text-ink-muted">
            Placements that completed here, ended early, or were cancelled
            before they started, with the hours each one credited. Records are
            kept, never deleted.
          </p>
          <ul className="flex flex-col gap-3">
            {history.map((placement) => (
              <PlacementRow key={placement.id} placement={placement} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
