"use client";

import { Mail, Send } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";

import ActionDialog from "@/components/ui/ActionDialog";
import {
  previewStudentDocumentEmailAction,
  sendBatchDocumentRemindersAction,
  type BulkSendResult,
  type EmailPreview,
} from "@/lib/documents/email-actions";
import type { BatchReminderReview } from "@/lib/documents/email-queries";
import { NO_EMAIL_MESSAGE } from "@/lib/email/address";
import { formatTimestamp, timeAgoLabel } from "@/lib/format";

import EmailSnapshotView from "./EmailSnapshotView";

const OUTLINE_BUTTON =
  "inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60";

const PRIMARY_BUTTON =
  "inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-3.5 text-[16px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60";

const SMALL_BUTTON =
  "inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[15px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60";

/**
 * Outstanding document reminders for ONE batch.
 *
 * ---------------------------------------------------------------------------
 * There is no "email everyone" button, and there must never be one
 * ---------------------------------------------------------------------------
 *
 * This screen only ever exists inside a batch. A roster-wide send would be one
 * misclick away from writing to every student the academy has ever enrolled,
 * including the ones who finished two years ago, so the batch is the boundary
 * and the server re-checks it rather than trusting this list.
 *
 * ---------------------------------------------------------------------------
 * Who is on this list, and who is not
 * ---------------------------------------------------------------------------
 *
 * A student needs a reminder when at least one ACTIVE requirement is Requested
 * or Needs Update. Two absences matter more than the presences:
 *
 *   A fully ready student is not here. There is nothing to remind them of.
 *   A student whose requirements are all Not Reviewed is not here either. Not
 *   Reviewed means nobody on staff has looked yet, so chasing them would be
 *   asking for documents that may already be sitting in the LMS.
 *
 * Students emailed in the last 24 hours ARE listed, and are unchecked. Staff
 * can tick them deliberately; the screen never quietly decides for them.
 *
 * Every selected student receives their own email. Nobody is ever BCC'd, so no
 * student can see another student's address.
 */
