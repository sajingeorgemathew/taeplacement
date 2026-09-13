"use client";

import { RefreshCw, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";

import {
  refreshStudentChecklistAction,
  resetStudentDocumentsAction,
} from "@/lib/documents/actions";
import type { ChecklistItem } from "@/lib/documents/queries";

import DocumentRow from "./DocumentRow";

type DocumentChecklistProps = {
  studentId: string;
  items: ChecklistItem[];
  canManage: boolean;
  /** Active requirements with no row for this student yet. */
  missingCount: number;
};

const TOOL_BUTTON =
  "inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60";

/**
 * The full checklist for one student.
 *
 * Statuses only. Nothing here uploads a file: the merged copy of a ready
 * student's documents is the single Final Placement Package below the list.
 *
 * The only bulk action offered is Mark all as Not Reviewed. There is
 * deliberately no bulk "mark everything received" and nothing that touches more
 * than this one student.
 */
export default function DocumentChecklist({
  studentId,
  items,
  canManage,
  missingCount,
}: DocumentChecklistProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  function run(work: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      setError(result.error);
      if (!result.error) setConfirmingReset(false);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {missingCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-info-line bg-info-soft px-6 py-5">
          <p className="text-[16px] text-info-ink">
            {missingCount === 1
              ? "1 document requirement was added after this checklist was created."
              : `${missingCount} document requirements were added after this checklist was created.`}
          </p>
          {canManage ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => refreshStudentChecklistAction({ studentId }))
              }
              className={TOOL_BUTTON}
            >
              <RefreshCw size={20} aria-hidden="true" />
              {pending ? "Working..." : "Add Missing Documents"}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-3xl text-[16px] text-ink-muted">
          This is a readiness checklist. Mark a document Received when the
          student has provided it; the official copy stays in the LMS and no
          file is uploaded per document.
        </p>

        {canManage ? (
          confirmingReset ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[16px] text-ink">
                Reset every document to Not Reviewed?
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => resetStudentDocumentsAction({ studentId }))
                }
                className="rounded-2xl border border-attention bg-attention-soft px-5 py-3.5 text-[16px] font-semibold text-attention-ink transition-colors hover:bg-white disabled:opacity-60"
              >
                {pending ? "Resetting..." : "Yes, reset"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className={TOOL_BUTTON}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              className={TOOL_BUTTON}
            >
              <RotateCcw size={20} aria-hidden="true" />
              Mark all as Not Reviewed
            </button>
          )
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink"
        >
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-3xl border border-line bg-surface p-8">
          <p className="text-[17px] text-ink-muted">
            This student has no document checklist yet. An admin can add
            requirements in Admin, Document Requirements.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <DocumentRow
              key={item.document.id}
              item={item}
              canManage={canManage}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
