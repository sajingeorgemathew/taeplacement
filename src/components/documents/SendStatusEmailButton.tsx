"use client";

import { Mail } from "lucide-react";
import { useCallback, useMemo, useState, useTransition } from "react";

import ActionDialog from "@/components/ui/ActionDialog";
import {
  previewStudentDocumentEmailAction,
  sendStudentDocumentEmailAction,
  type EmailPreview,
} from "@/lib/documents/email-actions";
import {
  normalizeOpeningMessage,
  OPENING_MESSAGE_MAX_LENGTH,
} from "@/lib/documents/email-settings";
import { renderDocumentEmail } from "@/lib/documents/email-template";
import { NO_EMAIL_MESSAGE } from "@/lib/email/address";
import { formatTimestamp, timeAgoLabel } from "@/lib/format";

import EmailSnapshotView from "./EmailSnapshotView";
import OpeningMessageEditor from "./OpeningMessageEditor";

const OUTLINE_BUTTON =
  "inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60";

const PRIMARY_BUTTON =
  "rounded-2xl bg-brand px-6 py-3.5 text-[16px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60";

/**
 * Send one student their current placement document status.
 *
 * ---------------------------------------------------------------------------
 * Nothing sends from this button
 * ---------------------------------------------------------------------------
 *
 * Pressing it opens a PREVIEW. The staff member reads the real recipient, the
 * real subject, and the real content, and only then decides. There is no path
 * in this component from one click to a sent email, and there is no path
 * anywhere in the application from a status change to a sent email.
 *
 * ---------------------------------------------------------------------------
 * Duplicate protection
 * ---------------------------------------------------------------------------
 *
 * One request id is created when the preview opens and travels with the send.
 * A double click, a slow network, a retried submission: all of them carry the
 * same id, and the database's unique constraint means only the first one ever
 * reaches Resend.
 *
 * A student emailed in the last 24 hours gets a plain warning that says WHEN,
 * and the send button becomes Send Again. It is never blocked: a student who
 * lost the first email needs a second one, and staff are the ones who know
 * that. Sending again is a new request id, so it is a new submission rather
 * than a duplicate.
 *
 * ---------------------------------------------------------------------------
 * The opening message
 * ---------------------------------------------------------------------------
 *
 * The preview arrives with the common Admin message already in place, in an
 * editable box. The staff member may keep it, edit it, or clear it, and the
 * preview underneath re-renders as they type, using the SAME pure template the
 * server uses, so what they read is the final wording. Send submits that
 * wording, and the server validates it and composes it with the student's
 * CURRENT checklist, re-read at that moment.
 *
 * The edit is a draft for this one email. It is never saved anywhere else: not
 * to the Admin setting, not to the student.
 */
