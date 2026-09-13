"use client";

import { StickyNote } from "lucide-react";
import { useState, useTransition } from "react";

import { PlacementDocumentStatusPill } from "@/components/ui/StatusPill";
import {
  saveDocumentNoteAction,
  setDocumentStatusAction,
} from "@/lib/documents/actions";
import type { ChecklistItem } from "@/lib/documents/queries";
import { DOCUMENT_NOTE_MAX_LENGTH } from "@/lib/documents/schema";
import { formatTimestamp } from "@/lib/format";
import {
  PLACEMENT_DOCUMENT_STATUS_LABELS,
  type PlacementDocumentStatus,
} from "@/lib/placement/constants";

/** The four quick actions, in the order staff use them. */
const QUICK_ACTIONS: {
  status: PlacementDocumentStatus;
  label: string;
  selected: string;
}[] = [
  {
    status: "received",
    label: "Mark Received",
    selected: "border-ready bg-ready-soft text-ready-ink",
  },
  {
    status: "requested",
    label: "Request",
    selected: "border-attention bg-attention-soft text-attention-ink",
  },
  {
    status: "needs_update",
    label: "Needs Update",
    selected: "border-attention bg-attention-soft text-attention-ink",
  },
  {
    status: "not_applicable",
    label: "Mark N/A",
    selected: "border-info bg-info-soft text-info-ink",
  },
];

const IDLE_BUTTON =
  "border-line bg-surface text-ink hover:border-brand hover:bg-brand-soft hover:text-brand-strong";

const SMALL_BUTTON =
  "inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[15px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60";

/** "Received Sep 12, 2026 by Priya" for the two statuses that record who acted. */
function describeAudit({
  document,
  requestedByName,
  receivedByName,
}: ChecklistItem): string | null {
  if (document.status === "received" && document.received_at) {
    const when = formatTimestamp(document.received_at);
    return `Received ${when}${receivedByName ? ` by ${receivedByName}` : ""}`;
  }
  if (document.status === "requested" && document.requested_at) {
    const when = formatTimestamp(document.requested_at);
    return `Requested ${when}${requestedByName ? ` by ${requestedByName}` : ""}`;
  }
  return null;
}

/**
 * One requirement on a student's checklist.
 *
 * A requirement is a readiness marker: a status, who asked, who cleared it, and
 * one short internal note. No file is ever attached here. The merged copy of a
 * ready student's documents is the single Final Placement Package, uploaded
 * once at the bottom of this page.
 *
 * Every action happens on the row. Nothing opens another page, so working
 * through thirteen documents stays fast.
 */
export default function DocumentRow({
  item,
  canManage,
}: {
  item: ChecklistItem;
  canManage: boolean;
}) {
  const { requirement, document } = item;

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(document.note ?? "");

  const auditLine = describeAudit(item);

  function run(work: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      setError(result.error);
    });
  }

  function changeStatus(status: PlacementDocumentStatus) {
    if (status === document.status) return;
    run(() => setDocumentStatusAction({ documentId: document.id, status }));
  }

  function saveNote() {
    run(async () => {
      const result = await saveDocumentNoteAction({
        documentId: document.id,
        note: noteDraft,
      });
      if (!result.error) setNoteOpen(false);
      return result;
    });
  }

  return (
    <li
      className={`rounded-3xl border bg-surface p-6 sm:p-7 ${
        pending ? "border-brand" : "border-line"
      }`}
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-[21px] font-semibold leading-tight text-ink">
              {requirement.name}
            </h3>
            {requirement.is_required ? null : (
              <span className="rounded-full border border-line bg-surface-muted px-3 py-1 text-[14px] font-medium text-ink-muted">
                Optional
              </span>
            )}
          </div>

          {requirement.description ? (
            <p className="mt-2 max-w-2xl text-[16px] text-ink-muted">
              {requirement.description}
            </p>
          ) : null}

          {auditLine ? (
            <p className="mt-3 text-[15px] text-ink-muted">{auditLine}</p>
          ) : null}
        </div>

        <div className="xl:shrink-0">
          <PlacementDocumentStatusPill status={document.status} size="large" />
        </div>
      </div>

      {/* One short internal note. Broader discussion belongs in Comments. */}
      {noteOpen ? (
        <div className="mt-4">
          <label
            htmlFor={`note-${document.id}`}
            className="text-[16px] font-medium text-ink"
          >
            Internal note
          </label>
          <textarea
            id={`note-${document.id}`}
            rows={2}
            maxLength={DOCUMENT_NOTE_MAX_LENGTH}
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="VSC applied, expected next week"
            className="mt-2 w-full rounded-2xl border border-line bg-surface px-5 py-3 text-[16px] text-ink outline-none focus:border-brand"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={saveNote}
              className="rounded-xl bg-brand px-5 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
            >
              {pending ? "Saving..." : "Save Note"}
            </button>
            <button
              type="button"
              onClick={() => {
                setNoteDraft(document.note ?? "");
                setNoteOpen(false);
              }}
              className={SMALL_BUTTON}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {document.note ? (
            <p className="flex min-w-0 items-start gap-2 text-[16px] text-ink">
              <StickyNote
                size={18}
                aria-hidden="true"
                className="mt-1 shrink-0 text-ink-muted"
              />
              <span className="break-words">{document.note}</span>
            </p>
          ) : null}
          {canManage ? (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className={SMALL_BUTTON}
            >
              <StickyNote size={18} aria-hidden="true" />
              {document.note ? "Edit Note" : "Add Note"}
            </button>
          ) : null}
        </div>
      )}

      {canManage ? (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-5">
          {QUICK_ACTIONS.map((action) => {
            const selected = document.status === action.status;
            return (
              <button
                key={action.status}
                type="button"
                aria-pressed={selected}
                disabled={pending}
                onClick={() => changeStatus(action.status)}
                className={`rounded-2xl border px-5 py-3 text-[16px] font-medium transition-colors disabled:opacity-60 ${
                  selected ? action.selected : IDLE_BUTTON
                }`}
              >
                {action.label}
              </button>
            );
          })}
          {document.status === "not_reviewed" ? null : (
            <button
              type="button"
              disabled={pending}
              onClick={() => changeStatus("not_reviewed")}
              className="rounded-2xl px-5 py-3 text-[16px] font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink disabled:opacity-60"
            >
              Clear
            </button>
          )}
        </div>
      ) : (
        <p className="mt-5 border-t border-line pt-5 text-[16px] text-ink-muted">
          {PLACEMENT_DOCUMENT_STATUS_LABELS[document.status]}. Your account can
          view placement documents but not change them.
        </p>
      )}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-2xl border border-attention-line bg-attention-soft px-5 py-3 text-[15px] text-attention-ink"
        >
          {error}
        </p>
      ) : null}
    </li>
  );
}
