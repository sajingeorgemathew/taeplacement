"use client";

import { Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import ActionDialog from "@/components/ui/ActionDialog";
import StatusPill from "@/components/ui/StatusPill";
import {
  actionNeededLabel,
  providerErrorPreview,
} from "@/lib/documents/email-activity";
import { parseStoredSnapshot } from "@/lib/documents/email-content";
import type { EmailActivityItem } from "@/lib/documents/email-queries";
import { formatTimestamp } from "@/lib/format";
import {
  STUDENT_EMAIL_STATUS_LABELS,
  STUDENT_EMAIL_STATUS_TONES,
  STUDENT_EMAIL_TYPE_LABELS,
  studentEmailStatusGroup,
} from "@/lib/placement/constants";

import EmailSnapshotView from "./EmailSnapshotView";

/**
 * Every placement document email, across every student, newest first.
 *
 * The operational view of the same rows the student's own Email History shows.
 * It reads student_email_log and nothing else, so what a row says is what was
 * true when the email was sent: the address it went to, the person who sent it,
 * and the snapshot of the checklist it described.
 *
 * Opening one shows that STORED snapshot. Nothing here regenerates an email
 * from today's checklist, and there is no code path that could: the dialog is
 * handed the row's own content_snapshot and body_text.
 *
 * There is no delete, no edit, and no way to set a status by hand. That is not
 * a matter of hiding buttons - authenticated staff hold SELECT on this table
 * and nothing else, and a database trigger refuses the delete even from the
 * server's own credential.
 *
 * ---------------------------------------------------------------------------
 * The shape of a row
 * ---------------------------------------------------------------------------
 *
 * Roomy rows rather than a dense table, with the same four columns aligned on
 * desktop so the list can still be scanned down a column:
 *
 *   when         the timestamp, and who sent it
 *   who          the student, linked to their record, and their batch
 *   what         the email type, the recipient address, the outstanding count
 *   outcome      the delivery status, and the button that opens the email
 *
 * A provider failure gets its own line UNDERNEATH the row rather than a column
 * inside it. Bounce messages are written by mail servers and run to a couple of
 * hundred characters; given a column they would either be truncated to
 * uselessness or squeeze the other three. On its own line, clipped to one, it
 * stays readable and the full text is one click away in the dialog.
 */

const ROW_GRID =
  "grid gap-5 lg:grid-cols-[13rem_minmax(0,1.1fr)_minmax(0,1.3fr)_minmax(0,15rem)] lg:items-start lg:gap-6";

export default function EmailActivityList({
  items,
  emptyMessage,
}: {
  items: EmailActivityItem[];
  emptyMessage: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const openItem = items.find((item) => item.id === openId) ?? null;
  const openSnapshot = openItem
    ? parseStoredSnapshot(openItem.content_snapshot)
    : null;

  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-line bg-surface p-8">
        <p className="text-[17px] text-ink-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      {/* Column headings, desktop only. Below lg each row stacks and labels
          itself, so a repeated header would only add noise. */}
      <div
        aria-hidden="true"
        className={`${ROW_GRID} mb-3 hidden px-6 lg:grid`}
      >
        <p className="text-[14px] font-semibold uppercase tracking-wide text-ink-muted">
          Sent
        </p>
        <p className="text-[14px] font-semibold uppercase tracking-wide text-ink-muted">
          Student
        </p>
        <p className="text-[14px] font-semibold uppercase tracking-wide text-ink-muted">
          Email
        </p>
        <p className="text-[14px] font-semibold uppercase tracking-wide text-ink-muted">
          Delivery
        </p>
      </div>

      <ul className="flex flex-col gap-4">
        {items.map((item) => {
          const group = studentEmailStatusGroup(item.status);
          const errorPreview =
            group === "needs_attention"
              ? providerErrorPreview(item.error_message)
              : null;

          return (
            <li
              key={item.id}
              className="rounded-2xl border border-line bg-surface p-6"
            >
              <div className={ROW_GRID}>
                <div className="min-w-0">
                  <p className="text-[16px] text-ink">
                    {formatTimestamp(item.sent_at ?? item.created_at)}
                  </p>
                  <p className="mt-1 break-words text-[15px] text-ink-muted">
                    {item.sentByName ? `Sent by ${item.sentByName}` : "Sent by staff"}
                  </p>
                </div>

                <div className="min-w-0">
                  <Link
                    href={`/students/${item.student_id}`}
                    className="break-words text-[18px] font-medium text-brand-strong underline-offset-4 hover:underline"
                  >
                    {item.studentName}
                  </Link>
                  <p className="mt-1 break-words text-[15px] text-ink-muted">
                    {item.batchName ?? "No batch assigned"}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="text-[16px] text-ink">
                    {STUDENT_EMAIL_TYPE_LABELS[item.email_type]}
                  </p>
                  <p className="mt-1 break-words text-[15px] text-ink-muted">
                    {item.recipient_email}
                  </p>
                  {item.actionNeededCount === null ? null : (
                    <p className="mt-1 text-[15px] text-ink-muted">
                      {actionNeededLabel(item.actionNeededCount)}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 lg:flex-col lg:items-start">
                  <StatusPill
                    label={STUDENT_EMAIL_STATUS_LABELS[item.status]}
                    tone={STUDENT_EMAIL_STATUS_TONES[item.status]}
                  />
                  <button
                    type="button"
                    onClick={() => setOpenId(item.id)}
                    className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[15px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
                  >
                    <Mail size={18} aria-hidden="true" />
                    View Email
                  </button>
                </div>
              </div>

              {group === "needs_attention" ? (
                <p className="mt-4 border-t border-attention-line pt-4 text-[15px] text-attention-ink">
                  <span className="font-medium">
                    This email did not reach the student.
                  </span>{" "}
                  <span className="break-words">
                    {errorPreview
                      ? `${errorPreview} Open the email for the full provider message.`
                      : "Open the email for the delivery detail."}
                  </span>
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <ActionDialog
        open={openItem !== null}
        onClose={() => setOpenId(null)}
        title={openItem?.subject ?? "Sent email"}
        subtitle={
          openItem
            ? `${openItem.studentName} - ${formatTimestamp(
                openItem.sent_at ?? openItem.created_at,
              )}`
            : undefined
        }
      >
        {openItem ? (
          <div className="flex flex-col gap-5">
            <DeliveryDetail item={openItem} />

            {openSnapshot ? (
              <EmailSnapshotView
                snapshot={openSnapshot}
                subject={openItem.subject}
                bodyText={openItem.body_text}
              />
            ) : (
              // A snapshot written by a future version of this feature, or a row
              // whose stored content cannot be read. The exact text that was
              // sent is still here, so the record is still complete.
              <div>
                <p className="text-[17px] text-ink-muted">
                  The structured snapshot of this email could not be read. The
                  exact text that was sent is below.
                </p>
                <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border border-line bg-surface-muted p-5 font-sans text-[15px] leading-relaxed text-ink">
                  {openItem.body_text}
                </pre>
              </div>
            )}
          </div>
        ) : null}
      </ActionDialog>
    </>
  );
}

/**
 * What the provider has said about one email, and when.
 *
 * Every timestamp the log holds is shown, rather than only the latest one. A
 * message that was delivered and then complained about has both facts on the
 * row, and answering "did this arrive" three months later means seeing both.
 *
 * The full provider message lives here, wrapped, where length costs nothing.
 */
function DeliveryDetail({ item }: { item: EmailActivityItem }) {
  const rows: { label: string; value: string }[] = [];

  const push = (label: string, value: string | null) => {
    if (value) rows.push({ label, value });
  };

  push("Sent", formatTimestamp(item.sent_at ?? item.created_at));
  push("Delivered", formatTimestamp(item.delivered_at));
  push("Bounced", formatTimestamp(item.bounced_at));
  push("Failed", formatTimestamp(item.failed_at));
  push("Marked as spam", formatTimestamp(item.complained_at));
  push("Last provider update", formatTimestamp(item.last_provider_event_at));

  return (
    <div className="rounded-2xl border border-line bg-surface-muted p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[16px] text-ink-muted">Delivery</p>
          <p className="mt-1 break-words text-[17px] text-ink">
            {item.batchName
              ? `${item.studentName} - ${item.batchName}`
              : item.studentName}
          </p>
        </div>
        <StatusPill
          label={STUDENT_EMAIL_STATUS_LABELS[item.status]}
          tone={STUDENT_EMAIL_STATUS_TONES[item.status]}
        />
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
        <dt className="text-[16px] text-ink-muted">Email type</dt>
        <dd className="text-[16px] text-ink">
          {STUDENT_EMAIL_TYPE_LABELS[item.email_type]}
        </dd>
        <dt className="text-[16px] text-ink-muted">Sent by</dt>
        <dd className="break-words text-[16px] text-ink">
          {item.sentByName ?? "Staff"}
        </dd>
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-[16px] text-ink-muted">{row.label}</dt>
            <dd className="text-[16px] text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>

      {item.error_message ? (
        <p className="mt-4 break-words rounded-xl border border-attention-line bg-attention-soft p-4 text-[16px] text-attention-ink">
          {item.error_message}
        </p>
      ) : null}
    </div>
  );
}