export default function SendStatusEmailButton({
  studentId,
  studentName,
  studentEmail,
}: {
  studentId: string;
  studentName: string;
  /** The raw value from the student record. May be missing or unusable. */
  studentEmail: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, startLoading] = useTransition();
  const [sending, startSending] = useTransition();
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  /** The opening message as typed for THIS email. Starts as the common one. */
  const [openingDraft, setOpeningDraft] = useState("");

  const canEmail = Boolean(studentEmail?.trim());

  const openPreview = useCallback(() => {
    setOpen(true);
    setPreview(null);
    setError(null);
    setSentAt(null);
    setOpeningDraft("");
    // A fresh id per preview. This is what makes Send Again a deliberate second
    // submission rather than a replay of the first one.
    setRequestId(crypto.randomUUID());

    startLoading(async () => {
      const result = await previewStudentDocumentEmailAction({ studentId });
      if (result.ok) {
        setPreview(result.preview);
        setOpeningDraft(result.preview.openingMessage ?? "");
      } else {
        setError(result.error);
      }
    });
  }, [studentId]);

  const openingMessage = normalizeOpeningMessage(openingDraft);
  const openingTooLong = openingDraft.length > OPENING_MESSAGE_MAX_LENGTH;

  /**
   * The preview with the draft applied.
   *
   * The server built the snapshot from the live checklist a moment ago; only
   * the opening message changes here, and it is rendered by the same pure
   * template the server will use, so the text shown is the text that will be
   * sent for this checklist.
   */
  const reviewed = useMemo(() => {
    if (!preview) return null;
    const snapshot = { ...preview.snapshot, opening_message: openingMessage };
    return { snapshot, bodyText: renderDocumentEmail(snapshot).text };
  }, [preview, openingMessage]);

  function send() {
    if (!requestId || openingTooLong) return;
    setError(null);
    startSending(async () => {
      const result = await sendStudentDocumentEmailAction({
        studentId,
        requestId,
        // The reviewed wording, exactly as it stands in the preview. null means
        // the staff member cleared it for this email.
        openingMessage,
      });
      if (result.ok) {
        setSentAt(new Date().toISOString());
        setPreview(null);
        return;
      }
      setError(result.error);
    });
  }

  function close() {
    setOpen(false);
    setPreview(null);
    setError(null);
  }

  const recent = preview?.recentSend ?? null;
  const recentAgo = recent ? timeAgoLabel(recent.sentAt) : null;

  return (
    <>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={!canEmail}
          onClick={openPreview}
          className={OUTLINE_BUTTON}
        >
          <Mail size={20} aria-hidden="true" />
          Send Status Email
        </button>
        {canEmail ? null : (
          <p className="text-[15px] text-ink-muted">{NO_EMAIL_MESSAGE}</p>
        )}
      </div>

      <ActionDialog
        open={open}
        onClose={close}
        title="Send placement document status email"
        subtitle={studentName}
      >
        {loading ? (
          <p className="text-[17px] text-ink-muted">Building the preview...</p>
        ) : null}

        {sentAt ? (
          <div className="flex flex-col gap-5">
            <p className="rounded-2xl border border-ready-line bg-ready-soft px-6 py-5 text-[17px] text-ready-ink">
              The email has been accepted by our email provider and is on its
              way. Delivery is confirmed separately and will appear in Email
              History.
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={close} className={OUTLINE_BUTTON}>
                Close
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink"
          >
            {error}
          </p>
        ) : null}

        {preview && !sentAt ? (
          <div className="flex flex-col gap-6">
            {recent ? (
              <div className="rounded-2xl border border-warning-line bg-warning-soft px-6 py-5">
                <p className="text-[17px] font-medium text-warning-ink">
                  A document status email was sent{" "}
                  {recentAgo ?? "in the last 24 hours"}.
                </p>
                {recent.sentAt ? (
                  <p className="mt-1 text-[16px] text-warning-ink">
                    {formatTimestamp(recent.sentAt)}
                  </p>
                ) : null}
                <p className="mt-2 text-[16px] text-warning-ink">
                  Sending again is fine if the student needs another copy.
                </p>
              </div>
            ) : null}

            <div className="rounded-2xl border border-line bg-surface-muted p-5">
              <OpeningMessageEditor
                value={openingDraft}
                commonMessage={preview.commonOpeningMessage}
                onChange={setOpeningDraft}
                disabled={sending}
              />
            </div>

            <EmailSnapshotView
              snapshot={reviewed?.snapshot ?? preview.snapshot}
              subject={preview.subject}
              bodyText={reviewed?.bodyText ?? preview.bodyText}
            />

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={sending}
                onClick={close}
                className={OUTLINE_BUTTON}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sending || openingTooLong}
                onClick={send}
                className={PRIMARY_BUTTON}
              >
                {sending
                  ? "Sending..."
                  : recent
                    ? "Send Again"
                    : "Send Email"}
              </button>
            </div>
          </div>
        ) : null}

        {!loading && !preview && !sentAt && !error ? (
          <p className="text-[17px] text-ink-muted">
            The preview could not be loaded. Close this and try again.
          </p>
        ) : null}
      </ActionDialog>
    </>
  );
}
