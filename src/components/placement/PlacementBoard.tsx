"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import PlacementCard from "@/components/placement/PlacementCard";
import { studentCountLabel } from "@/lib/format";
import { areaColorStyle } from "@/lib/partners/area-colors";
import {
  PLACEMENT_BOARD_COLUMNS,
  dropOutcome,
  isBoardStatus,
} from "@/lib/placement/board";
import { holdStudentAction, releaseHoldAction } from "@/lib/placement/actions";
import type { PlacementStatus } from "@/lib/placement/constants";
import type { PlacementBoardStudent } from "@/lib/placement/queries";

type PlacementBoardProps = {
  students: PlacementBoardStudent[];
  /** Only admin and placement_manager may change placement state. */
  canManage: boolean;
  /**
   * Today as "YYYY-MM-DD", computed once on the server.
   *
   * Every card reads its planned and actual dates against this one value, so a
   * board can never show one student as late and another as on time because the
   * clock moved between two renders.
   */
  today: string;
};

/**
 * Horizontal auto-scroll while a card is being dragged.
 *
 * The same behaviour as the Partner Area Board, and the same reason for it: the
 * board scrolls, never the page, so a column several across is reachable in one
 * continuous drag. EDGE_ZONE is wide enough to hit easily and narrow enough that
 * dropping near a column edge does not start the board moving.
 */
const EDGE_ZONE = 120;
const MIN_SPEED = 5;
const MAX_SPEED = 26;

/**
 * The Placement Board.
 *
 * Six working columns: Needs Review, Documents Pending, Ready for Placement,
 * Placement Assigned, On Placement, On Hold. Students whose whole placement
 * REQUIREMENT is complete are deliberately not here. They are history and live
 * in List View and in a student's placement history, where they cannot crowd
 * out the students who still need work.
 *
 * On Placement is students.placement_status = placement_started, which the
 * database keeps in step with a student_placements row at status = started.
 * There is no second definition of "on placement" anywhere in this application.
 *
 * DRAG NEVER FAKES A PLACEMENT, and it never moves the lifecycle. Placement
 * state is business logic, not a card position, so only the moves that are
 * honestly a staff decision do anything:
 *
 *   any column -> On Hold          pauses the student
 *   On Hold    -> any column       releases them, back to whatever the facts say
 *   Ready      -> Assigned         opens Find Placement, because an assignment
 *                                  needs a real partner, not a dropped card
 *
 * Everything else is refused WITH A REASON naming the action that does it, so
 * staff learn the rule rather than wonder why the card sprang back. Assigned to
 * On Placement is Start Placement. On Placement to anything is Finish
 * Placement, which has a question attached that only a staff member can answer.
 * The document-derived columns can only be changed by changing the documents.
 *
 * Nothing here depends on dragging: every action a drag can take is also a
 * plain button on the card, which is how the board works on a tablet and for
 * keyboard users.
 */
