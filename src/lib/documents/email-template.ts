/**
 * The words a student actually receives.
 *
 * PURE, like email-content.ts: it renders a snapshot and nothing else. It reads
 * no database row, so it cannot accidentally reach past the snapshot for a
 * field the snapshot deliberately left out, and the Email History can re-render
 * a two-month-old snapshot without any of today's data leaking into it.
 *
 * Tone: administrative and warm. This email says where a student's placement
 * paperwork stands. It is not marketing, it carries no tracking, and it has no
 * unsubscribe footer, because a student cannot opt out of being told their
 * police check is missing. It also says nothing about WHY a requirement is what
 * it is: no health detail, no staff reasoning, nothing beyond the requirement's
 * own name and a student message someone wrote on purpose.
 */

import type { StudentEmailType } from "@/lib/placement/constants";

import type {
  DocumentEmailSnapshot,
  EmailRequirementLine,
} from "./email-content";

/** Where student replies are read. Never the sending address. */
export const PLACEMENT_CONTACT_EMAIL = "placement@torontoacademy.ca";

const ACADEMY_NAME = "Toronto Academy of Education";

/**
 * One subject per send type.
 *
 * A reminder says so in the subject line. A student who gets a status update in
 * April and a reminder in June should be able to tell the two apart in their
 * inbox without opening either.
 */
const SUBJECTS: Record<StudentEmailType, string> = {
  document_status: "Placement Document Status Update - Toronto Academy",
  document_reminder: "Outstanding Placement Documents - Toronto Academy",
};

export function subjectFor(sendType: StudentEmailType): string {
  return SUBJECTS[sendType];
}

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

/**
 * Deliberately plain ASCII markers rather than emoji or symbols.
 *
 * A checkmark that arrives as a replacement box in one mail client and as a
 * green tick in another is not worth the risk on a message about someone's
 * police check.
 */
const COMPLETED_MARKER = "[done]";
const ACTION_MARKER = "[needed]";

export function renderDocumentEmail(
  snapshot: DocumentEmailSnapshot,
  options: { contactEmail?: string } = {},
): RenderedEmail {
  const contactEmail = options.contactEmail?.trim() || PLACEMENT_CONTACT_EMAIL;

  return {
    subject: subjectFor(snapshot.send_type),
    text: renderText(snapshot, contactEmail),
    html: renderHtml(snapshot, contactEmail),
  };
}

/** The opening line, which is the only place the two send types differ. */
function introFor(snapshot: DocumentEmailSnapshot): string {
  if (snapshot.send_type === "document_reminder") {
    return `Here is a reminder of the placement documents we are still waiting for from you at ${ACADEMY_NAME}.`;
  }
  return `Here is your current placement-document status from ${ACADEMY_NAME}.`;
}

/**
 * The closing line.
 *
 * The second sentence is not padding. It is what stops a student reading this
 * list as complete when some of their requirements have not been reviewed yet,
 * and it is the honest counterpart of leaving Not Reviewed rows out.
 */
