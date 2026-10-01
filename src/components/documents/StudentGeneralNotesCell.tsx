"use client";

import { MessageSquare, Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import ActionDialog from "@/components/ui/ActionDialog";
import { notePreview, type GridLatestNote } from "@/lib/documents/batch-grid";
import { emptyFormState } from "@/lib/forms/state";
import { formatTimestamp } from "@/lib/format";
import { addStudentNoteAction } from "@/lib/students/actions";

import { GRID_TEXT_BUTTON_CLASSES } from "./batch-grid-tones";

/**
 * The General Notes cell at the end of a student's grid row.
 *
 * This is student_notes: the general internal history of the student ("Not
 * responding", "Will submit Friday", "Waiting for VSC appointment"). It is a
 * different thing from the per-requirement internal note on each document
 * cell, and a different thing again from the student-facing message, which
 * the grid never shows.
 *
 * The cell shows the LATEST note as a preview with its date and author. Add
 * Note opens a compact dialog whose form posts to the existing
 * addStudentNoteAction, which INSERTS a new student_notes row. Nothing here
 * can edit or overwrite an earlier note. View Notes opens the student
 * profile, where the full history lives; the history is not loaded into the
 * grid.
 */
export default function StudentGeneralNotesCell({
  studentId,
  studentName,
  latestNote,
  noteCount,
  canAdd,
}: {
  studentId: string;
  studentName: string;
  latestNote: GridLatestNote | null;
  noteCount: number;
  canAdd: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    addStudentNoteAction,
    emptyFormState,
  );
  const wasPending = useRef(false);

  // Close once a note has been posted successfully. The server re-renders the
  // row with the new note as the latest one.
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      setOpen(false);
    }
    wasPending.current = pending;
  }, [pending, state.error]);

  const when = latestNote ? formatTimestamp(latestNote.created_at) : null;

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {latestNote ? (
        <div className="min-w-0">
          <p
            className="line-clamp-2 break-words text-[13px] leading-snug text-ink"
            title={latestNote.body}
          >
            {notePreview(latestNote.body)}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-ink-muted">
            {when}
            {latestNote.author_name ? ` · ${latestNote.author_name}` : ""}
          </p>
        </div>
      ) : (
        <p className="text-[13px] text-ink-muted">No notes yet</p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {canAdd ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={GRID_TEXT_BUTTON_CLASSES}
          >
            <Plus size={14} aria-hidden="true" />
            Add Note
          </button>
        ) : null}
        {noteCount > 0 ? (
          <Link
            href={`/students/${studentId}`}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] font-medium text-brand-strong hover:bg-brand-soft"
            title="Open the student profile to read every note"
          >
            <MessageSquare size={14} aria-hidden="true" />
            View Notes ({noteCount})
          </Link>
        ) : null}
      </div>

      {open ? (
        <ActionDialog
          open={open}
          onClose={() => setOpen(false)}
          title="Add General Note"
          subtitle={studentName}
        >
          <form action={formAction}>
            <input type="hidden" name="student_id" value={studentId} />
            <label
              htmlFor={`grid-general-note-${studentId}`}
              className="text-[15px] font-medium text-ink"
            >
              Internal note
            </label>
            <p className="mt-1 text-[14px] text-ink-muted">
              Added to the student&apos;s note history. Earlier notes are kept.
            </p>
            <textarea
              id={`grid-general-note-${studentId}`}
              name="body"
              rows={3}
              required
              autoFocus
              placeholder="Called, no answer. Will try again Friday."
              className="mt-3 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-[16px] text-ink outline-none focus:border-brand"
            />

            {state.error ? (
              <p
                role="alert"
                className="mt-2 rounded-xl border border-attention-line bg-attention-soft px-4 py-2.5 text-[15px] text-attention-ink"
              >
                {state.error}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
                className={`${GRID_TEXT_BUTTON_CLASSES} px-4 py-2 text-[15px]`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-xl bg-brand px-5 py-2 text-[15px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
              >
                {pending ? "Posting..." : "Post Note"}
              </button>
            </div>
          </form>
        </ActionDialog>
      ) : null}
    </div>
  );
}