export default function PlacementBoard({
  students,
  canManage,
  today,
}: PlacementBoardProps) {
  const router = useRouter();

  // Optimistic status per student, so a card lands immediately and is put back
  // only if the database refuses the change.
  const [moved, setMoved] = useState<Record<string, PlacementStatus>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<PlacementStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!draggingId) return;

    let pointerX: number | null = null;
    let frame = 0;

    function onDragOver(event: DragEvent) {
      pointerX = event.clientX;
    }

    function step() {
      const board = scrollerRef.current;
      if (board && pointerX !== null) {
        const bounds = board.getBoundingClientRect();
        const leftDepth = bounds.left + EDGE_ZONE - pointerX;
        const rightDepth = pointerX - (bounds.right - EDGE_ZONE);

        let speed = 0;
        if (leftDepth > 0) {
          speed = -ramp(leftDepth);
        } else if (rightDepth > 0) {
          speed = ramp(rightDepth);
        }

        if (speed !== 0) board.scrollLeft += speed;
      }
      frame = requestAnimationFrame(step);
    }

    // Read from the document's own dragover events so the scroll does not stall
    // the moment the pointer crosses a gap between two columns.
    document.addEventListener("dragover", onDragOver);
    frame = requestAnimationFrame(step);

    return () => {
      document.removeEventListener("dragover", onDragOver);
      cancelAnimationFrame(frame);
    };
  }, [draggingId]);

  /** Where a card sits right now, after any optimistic move. */
  function statusOf(student: PlacementBoardStudent): PlacementStatus {
    return moved[student.id] ?? student.placement_status;
  }

  function hold(student: PlacementBoardStudent, reason: string) {
    if (!canManage) return;
    const previous = statusOf(student);
    setError(null);
    setMessage(null);
    setMoved((current) => ({ ...current, [student.id]: "on_hold" }));

    startTransition(async () => {
      const result = await holdStudentAction({
        studentId: student.id,
        reason: reason.trim() || null,
      });
      if (result.error) {
        setMoved((current) => ({ ...current, [student.id]: previous }));
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function release(student: PlacementBoardStudent) {
    if (!canManage) return;
    const previous = statusOf(student);
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await releaseHoldAction({ studentId: student.id });
      if (result.error) {
        setMoved((current) => ({ ...current, [student.id]: previous }));
        setError(result.error);
        return;
      }
      // Where a released student lands is resolved by the database from their
      // placement record and their documents, so the board is re-read rather
      // than guessed at here.
      setMoved((current) => {
        const next = { ...current };
        delete next[student.id];
        return next;
      });
      router.refresh();
    });
  }

  function onDrop(target: PlacementStatus, studentId: string) {
    setDragOver(null);
    setDraggingId(null);

    const student = students.find((row) => row.id === studentId);
    if (!student || !canManage) return;

    const outcome = dropOutcome(statusOf(student), target);
    switch (outcome.kind) {
      case "hold":
        hold(student, "");
        return;
      case "release":
        release(student);
        return;
      case "find":
        setError(null);
        setMessage(null);
        router.push(`/placement/find/${student.id}`);
        return;
      case "refused":
        setError(null);
        setMessage(outcome.reason);
        return;
      default:
        return;
    }
  }

  const byColumn = new Map<PlacementStatus, PlacementBoardStudent[]>();
  for (const column of PLACEMENT_BOARD_COLUMNS) byColumn.set(column.status, []);
  for (const student of students) {
    const status = statusOf(student);
    if (!isBoardStatus(status)) continue;
    byColumn.get(status)?.push(student);
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p
          role="alert"
          className="rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink"
        >
          {error}
        </p>
      ) : null}

      {message ? (
        <p
          role="status"
          className="rounded-2xl border border-info-line bg-info-soft px-6 py-4 text-[16px] text-info-ink"
        >
          {message}
        </p>
      ) : null}

      {canManage ? (
        <p className="text-[16px] text-ink-muted">
          Drag a student into On Hold to pause them, or out of On Hold to
          release them. Dragging a Ready student into Placement Assigned opens
          Find Placement, because an assignment needs a real partner. Starting
          and finishing a placement are buttons on the card, never a drag, and a
          placement never starts on its own because its planned date arrived.
          The first three columns come from the document checklist and are
          changed there.
        </p>
      ) : (
        <p className="text-[16px] text-ink-muted">
          You can open any student here. Assigning placements and holding
          students is done by a placement manager or an admin.
        </p>
      )}

      <div
        ref={scrollerRef}
        className="-mx-1 flex gap-5 overflow-x-auto px-1 pb-5"
      >
        {PLACEMENT_BOARD_COLUMNS.map((column) => {
          const items = byColumn.get(column.status) ?? [];
          const style = areaColorStyle(column.colorKey);
          const isTarget = dragOver === column.status;

          return (
            <section
              key={column.status}
              aria-label={`${column.label}, ${studentCountLabel(items.length)}`}
              onDragOver={(event) => {
                if (!canManage || !draggingId) return;
                event.preventDefault();
                setDragOver(column.status);
              }}
              onDragLeave={() => {
                if (dragOver === column.status) setDragOver(null);
              }}
              onDrop={(event) => {
                if (!canManage) return;
                event.preventDefault();
                const id =
                  event.dataTransfer.getData("text/plain") || draggingId || "";
                if (id) onDrop(column.status, id);
              }}
              className={`flex w-[21rem] shrink-0 flex-col rounded-3xl border p-4 transition-colors sm:w-[23rem] ${
                isTarget ? style.dropTarget : style.column
              }`}
            >
              <header className="px-2 pb-4 pt-2">
                {/* A strong accent bar over a soft column, with white cards on
                    top of it. The same treatment as the Area Board. */}
                <span
                  aria-hidden="true"
                  className={`block h-1.5 w-12 rounded-full ${style.accent}`}
                />
                <h3
                  className={`mt-3 text-[21px] font-semibold leading-tight ${style.heading}`}
                >
                  {column.label}
                </h3>
                <p className={`mt-1 text-[16px] ${style.muted}`}>
                  {studentCountLabel(items.length)}
                </p>
                <p className={`mt-1 text-[15px] ${style.muted}`}>
                  {column.description}
                </p>
              </header>

              <ul className="flex flex-1 flex-col gap-3">
                {items.length === 0 ? (
                  <li className="rounded-2xl border border-dashed border-line-strong bg-surface/60 px-4 py-7 text-center text-[15px] text-ink-muted">
                    {column.emptyMessage}
                  </li>
                ) : null}

                {items.map((student) => (
                  <PlacementCard
                    key={student.id}
                    student={student}
                    canManage={canManage}
                    today={today}
                    pending={pending}
                    dragging={draggingId === student.id}
                    onDragStart={() => setDraggingId(student.id)}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOver(null);
                    }}
                    onHold={(reason) => hold(student, reason)}
                    onRelease={() => release(student)}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Speed for a pointer `depth` pixels inside an edge zone. */
function ramp(depth: number): number {
  const reach = Math.min(depth, EDGE_ZONE) / EDGE_ZONE;
  return MIN_SPEED + (MAX_SPEED - MIN_SPEED) * reach;
}