export default function BatchReminderPanel({
  batchId,
  batchName,
  review,
}: {
  batchId: string;
  batchName: string;
  review: BatchReminderReview;
}) {
  const eligible = useMemo(
    () =>
      review.candidates.filter(
        (candidate) => candidate.isEligible && candidate.recipientEmail,
      ),
    [review.candidates],
  );

  const notEmailable = useMemo(
    () =>
      review.candidates.filter(
        (candidate) => candidate.isEligible && !candidate.recipientEmail,
      ),
    [review.candidates],
  );

  // Recently emailed students start UNCHECKED. Everyone else starts checked, so
  // the common case is one click.
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        eligible
          .filter((candidate) => !candidate.lastEmailedAt)
          .map((candidate) => candidate.studentId),
      ),
  );

  const [confirming, setConfirming] = useState(false);
  const [sending, startSending] = useTransition();
  const [result, setResult] = useState<BulkSendResult | null>(null);

  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, startPreview] = useTransition();

  /**
   * One id for one submission. Every student in this send gets an idempotency
   * key built from it, so a retried request cannot email anybody twice. It is
   * cleared once the send finishes, because a deliberate second send is a new
   * submission rather than a replay of this one.
   */
  const sendGroupId = useRef<string | null>(null);

  function toggle(studentId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function selectAllEligible() {
    setSelected(new Set(eligible.map((candidate) => candidate.studentId)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function openPreview(studentId: string) {
    setPreviewFor(studentId);
    setPreview(null);
    setPreviewError(null);
    startPreview(async () => {
      const outcome = await previewStudentDocumentEmailAction({
        studentId,
        sendType: "document_reminder",
      });
      if (outcome.ok) setPreview(outcome.preview);
      else setPreviewError(outcome.error);
    });
  }

  function send() {
    if (selected.size === 0) return;
    if (!sendGroupId.current) sendGroupId.current = crypto.randomUUID();
    const groupId = sendGroupId.current;

    startSending(async () => {
      const outcome = await sendBatchDocumentRemindersAction({
        batchId,
        sendGroupId: groupId,
        studentIds: [...selected],
      });
      setResult(outcome);
      setConfirming(false);
      sendGroupId.current = null;
      if (!outcome.error) setSelected(new Set());
    });
  }

  const selectedCount = selected.size;

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-3xl border border-line bg-surface p-7">
        <h2 className="text-[24px] font-semibold tracking-tight text-ink">
          {batchName}
        </h2>
        <ul className="mt-4 flex flex-col gap-2 text-[17px] text-ink">
          <li>
            {countLabel(eligible.length + notEmailable.length, "student")}{" "}
            {eligible.length + notEmailable.length === 1
              ? "requires"
              : "require"}{" "}
            attention
          </li>
          {review.noEmailCount > 0 ? (
            <li className="text-ink-muted">
              {review.noEmailCount} have no email address on file
            </li>
          ) : null}
          {review.recentlyEmailedCount > 0 ? (
            <li className="text-ink-muted">
              {review.recentlyEmailedCount} were emailed in the last 24 hours
            </li>
          ) : null}
        </ul>
        <p className="mt-4 max-w-3xl text-[16px] text-ink-muted">
          Students whose requirements are all Received, N/A, or Not Reviewed are
          not listed. Not Reviewed means the placement team has not checked that
          document yet, so it is never presented to a student as outstanding.
        </p>
      </div>

      {result ? (
        <div
          role="status"
          className={`rounded-3xl border px-7 py-6 text-[17px] ${
            result.error || result.failed > 0
              ? "border-attention-line bg-attention-soft text-attention-ink"
              : "border-ready-line bg-ready-soft text-ready-ink"
          }`}
        >
          {result.error ? (
            <p>{result.error}</p>
          ) : (
            <>
              <p>
                {countLabel(result.sent, "reminder")} accepted by our email
                provider. Delivery is confirmed separately and appears in each
                student&apos;s Email History.
              </p>
              {result.skipped > 0 ? (
                <p className="mt-2">
                  {result.skipped} were skipped because they no longer have
                  anything outstanding, or had already been sent in this
                  submission.
                </p>
              ) : null}
              {result.failed > 0 ? (
                <p className="mt-2">
                  {countLabel(result.failed, "reminder")} could not be sent.
                  Those students have a failed entry in their Email History.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {eligible.length === 0 && notEmailable.length === 0 ? (
        <div className="rounded-3xl border border-line bg-surface p-8">
          <p className="text-[17px] text-ink-muted">
            No student in this batch has a Requested or Needs Update document,
            so there is nothing to remind anyone about.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={selectAllEligible}
              className={SMALL_BUTTON}
            >
              Select All Eligible
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className={SMALL_BUTTON}
            >
              Clear Selection
            </button>
            <span className="text-[16px] text-ink-muted">
              {selectedCount} selected
            </span>
          </div>

          <ul className="flex flex-col gap-3">
            {eligible.map((candidate) => {
              const checked = selected.has(candidate.studentId);
              const recent = candidate.lastEmailedAt;

              return (
                <li
                  key={candidate.studentId}
                  className={`rounded-2xl border bg-surface p-5 ${
                    checked ? "border-brand" : "border-line"
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <label className="flex min-w-0 items-start gap-4">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={sending}
                        onChange={() => toggle(candidate.studentId)}
                        className="mt-1 h-6 w-6 shrink-0 rounded border-line accent-brand"
                      />
                      <span className="min-w-0">
                        <span className="block text-[18px] font-medium text-ink">
                          {candidate.studentName}
                        </span>
                        <span className="block text-[16px] text-ink-muted">
                          {candidate.studentNumber} - {candidate.recipientEmail}
                        </span>
                        <span className="block text-[16px] text-attention-ink">
                          {countLabel(candidate.actionNeededCount, "item")}{" "}
                          {candidate.actionNeededCount === 1 ? "needs" : "need"}{" "}
                          attention
                        </span>
                        {recent ? (
                          <span className="block text-[16px] text-warning-ink">
                            Recently emailed {timeAgoLabel(recent)} (
                            {formatTimestamp(recent)})
                          </span>
                        ) : null}
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={() => openPreview(candidate.studentId)}
                      className={`${SMALL_BUTTON} shrink-0`}
                    >
                      <Mail size={18} aria-hidden="true" />
                      Preview Student
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {notEmailable.length > 0 ? (
            <div className="rounded-3xl border border-line bg-surface-muted p-7">
              <h3 className="text-[18px] font-semibold text-ink">
                Cannot be emailed
              </h3>
              <p className="mt-1 text-[16px] text-ink-muted">
                {NO_EMAIL_MESSAGE} Add one on the student record to include them.
              </p>
              <ul className="mt-4 flex flex-col gap-2">
                {notEmailable.map((candidate) => (
                  <li
                    key={candidate.studentId}
                    className="text-[17px] text-ink"
                  >
                    {candidate.studentName}
                    <span className="text-ink-muted">
                      {" "}
                      - {countLabel(candidate.actionNeededCount, "item")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={sending || selectedCount === 0}
              onClick={() => setConfirming(true)}
              className={PRIMARY_BUTTON}
            >
              <Send size={20} aria-hidden="true" />
              {selectedCount === 0
                ? "Send Reminders"
                : `Send ${countLabel(selectedCount, "Reminder")}`}
            </button>
          </div>
        </>
      )}

      <ActionDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Send ${countLabel(selectedCount, "reminder")}?`}
        subtitle={batchName}
      >
        <p className="text-[17px] text-ink">
          Each student receives their own personalized email listing only the
          documents they still need to provide.
        </p>
        <p className="mt-3 text-[16px] text-ink-muted">
          Nobody is copied on anybody else&apos;s email. Each send is recorded
          permanently in that student&apos;s Email History.
        </p>
        <div className="mt-7 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            disabled={sending}
            onClick={() => setConfirming(false)}
            className={OUTLINE_BUTTON}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={send}
            className={PRIMARY_BUTTON}
          >
            {sending ? "Sending..." : `Send ${countLabel(selectedCount, "Reminder")}`}
          </button>
        </div>
      </ActionDialog>

      <ActionDialog
        open={previewFor !== null}
        onClose={() => setPreviewFor(null)}
        title="Reminder preview"
        subtitle={preview?.studentName}
      >
        {loadingPreview ? (
          <p className="text-[17px] text-ink-muted">Building the preview...</p>
        ) : null}
        {previewError ? (
          <p
            role="alert"
            className="rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink"
          >
            {previewError}
          </p>
        ) : null}
        {preview ? (
          <EmailSnapshotView
            snapshot={preview.snapshot}
            subject={preview.subject}
            bodyText={preview.bodyText}
          />
        ) : null}
      </ActionDialog>
    </div>
  );
}

/** "1 reminder" / "27 reminders", keeping the caller's capitalization. */
function countLabel(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}
