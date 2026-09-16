import { CheckCircle2, CircleAlert } from "lucide-react";

import type {
  DocumentEmailSnapshot,
  EmailRequirementLine,
} from "@/lib/documents/email-content";

/**
 * One placement document email, shown to STAFF.
 *
 * Used twice and written once: the preview a staff member reads before sending,
 * and the historical email they open months later. Both have to show the same
 * thing, and the surest way to keep them identical is for there to be one
 * component.
 *
 * It renders the SNAPSHOT, never the current checklist. In the preview that
 * snapshot was built a second ago; in the history it was built in April. Either
 * way what appears here is what the email said.
 *
 * There is no internal note anywhere in a snapshot, so there is nothing to hide
 * here. Anything visible in this component is something the student saw.
 */

function Section({
  title,
  tone,
  lines,
}: {
  title: string;
  tone: "ready" | "attention";
  lines: EmailRequirementLine[];
}) {
  if (lines.length === 0) return null;

  const Icon = tone === "ready" ? CheckCircle2 : CircleAlert;
  const heading =
    tone === "ready" ? "text-ready-ink" : "text-attention-ink";

  return (
    <div className="mt-6 first:mt-0">
      <h4
        className={`text-[15px] font-semibold uppercase tracking-wide ${heading}`}
      >
        {title}
      </h4>
      <ul className="mt-3 flex flex-col gap-3">
        {lines.map((line) => (
          <li key={line.requirement_id} className="flex items-start gap-3">
            <Icon
              size={20}
              aria-hidden="true"
              className={`mt-0.5 shrink-0 ${heading}`}
            />
            <div className="min-w-0">
              <p className="break-words text-[17px] text-ink">
                <span className="font-medium">{line.name}</span>
                {line.status === "received" ? null : (
                  <span className="text-ink-muted"> - {line.status_label}</span>
                )}
              </p>
              {line.student_message ? (
                <p className="mt-1 break-words text-[16px] text-ink-muted">
                  {line.student_message}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function EmailSnapshotView({
  snapshot,
  subject,
  bodyText,
}: {
  snapshot: DocumentEmailSnapshot;
  subject: string;
  /** The exact text that was, or would be, sent. */
  bodyText?: string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid gap-3 rounded-2xl border border-line bg-surface-muted p-5 sm:grid-cols-[auto_1fr]">
        <dt className="text-[16px] text-ink-muted">To</dt>
        <dd className="break-words text-[17px] text-ink">
          {snapshot.student.full_name} &lt;{snapshot.student.recipient_email}&gt;
        </dd>
        <dt className="text-[16px] text-ink-muted">Subject</dt>
        <dd className="break-words text-[17px] text-ink">{subject}</dd>
      </dl>

      <div className="rounded-2xl border border-line bg-surface p-6">
        <p className="text-[17px] text-ink">
          Hi {snapshot.student.first_name},
        </p>

        <Section
          title="Completed"
          tone="ready"
          lines={snapshot.completed}
        />
        <Section
          title="Action Needed"
          tone="attention"
          lines={snapshot.action_needed}
        />

        <p className="mt-6 text-[16px] text-ink-muted">
          {snapshot.action_needed.length > 0
            ? "Please complete any outstanding items as soon as possible."
            : "There is nothing outstanding on your checklist at the moment."}{" "}
          This update includes the placement requirements currently reviewed by
          our placement team.
        </p>
      </div>

      {/*
        The exact bytes. The readable version above is the same content laid out
        in this application's own style, but "exactly what was sent" has to be
        available without interpretation, so the plain text body sits underneath
        it verbatim.
      */}
      {bodyText ? (
        <details className="rounded-2xl border border-line bg-surface-muted p-5">
          <summary className="cursor-pointer text-[16px] font-medium text-ink">
            Exact email text
          </summary>
          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words font-sans text-[15px] leading-relaxed text-ink">
            {bodyText}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
