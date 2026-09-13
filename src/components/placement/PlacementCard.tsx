"use client";

import {
  Building2,
  CalendarClock,
  ChevronRight,
  GripVertical,
  MapPin,
  MessageSquare,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { DocumentStatusPill } from "@/components/ui/StatusPill";
import { formatShortDate, studentFullName } from "@/lib/format";
import { locationLabel } from "@/lib/students/address";
import type { PlacementBoardStudent } from "@/lib/placement/queries";

type PlacementCardProps = {
  student: PlacementBoardStudent;
  /** Only admin and placement_manager see the actions that change anything. */
  canManage: boolean;
  /** True while this card is the one being dragged. */
  dragging?: boolean;
  pending?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Put the student on hold, with the optional reason staff typed. */
  onHold?: (reason: string) => void;
  onRelease?: () => void;
};

/**
 * "11 of 13", the student's document readiness.
 *
 * The numbers come from the student_document_readiness view, the same source
 * the checklist and the student page use. The 13-document rules are never
 * re-implemented here: React only renders the answer.
 */
function ReadinessChip({ student }: { student: PlacementBoardStudent }) {
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
 * One student on the Placement Board.
 *
 * Deliberately not every student field: a name, who they are, where they are,
 * how far their documents have got, and their placement if they have one. The
 * full record is one click away on Open Student.
 */
export default function PlacementCard({
  student,
  canManage,
  dragging = false,
  pending = false,
  onDragStart,
  onDragEnd,
  onHold,
  onRelease,
}: PlacementCardProps) {
  const [holdOpen, setHoldOpen] = useState(false);
  const [reason, setReason] = useState("");

  const placement = student.currentPlacement;
  const plannedStart = formatShortDate(placement?.planned_start_date);
  const city = locationLabel(student);
  const draggable = canManage && Boolean(onDragStart);

  return (
    <li
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable) return;
        event.dataTransfer.setData("text/plain", student.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={() => onDragEnd?.()}
      className={`rounded-2xl border border-line bg-surface p-4 transition-opacity ${
        dragging ? "opacity-50" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-start gap-2">
        {draggable ? (
          <GripVertical
            size={20}
            aria-hidden="true"
            className="mt-1 shrink-0 text-ink-muted"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <Link
            href={`/students/${student.id}`}
            className="text-[18px] font-semibold leading-snug text-ink hover:text-brand-strong"
          >
            {studentFullName(student)}
          </Link>
          <p className="mt-0.5 text-[15px] text-ink-muted">
            {student.student_number}
          </p>
        </div>
      </div>

      <p className="mt-2 text-[15px] text-ink-muted">
        {student.batch?.name ?? "No batch assigned"}
      </p>

      <p className="mt-1 flex items-start gap-2 text-[15px] text-ink-muted">
        <MapPin size={17} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span className="min-w-0 break-words">{city}</span>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ReadinessChip student={student} />
        <DocumentStatusPill status={student.document_status} />
      </div>

      {placement?.partner ? (
        <div className="mt-3 rounded-xl border border-info-line bg-info-soft px-3 py-2.5">
          <p className="flex items-start gap-2 text-[15px] font-medium text-info-ink">
            <Building2 size={17} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">{placement.partner.name}</span>
          </p>
          {plannedStart ? (
            <p className="mt-1 flex items-center gap-1.5 text-[15px] text-info-ink">
              <CalendarClock size={17} aria-hidden="true" />
              <span className="sr-only">Planned start </span>
              Starts {plannedStart}
            </p>
          ) : (
            <p className="mt-1 text-[15px] text-info-ink/80">
              No planned start date yet
            </p>
          )}
        </div>
      ) : null}

      {student.placement_status === "on_hold" ? (
        <p className="mt-3 rounded-xl border border-attention-line bg-attention-soft px-3 py-2 text-[15px] text-attention-ink">
          {student.placement_hold_reason ?? "On hold. No reason recorded."}
        </p>
      ) : null}

      {student.noteCount > 0 ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[15px] text-ink-muted">
          <MessageSquare size={17} aria-hidden="true" />
          {student.noteCount === 1 ? "1 comment" : `${student.noteCount} comments`}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
        <Link
          href={`/students/${student.id}`}
          className="inline-flex items-center gap-1 text-[15px] font-medium text-brand-strong hover:underline"
        >
          Open Student
          <ChevronRight size={18} aria-hidden="true" />
        </Link>

        {placement ? (
          <Link
            href={`/students/${student.id}/placement`}
            className="inline-flex items-center gap-1 text-[15px] font-medium text-brand-strong hover:underline"
          >
            View Assignment
          </Link>
        ) : null}

        {canManage && !placement && student.placement_status === "ready_for_placement" ? (
          <Link
            href={`/placement/find/${student.id}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand bg-brand-soft px-3 py-2 text-[15px] font-semibold text-brand-strong transition-colors hover:bg-white"
          >
            <Search size={17} aria-hidden="true" />
            Find Placement
          </Link>
        ) : null}

        {canManage && student.placement_status === "on_hold" && onRelease ? (
          <button
            type="button"
            onClick={() => onRelease()}
            disabled={pending}
            className="inline-flex items-center gap-1 text-[15px] font-medium text-brand-strong hover:underline disabled:opacity-60"
          >
            Release Hold
          </button>
        ) : null}

        {canManage && student.placement_status !== "on_hold" && onHold ? (
          <button
            type="button"
            onClick={() => setHoldOpen((open) => !open)}
            aria-expanded={holdOpen}
            disabled={pending}
            className="inline-flex items-center gap-1 text-[15px] font-medium text-ink-muted hover:text-ink disabled:opacity-60"
          >
            Put On Hold
          </button>
        ) : null}
      </div>

      {holdOpen && onHold ? (
        <div className="mt-3 rounded-xl border border-line bg-surface-muted p-3">
          <label
            htmlFor={`hold-${student.id}`}
            className="text-[14px] font-medium text-ink-muted"
          >
            Why is this student on hold? Optional.
          </label>
          <input
            id={`hold-${student.id}`}
            type="text"
            value={reason}
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Waiting on a medical clearance"
            className="mt-1.5 h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-brand"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                onHold(reason);
                setHoldOpen(false);
                setReason("");
              }}
              className="rounded-xl bg-brand px-4 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
            >
              Put On Hold
            </button>
            <button
              type="button"
              onClick={() => {
                setHoldOpen(false);
                setReason("");
              }}
              className="rounded-xl px-4 py-2.5 text-[15px] font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {student.placement_status === "placement_started" ? (
        <p className="mt-3 rounded-xl border border-line bg-surface-muted px-3 py-2 text-[14px] text-ink-muted">
          This placement has already started.
        </p>
      ) : null}
    </li>
  );
}

export { ReadinessChip };
