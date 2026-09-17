"use client";

import { Mail } from "lucide-react";
import { useState } from "react";

import ActionDialog from "@/components/ui/ActionDialog";
import StatusPill from "@/components/ui/StatusPill";
import { parseStoredSnapshot } from "@/lib/documents/email-content";
import type { StudentEmailHistoryItem } from "@/lib/documents/email-queries";
import { formatTimestamp } from "@/lib/format";
import {
  hasUnresolvedEmailStatus,
  STUDENT_EMAIL_STATUS_LABELS,
  STUDENT_EMAIL_STATUS_TONES,
  STUDENT_EMAIL_TYPE_LABELS,
} from "@/lib/placement/constants";

import EmailStatusAutoRefresh from "./EmailStatusAutoRefresh";
import EmailSnapshotView from "./EmailSnapshotView";

/**
 * Every placement email this student has been sent.
 *
 * The permanent record, read from student_email_log. Opening one shows the
 * SNAPSHOT that was stored when it was sent, not a fresh render of today's
 * checklist: an email that said "Police Check - Requested" in April still says
 * that in June, after the police check arrived.
 *
 * Nothing here can be deleted. There is no delete policy on the table and a
 * database trigger refuses the delete outright, so this list only ever grows.
 *
 * The status shown is the LOCAL status, which is honest about what we actually
 * know. "Accepted by Resend" means the provider took the message; it becomes
 * "Delivered" only when the provider's webhook says so.
 *
 * Those statuses now catch up on their own. The items are still loaded on the
 * SERVER and passed in - this component has never queried anything and still
 * does not - but while any of them can still change, EmailStatusAutoRefresh
 * asks the server for the page again every ten seconds, and stops as soon as
 * every email here has reached a final status. A staff member who sends a
 * status email and stays on the page watches it reach Delivered without
 * touching reload.
 */
export default function StudentEmailHistory({
  items,
}: {
  items: StudentEmailHistoryItem[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const openItem = items.find((item) => item.id === openId) ?? null;
  const openSnapshot = openItem
    ? parseStoredSnapshot(openItem.content_snapshot)
    : null;

  if (items.length === 0) {
    return (
      <p className="text-[17px] text-ink-muted">
        No placement emails have been sent to this student yet.
      </p>
    );
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <EmailStatusAutoRefresh
          active={hasUnresolvedEmailStatus(items.map((item) => item.status))}
        />
      </div>

      <ul className="flex flex-col gap-4">
        {items.map((item) => {
          const snapshot = parseStoredSnapshot(item.content_snapshot);
          const outstanding = snapshot?.action_needed.length ?? 0;

          return (
            <li
              key={item.id}
              className="rounded-2xl border border-line bg-surface p-6"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[16px] text-ink-muted">
                    {formatTimestamp(item.sent_at ?? item.created_at)}
                  </p>
                  <p className="mt-1 text-[18px] font-medium text-ink">
                    {STUDENT_EMAIL_TYPE_LABELS[item.email_type]}
                  </p>
                  <p className="mt-1 break-words text-[16px] text-ink-muted">
                    {item.recipient_email}
                  </p>
                  <p className="mt-2 text-[16px] text-ink-muted">
                    {item.sentByName ? `Sent by ${item.sentByName}` : "Sent by staff"}
                    {snapshot
                      ? ` - ${
                          outstanding === 0
                            ? "nothing required attention"
                            : outstanding === 1
                              ? "1 item required attention"
                              : `${outstanding} items required attention`
                        }`
                      : ""}
                  </p>
                  {item.error_message ? (
                    <p className="mt-2 break-words text-[16px] text-attention-ink">
                      {item.error_message}
                    </p>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
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
            ? `${formatTimestamp(openItem.sent_at ?? openItem.created_at)} - ${
                STUDENT_EMAIL_STATUS_LABELS[openItem.status]
              }`
            : undefined
        }
      >
        {openItem && openSnapshot ? (
          <EmailSnapshotView
            snapshot={openSnapshot}
            subject={openItem.subject}
            bodyText={openItem.body_text}
          />
        ) : openItem ? (
          // A snapshot written by a future version of this feature, or a row
          // whose stored content cannot be read. The exact text that was sent is
          // still here, so the record is still complete.
          <div>
            <p className="text-[17px] text-ink-muted">
              The structured snapshot of this email could not be read. The exact
              text that was sent is below.
            </p>
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border border-line bg-surface-muted p-5 font-sans text-[15px] leading-relaxed text-ink">
              {openItem.body_text}
            </pre>
          </div>
        ) : null}
      </ActionDialog>
    </>
  );
}
