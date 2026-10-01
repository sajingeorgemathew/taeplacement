"use client";

import { Lock, StickyNote } from "lucide-react";
import { useState, useTransition } from "react";

import ActionDialog from "@/components/ui/ActionDialog";
import { saveDocumentNoteAction } from "@/lib/documents/actions";
import { DOCUMENT_NOTE_MAX_LENGTH } from "@/lib/documents/schema";

import {
  GRID_ICON_BUTTON_CLASSES,
  GRID_TEXT_BUTTON_CLASSES,
} from "./batch-grid-tones";

/**
 * The INTERNAL note on one requirement cell of the Batch Document Grid.
 *
 * This reads and writes student_placement_documents.note through the same
 * saveDocumentNoteAction the full checklist uses. It is staff only, it is
 * never emailed, and it is NOT the student message: nothing here reads or
 * writes student_message, and the dialog says so in words.
 *
 * A cell with a note shows a marked icon so the note is visible without
 * opening anything; the text itself is one click away. View-only staff can
 * read the note but not change it.
 */
export default function DocumentInternalNoteButton({
  documentId,
  note,
  studentName,
  requirementName,
  canManage,
}: {
  documentId: string;
  note: string | null;
  studentName: string;
  requirementName: string;
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasNote = Boolean(note && note.trim().length > 0);

  // A view-only cell with nothing written has nothing to open.
  if (!canManage && !hasNote) return null;

  function openDialog() {
    setDraft(note ?? "");
    setError(null);
    setOpen(true);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveDocumentNoteAction({ documentId, note: draft });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        aria-label={
          hasNote
            ? `Internal note on ${requirementName} for ${studentName}`
            : `Add internal note on ${requirementName} for ${studentName}`
        }
        title={hasNote ? (note ?? undefined) : "Add internal note"}
        className={`${GRID_ICON_BUTTON_CLASSES} relative ${
          hasNote ? "border-brand-line bg-brand-soft text-brand-strong" : ""
        }`}
      >
        <StickyNote size={15} aria-hidden="true" />
        {hasNote ? (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-brand"
          />
        ) : null}
      </button>

      {open ? (
        <ActionDialog
          open={open}
          onClose={() => setOpen(false)}
          title="Internal Note"
          subtitle={`${studentName} - ${requirementName}`}
        >
          <p className="flex items-center gap-2 text-[15px] text-ink-muted">
            <Lock size={16} aria-hidden="true" />
            Staff only. Never included in student email. Not the student
            message.
          </p>

          {canManage ? (
            <>
              <label htmlFor={`grid-note-${documentId}`} className="sr-only">
                Internal note
              </label>
              <textarea
                id={`grid-note-${documentId}`}
                rows={3}
                maxLength={DOCUMENT_NOTE_MAX_LENGTH}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Step 1 complete. Step 2 booked Oct 8."
                autoFocus
                className="mt-4 w-full rounded-2xl border border-line bg-surface px-4 py-3 text-[16px] text-ink outline-none focus:border-brand"
              />
              <p className="mt-1 text-right text-[13px] text-ink-muted">
                {draft.length} / {DOCUMENT_NOTE_MAX_LENGTH}
              </p>

              {error ? (
                <p
                  role="alert"
                  className="mt-2 rounded-xl border border-attention-line bg-attention-soft px-4 py-2.5 text-[15px] text-attention-ink"
                >
                  {error}
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
                  type="button"
                  disabled={pending}
                  onClick={save}
                  className="rounded-xl bg-brand px-5 py-2 text-[15px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
                >
                  {pending ? "Saving..." : "Save"}
                </button>
              </div>
            </>
          ) : (
            <p className="mt-4 whitespace-pre-wrap break-words rounded-2xl border border-line bg-surface-muted px-4 py-3 text-[16px] text-ink">
              {note}
            </p>
          )}
        </ActionDialog>
      ) : null}
    </>
  );
}