function closingFor(snapshot: DocumentEmailSnapshot): string[] {
  const lines: string[] = [];
  if (snapshot.action_needed.length > 0) {
    lines.push(
      "Please complete any outstanding items as soon as possible.",
    );
  } else {
    lines.push(
      "There is nothing outstanding on your checklist at the moment. Thank you.",
    );
  }
  lines.push(
    "This update includes the placement requirements currently reviewed by our placement team.",
  );
  return lines;
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

function renderText(
  snapshot: DocumentEmailSnapshot,
  contactEmail: string,
): string {
  const blocks: string[] = [];

  blocks.push(`Hi ${snapshot.student.first_name},`);
  blocks.push(introFor(snapshot));

  if (snapshot.completed.length > 0) {
    blocks.push(["COMPLETED", ...snapshot.completed.map(textLine)].join("\n"));
  }

  if (snapshot.action_needed.length > 0) {
    blocks.push(
      ["ACTION NEEDED", ...snapshot.action_needed.map(textLine)].join("\n"),
    );
  }

  blocks.push(...closingFor(snapshot));
  blocks.push(
    `If you have questions, simply reply to this email or contact:\n${contactEmail}`,
  );
  blocks.push(`${ACADEMY_NAME}\nPlacement Team`);

  return `${blocks.join("\n\n")}\n`;
}

function textLine(line: EmailRequirementLine): string {
  const marker = line.status === "received" ? COMPLETED_MARKER : ACTION_MARKER;
  // The status word is only useful where there is more than one of them, so
  // Completed rows carry the name alone and Action Needed rows say which kind.
  const heading =
    line.status === "received"
      ? `${marker} ${line.name}`
      : `${marker} ${line.name} - ${line.status_label}`;

  if (!line.student_message) return heading;
  return `${heading}\n    ${line.student_message}`;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

/**
 * Escaped before anything reaches the HTML body.
 *
 * Requirement names and student messages are staff-typed free text, and an
 * unescaped apostrophe or angle bracket in "Master's" or "<Dr. Lee>" is enough
 * to break a mail client's rendering.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/*
 * The app's own palette, as literal hex values.
 *
 * A mail client will not resolve a CSS custom property, so these are the same
 * colours src/app/globals.css defines, written out. Green for completed, soft
 * coral for outstanding, the Toronto Academy navy for the one link.
 */
const TEXT_COLOR = "#1f2933";
const MUTED_COLOR = "#52606d";
const BORDER_COLOR = "#e4e7eb";
const BRAND_COLOR = "#1d3461";
const READY_COLOR = "#0b6141";
const ATTENTION_COLOR = "#a32e25";

/**
 * One table-free, image-free, single-column message.
 *
 * Inline styles only, because a mail client may strip a style block, and no
 * remote assets at all, so nothing in this email phones home when a student
 * opens it.
 */
function renderHtml(
  snapshot: DocumentEmailSnapshot,
  contactEmail: string,
): string {
  const parts: string[] = [];

  parts.push(
    `<p style="margin:0 0 16px;">Hi ${escapeHtml(snapshot.student.first_name)},</p>`,
  );
  parts.push(
    `<p style="margin:0 0 24px;">${escapeHtml(introFor(snapshot))}</p>`,
  );

  if (snapshot.completed.length > 0) {
    parts.push(sectionHtml("Completed", snapshot.completed, READY_COLOR));
  }
  if (snapshot.action_needed.length > 0) {
    parts.push(
      sectionHtml("Action Needed", snapshot.action_needed, ATTENTION_COLOR),
    );
  }

  for (const line of closingFor(snapshot)) {
    parts.push(`<p style="margin:0 0 16px;">${escapeHtml(line)}</p>`);
  }

  parts.push(
    `<p style="margin:0 0 16px;">If you have questions, simply reply to this email or contact <a href="mailto:${escapeHtml(contactEmail)}" style="color:${BRAND_COLOR};">${escapeHtml(contactEmail)}</a>.</p>`,
  );
  parts.push(
    `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid ${BORDER_COLOR};color:${MUTED_COLOR};">${escapeHtml(ACADEMY_NAME)}<br />Placement Team</p>`,
  );

  return [
    `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(subjectFor(snapshot.send_type))}</title></head>`,
    `<body style="margin:0;padding:24px;background:#f7f8fa;">`,
    `<div style="max-width:560px;margin:0 auto;padding:28px;background:#ffffff;border:1px solid ${BORDER_COLOR};border-radius:12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:${TEXT_COLOR};">`,
    parts.join(""),
    `</div></body></html>`,
  ].join("");
}

function sectionHtml(
  heading: string,
  lines: EmailRequirementLine[],
  accent: string,
): string {
  const items = lines
    .map((line) => {
      const label =
        line.status === "received"
          ? escapeHtml(line.name)
          : `${escapeHtml(line.name)} <span style="color:${MUTED_COLOR};">- ${escapeHtml(line.status_label)}</span>`;

      const message = line.student_message
        ? `<div style="margin-top:4px;color:${MUTED_COLOR};">${escapeHtml(line.student_message)}</div>`
        : "";

      return `<li style="margin:0 0 12px;"><strong style="font-weight:600;">${label}</strong>${message}</li>`;
    })
    .join("");

  return [
    `<h2 style="margin:0 0 12px;font-size:15px;letter-spacing:0.06em;text-transform:uppercase;color:${accent};">${escapeHtml(heading)}</h2>`,
    `<ul style="margin:0 0 24px;padding-left:20px;">${items}</ul>`,
  ].join("");
}
