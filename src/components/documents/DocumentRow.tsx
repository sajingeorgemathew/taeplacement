"use client";

import { Lock, Mail, StickyNote } from "lucide-react";
import { useState, useTransition } from "react";

import { PlacementDocumentStatusPill } from "@/components/ui/StatusPill";
import {
  saveDocumentNoteAction,
  saveStudentMessageAction,
  setDocumentStatusAction,
} from "@/lib/documents/actions";
import type { ChecklistItem } from "@/lib/documents/queries";
import {
  DOCUMENT_NOTE_MAX_LENGTH,
  DOCUMENT_STUDENT_MESSAGE_MAX_LENGTH,
} from "@/lib/documents/schema";
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

const SAVE_BUTTON =
  "rounded-xl bg-brand px-5 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60";

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
 * two separate pieces of text. No file is ever attached here. The merged copy of
 * a ready student's documents is the single Final Placement Package, uploaded
 * once at the bottom of this page.
 *
 * ---------------------------------------------------------------------------
 * Two text fields, and they are not the same field
 * ---------------------------------------------------------------------------
 *
 *   Internal Note     staff only, never emailed. Where "second TB attempt
 *                     failed" belongs.
 *   Student Message   written for the student, and included in placement status
 *                     emails. Where "please send the completed VSC once
 *                     available" belongs.
 *
 * They are deliberately shown apart, labelled in plain words, and saved by
 * different actions writing different columns. The interface says out loud
 * which one a student can read, because the moment a staff member has to
 * REMEMBER which box is private is the moment something private gets emailed.
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
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageDraft, setMessageDraft] = useState(
    document.student_message ?? "",
  );

  const auditLine = describeAudit(item);

  // N/A and Not Reviewed rows never reach a student, so a student message on
  // one is never sent. Saying so where the message is typed is kinder than
  // letting somebody write to nobody.
  const messageWouldBeSent =
    document.status === "received" ||
    document.status === "requested" ||
    document.status === "needs_update";

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

  function saveMessage() {
    run(async () => {
      const result = await saveStudentMessageAction({
        documentId: document.id,
        studentMessage: messageDraft,
      });
      if (!result.error) setMessageOpen(false);
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

      {/* Internal note. Staff only. Never leaves the application. */}
      {noteOpen ? (
        <div className="mt-5 rounded-2xl border border-line bg-surface-muted p-5">
          <label
            htmlFor={`note-${document.id}`}
            className="flex items-center gap-2 text-[16px] font-medium text-ink"
          >
            <Lock size={18} aria-hidden="true" className="text-ink-muted" />
            Internal Note
          </label>
          <p className="mt-1 text-[15px] text-ink-muted">
            Staff only. Never included in student email.
          </p>
          <textarea
            id={`note-${document.id}`}
            rows={2}
            maxLength={DOCUMENT_NOTE_MAX_LENGTH}
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            placeholder="VSC applied, expected next week"
            className="mt-3 w-full rounded-2xl border border-line bg-surface px-5 py-3 text-[16px] text-ink outline-none focus:border-brand"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={saveNote}
              className={SAVE_BUTTON}
            >
              {pending ? "Saving..." : "Save Internal Note"}
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
      ) : document.note ? (
        <div className="mt-5 rounded-2xl border border-line bg-surface-muted p-5">
          <p className="flex items-center gap-2 text-[15px] font-medium text-ink-muted">
            <Lock size={16} aria-hidden="true" />
            Internal Note - staff only
          </p>
          <p className="mt-2 break-words text-[16px] text-ink">
            {document.note}
          </p>
        </div>
      ) : null}

      {/* Student message. Written for the student, and emailed to them. */}
      {messageOpen ? (
        <div className="mt-4 rounded-2xl border border-info-line bg-info-soft p-5">
          <label
            htmlFor={`student-message-${document.id}`}
            className="flex items-center gap-2 text-[16px] font-medium text-info-ink"
          >
            <Mail size={18} aria-hidden="true" />
            Student Message
          </label>
          <p className="mt-1 text-[15px] text-info-ink">
            Included in placement status emails.
          </p>
          <p className="mt-1 text-[15px] text-info-ink">
            Student-facing. This may be included in email. Do not enter private
            staff comments or detailed medical information.
          </p>
          <textarea
            id={`student-message-${document.id}`}
            // Three rows rather than the note's two: this field holds up to
            // 500 characters and a student instruction worth reading usually
            // uses them.
            rows={3}
            maxLength={DOCUMENT_STUDENT_MESSAGE_MAX_LENGTH}
            value={messageDraft}
            onChange={(event) => setMessageDraft(event.target.value)}
            placeholder="Please send the completed VSC once available."
            className="mt-3 w-full rounded-2xl border border-info-line bg-surface px-5 py-3 text-[16px] text-ink outline-none focus:border-brand"
          />
          {!messageWouldBeSent ? (
            <p className="mt-2 text-[15px] text-info-ink">
              This requirement is{" "}
              {PLACEMENT_DOCUMENT_STATUS_LABELS[document.status]}, so it is left
              out of student emails entirely. This message will be saved but not
              sent.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={saveMessage}
              className={SAVE_BUTTON}
            >
              {pending ? "Saving..." : "Save Student Message"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMessageDraft(document.student_message ?? "");
                setMessageOpen(false);
              }}
              className={SMALL_BUTTON}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : document.student_message ? (
        <div className="mt-4 rounded-2xl border border-info-line bg-info-soft p-5">
          <p className="flex items-center gap-2 text-[15px] font-medium text-info-ink">
            <Mail size={16} aria-hidden="true" />
            Student Message - included in placement status emails
          </p>
          <p className="mt-2 break-words text-[16px] text-ink">
            {document.student_message}
          </p>
        </div>
      ) : null}

      {canManage && !noteOpen && !messageOpen ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className={SMALL_BUTTON}
          >
            <StickyNote size={18} aria-hidden="true" />
            {document.note ? "Edit Internal Note" : "Add Internal Note"}
          </button>
          <button
            type="button"
            onClick={() => setMessageOpen(true)}
            className={SMALL_BUTTON}
          >
            <Mail size={18} aria-hidden="true" />
            {document.student_message
              ? "Edit Student Message"
              : "Add Student Message"}
          </button>
        </div>
      ) : null}

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
