"use client";

import { useState, useTransition } from "react";

import { setDocumentStatusAction } from "@/lib/documents/actions";
import {
  documentCellLabel,
  documentCellTone,
  type GridDocumentCell,
} from "@/lib/documents/batch-grid";
import {
  PLACEMENT_DOCUMENT_STATUSES,
  PLACEMENT_DOCUMENT_STATUS_LABELS,
  isPlacementDocumentStatus,
  type PlacementDocumentStatus,
} from "@/lib/placement/constants";

import {
  GRID_ERROR_CLASSES,
  GRID_SAVING_CLASSES,
  GRID_SELECT_CLASSES,
  GRID_TONE_CLASSES,
} from "./batch-grid-tones";
import DocumentInternalNoteButton from "./DocumentInternalNoteButton";

/**
 * One requirement cell of the Batch Document Grid.
 *
 * The cell shows the stored status and, for staff who may manage documents, a
 * compact select that saves straight away through setDocumentStatusAction.
 * One change updates exactly one student_placement_documents row; readiness
 * and the student's placement status follow from the database triggers, the
 * same as a click on the full checklist.
 *
 * The select never lies. While a save is in flight it shows the chosen value
 * and "Saving". If the save fails it falls BACK to the stored value, says why,
 * and offers Retry. It only ever shows the new value as current once the
 * server has re-rendered the row with it.
 *
 * A missing checklist row (the requirement was added after this student's
 * checklist was created) is shown as Not Initialized. It is not a status, it
 * cannot be edited here, and viewing it creates nothing.
 */
export default function BatchDocumentStatusCell({
  cell,
  studentName,
  requirementName,
  canManage,
}: {
  cell: GridDocumentCell;
  studentName: string;
  requirementName: string;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  // The value chosen but not yet confirmed by the server.
  const [draft, setDraft] = useState<PlacementDocumentStatus | null>(null);
  // The value a failed save was trying to set, so Retry can send it again.
  const [failed, setFailed] = useState<PlacementDocumentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (cell.kind === "missing") {
    return (
      <span
        className={`inline-flex h-8 w-full items-center rounded-md border px-2 text-[12px] font-medium ${GRID_TONE_CLASSES.missing}`}
        title="No checklist row yet. Open the student's documents page and choose Add Missing Documents."
      >
        {documentCellLabel(cell)}
      </span>
    );
  }

  // A const binding keeps the narrowed "document" type inside save().
  const document = cell;
  const shown = draft ?? document.status;
  const tone = documentCellTone(
    draft ? { ...document, status: draft } : document,
  );

  function save(status: PlacementDocumentStatus) {
    if (status === document.status) {
      setDraft(null);
      setFailed(null);
      setError(null);
      return;
    }
    setDraft(status);
    setFailed(null);
    setError(null);
    startTransition(async () => {
      const result = await setDocumentStatusAction({
        documentId: document.documentId,
        status,
      });
      if (result.error) {
        // Fall back to what is actually stored. Never show the new value as
        // saved when it is not.
        setDraft(null);
        setFailed(status);
        setError(result.error);
        return;
      }
      setDraft(null);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {canManage ? (
          <>
            <label
              className="sr-only"
              htmlFor={`grid-status-${document.documentId}`}
            >
              {requirementName} status for {studentName}
            </label>
            <select
              id={`grid-status-${document.documentId}`}
              value={shown}
              disabled={pending}
              onChange={(event) => {
                const next = event.target.value;
                if (isPlacementDocumentStatus(next)) save(next);
              }}
              className={`${GRID_SELECT_CLASSES} ${GRID_TONE_CLASSES[tone]}`}
            >
              {PLACEMENT_DOCUMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PLACEMENT_DOCUMENT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span
            className={`inline-flex h-8 min-w-0 flex-1 items-center truncate rounded-md border px-2 text-[13px] font-medium ${GRID_TONE_CLASSES[tone]}`}
          >
            {documentCellLabel(document)}
          </span>
        )}

        <DocumentInternalNoteButton
          documentId={document.documentId}
          note={document.note}
          studentName={studentName}
          requirementName={requirementName}
          canManage={canManage}
        />
      </div>

      {pending ? (
        <span className={GRID_SAVING_CLASSES} aria-live="polite">
          Saving...
        </span>
      ) : null}

      {error && !pending ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span role="alert" className={GRID_ERROR_CLASSES}>
            {error}
          </span>
          {failed ? (
            <button
              type="button"
              onClick={() => save(failed)}
              className="text-[12px] font-semibold text-brand-strong underline underline-offset-2"
            >
              Retry {PLACEMENT_DOCUMENT_STATUS_LABELS[failed]}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
