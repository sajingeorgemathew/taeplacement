/**
 * Checks for the placement document email rules.
 *
 *   npx tsx scripts/check-document-email-rendering.ts
 *
 * ---------------------------------------------------------------------------
 * This script NEVER sends an email and NEVER touches the database
 * ---------------------------------------------------------------------------
 *
 * It imports only the pure modules: the inclusion rules, the renderer, the
 * address validation, the permission helpers, and the webhook status mapping.
 * Nothing here reads RESEND_API_KEY, opens a network connection, or writes a
 * student or email row. The only use of the `resend` package is a LOCAL
 * signature check, which is an HMAC computation and makes no request.
 *
 * The fixtures are invented placeholders and deliberately not real students.
 *
 * What it is for: the inclusion rules are the part of this feature where a
 * mistake is a privacy incident rather than a bug. "Internal notes are never
 * emailed" should be something the repository can demonstrate, not something a
 * comment claims.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { Resend } from "resend";

import {
  buildDocumentEmailSnapshot,
  countActionNeeded,
  emailEntriesFrom,
  hasSendableContent,
  isReminderEligible,
  parseStoredSnapshot,
} from "../src/lib/documents/email-content";
import {
  canAdvanceStatus,
  parseProviderEvent,
  providerStatusChange,
} from "../src/lib/documents/email-status";
import { recentEmailCutoff } from "../src/lib/documents/email-queries";
import { renderDocumentEmail } from "../src/lib/documents/email-template";
import {
  DOCUMENT_NOTE_MAX_LENGTH,
  DOCUMENT_STUDENT_MESSAGE_MAX_LENGTH,
  DocumentNoteSchema,
  DocumentStudentMessageSchema,
} from "../src/lib/documents/schema";
import { canManageDocuments } from "../src/lib/auth/session";
import { hasUsableEmail, normalizeEmail } from "../src/lib/email/address";
import {
  isEmailActionNeededStatus,
  isStudentEmailSent,
  RECENT_EMAIL_WINDOW_HOURS,
  type PlacementDocumentStatus,
  type StaffRole,
} from "../src/lib/placement/constants";

// ---------------------------------------------------------------------------
// Tiny assertion harness
// ---------------------------------------------------------------------------

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
    return;
  }
  failures.push(`${name}${detail ? ` - ${detail}` : ""}`);
  console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ""}`);
}

function section(title: string) {
  console.log(`\n${title}`);
}

/**
 * Read one migration as text.
 *
 * A few checks below assert on SQL rather than on TypeScript. That is
 * deliberate: the email log's "authenticated staff may read and nothing else"
 * guarantee lives entirely in the migration, so a check that never looks at the
 * migration could not notice it being loosened.
 */
function migrationSource(name: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), "supabase", "migrations", `${name}.sql`),
    "utf8",
  );
}

function migrationHas(fragment: string): boolean {
  return migrationSource("0008_student_document_email").includes(fragment);
}

/**
 * The same file with every `--` comment removed.
 *
 * These migrations are heavily commented, and the comments discuss the very
 * words the checks below look for - "no delete grant", "Still no delete". A
 * pattern run over the raw text matches that prose and reports a privilege that
 * was never granted. Statements only, so a check about what the SQL DOES cannot
 * be answered by what the SQL SAYS.
 */
function migrationStatements(name: string): string {
  return migrationSource(name)
    .split("\n")
    .map((line) => {
      const comment = line.indexOf("--");
      return comment === -1 ? line : line.slice(0, comment);
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** The sentence that must never appear in anything a student receives. */
const INTERNAL_NOTE =
  "Second TB attempt failed, chase the clinic, do not tell the student yet";

/**
 * A checklist row as getStudentChecklist() returns it, internal note included.
 *
 * The note is present on purpose: the test is not "we built entries without a
 * note", it is "a real row carrying a real note produced an email that does not
 * contain it".
 */
function row(
  id: string,
  name: string,
  status: PlacementDocumentStatus,
  studentMessage: string | null,
) {
  return {
    requirement: { id, name },
    document: {
      status,
      student_message: studentMessage,
      note: INTERNAL_NOTE,
    },
  };
}

const CHECKLIST = [
  row("r1", "TB Test Report", "received", "Accepted, thank you."),
  row("r2", "WHMIS Certificate", "received", null),
  row(
    "r3",
    "Vulnerable Sector Police Check Certificate",
    "requested",
    "Please send the completed VSC once available.",
  ),
  row(
    "r4",
    "N95 Mask Fit Certificate",
    "needs_update",
    "Please provide the updated certificate.",
  ),
  row("r5", "Blood Report", "not_applicable", "Exempt for this student."),
  row("r6", "AODA Certificate", "not_reviewed", "Not looked at yet."),
];

const READINESS = {
  required_total: 6,
  required_ready: 3,
  active_total: 6,
  active_ready: 3,
  percent: 50,
  is_ready: false,
};

function snapshotFor(
  items: ReturnType<typeof row>[],
  sendType: "document_status" | "document_reminder" = "document_status",
) {
  return buildDocumentEmailSnapshot({
    student: {
      id: "11111111-1111-4111-8111-111111111111",
      student_number: "TAE-0001",
      first_name: "Alex",
      full_name: "Alex Placeholder",
      batch_name: "April 27 Batch",
    },
    recipientEmail: "alex.placeholder@example.com",
    entries: emailEntriesFrom(items),
    readiness: READINESS,
    sendType,
    generatedAt: "2026-09-16T18:41:00.000Z",
  });
}

// ---------------------------------------------------------------------------
// 1-7  Inclusion rules
// ---------------------------------------------------------------------------

section("Email inclusion rules");

const snapshot = snapshotFor(CHECKLIST);
const rendered = renderDocumentEmail(snapshot);
const bodies = `${rendered.text}\n${rendered.html}`;

const completedNames = snapshot.completed.map((line) => line.name);
const actionNames = snapshot.action_needed.map((line) => line.name);

check(
  "1  received appears under Completed",
  completedNames.includes("TB Test Report") &&
    completedNames.includes("WHMIS Certificate"),
  completedNames.join(", "),
);

check(
  "2  requested appears under Action Needed",
  actionNames.includes("Vulnerable Sector Police Check Certificate"),
  actionNames.join(", "),
);

check(
  "3  needs_update appears under Action Needed",
  actionNames.includes("N95 Mask Fit Certificate"),
  actionNames.join(", "),
);

check(
  "4  not_applicable appears NOWHERE",
  !bodies.includes("Blood Report") &&
    !bodies.includes("Exempt for this student.") &&
    !JSON.stringify(snapshot.completed).includes("Blood Report") &&
    !JSON.stringify(snapshot.action_needed).includes("Blood Report"),
);

check(
  "5  not_reviewed appears NOWHERE",
  !bodies.includes("AODA Certificate") && !bodies.includes("Not looked at yet."),
);

check(
  "6  student messages appear",
  bodies.includes("Please send the completed VSC once available.") &&
    bodies.includes("Please provide the updated certificate.") &&
    bodies.includes("Accepted, thank you."),
);

check(
  "7  the internal note NEVER appears",
  !bodies.includes(INTERNAL_NOTE) &&
    !bodies.includes("chase the clinic") &&
    !JSON.stringify(snapshot).includes(INTERNAL_NOTE),
);

check(
  "7b the snapshot carries no note field at all",
  !JSON.stringify(snapshot).includes('"note"'),
);

check(
  "7c omitted requirements are counted for staff but never named",
  snapshot.omitted.not_applicable === 1 && snapshot.omitted.not_reviewed === 1,
  JSON.stringify(snapshot.omitted),
);

// ---------------------------------------------------------------------------
// Student message length
// ---------------------------------------------------------------------------

section("Student message length");

const DOCUMENT_ID = "33333333-3333-4333-8333-333333333333";

function messageAccepted(length: number): boolean {
  return DocumentStudentMessageSchema.safeParse({
    document_id: DOCUMENT_ID,
    student_message: "x".repeat(length),
  }).success;
}

check(
  "the student message limit is 500",
  DOCUMENT_STUDENT_MESSAGE_MAX_LENGTH === 500,
  String(DOCUMENT_STUDENT_MESSAGE_MAX_LENGTH),
);

check(
  "exactly 500 characters is accepted",
  messageAccepted(500),
);

check(
  "501 characters is refused",
  !messageAccepted(501),
);

check(
  "the message limit matches the CHECK constraint in migration 0008",
  migrationHas(
    "check (student_message is null or length(student_message) <= 500)",
  ),
);

check(
  "the internal note limit is unchanged at 300, and is a FORM rule only",
  DOCUMENT_NOTE_MAX_LENGTH === 300 &&
    DocumentNoteSchema.safeParse({
      document_id: DOCUMENT_ID,
      note: "x".repeat(301),
    }).success === false &&
    // 0002 created note as plain `text`. If a length constraint on it ever
    // appears, this assertion is the thing that says the comments are now wrong.
    !/note\s+text[^,]*check/i.test(
      migrationStatements("0002_placement_documents"),
    ),
);

// ---------------------------------------------------------------------------
// 8  Email address validation
// ---------------------------------------------------------------------------

section("Recipient address");

check(
  "8  a student with no usable email cannot be emailed",
  !hasUsableEmail(null) &&
    !hasUsableEmail("") &&
    !hasUsableEmail("   ") &&
    !hasUsableEmail("not-an-email") &&
    !hasUsableEmail("missing@domain") &&
    !hasUsableEmail("two@@example.com"),
);

check(
  "8b a usable address is trimmed and lowercased, never rewritten upstream",
  normalizeEmail("  Alex.Placeholder@Example.COM ") ===
    "alex.placeholder@example.com",
  String(normalizeEmail("  Alex.Placeholder@Example.COM ")),
);

// ---------------------------------------------------------------------------
// 9  Duplicate protection window
// ---------------------------------------------------------------------------

section("Duplicate protection");

const NOW = new Date("2026-09-16T18:41:00.000Z");
const cutoff = recentEmailCutoff(NOW);

check(
  "9  the duplicate window is 24 hours back from now",
  RECENT_EMAIL_WINDOW_HOURS === 24 && cutoff === "2026-09-15T18:41:00.000Z",
  cutoff,
);

check(
  "9b an email sent 2 hours ago is inside the window and warns",
  new Date("2026-09-16T16:41:00.000Z").toISOString() > cutoff,
);

check(
  "9c an email sent 30 hours ago is outside the window and does not warn",
  new Date("2026-09-15T12:41:00.000Z").toISOString() < cutoff,
);

check(
  "9d only statuses that mean a message really left count as a send",
  isStudentEmailSent("accepted") &&
    isStudentEmailSent("sent") &&
    isStudentEmailSent("delivered") &&
    isStudentEmailSent("delivery_delayed") &&
    !isStudentEmailSent("pending") &&
    !isStudentEmailSent("failed") &&
    !isStudentEmailSent("bounced") &&
    !isStudentEmailSent("complained"),
);

// ---------------------------------------------------------------------------
// 10-12  Bulk reminder eligibility
// ---------------------------------------------------------------------------

section("Bulk reminder eligibility");

const readyStudent = [
  row("r1", "TB Test Report", "received", null),
  row("r2", "Blood Report", "not_applicable", null),
];

const notReviewedStudent = [
  row("r1", "TB Test Report", "not_reviewed", null),
  row("r2", "WHMIS Certificate", "not_reviewed", null),
];

const needsAttentionStudent = [
  row("r1", "TB Test Report", "received", null),
  row("r2", "WHMIS Certificate", "requested", null),
  row("r3", "AODA Certificate", "needs_update", null),
  row("r4", "Blood Report", "not_reviewed", null),
];

check(
  "10 eligibility uses requested and needs_update only",
  isEmailActionNeededStatus("requested") &&
    isEmailActionNeededStatus("needs_update") &&
    !isEmailActionNeededStatus("received") &&
    !isEmailActionNeededStatus("not_applicable") &&
    !isEmailActionNeededStatus("not_reviewed"),
);

check(
  "10b the action-needed count is the number of those rows",
  countActionNeeded(emailEntriesFrom(needsAttentionStudent)) === 2,
  String(countActionNeeded(emailEntriesFrom(needsAttentionStudent))),
);

check(
  "11 a fully ready student is NOT a reminder recipient",
  !isReminderEligible(emailEntriesFrom(readyStudent)),
);

check(
  "11b a fully ready student may still receive a status email",
  hasSendableContent(snapshotFor(readyStudent)),
);

check(
  "12 a student whose statuses are all not_reviewed is NOT a reminder recipient",
  !isReminderEligible(emailEntriesFrom(notReviewedStudent)),
);

check(
  "12b a student with nothing reviewed has nothing sendable at all",
  !hasSendableContent(snapshotFor(notReviewedStudent)),
);

check(
  "12c a student with a requested or needs_update row IS a recipient",
  isReminderEligible(emailEntriesFrom(needsAttentionStudent)),
);

// ---------------------------------------------------------------------------
// 13  Historical snapshots
// ---------------------------------------------------------------------------

section("Permanent snapshot");

// The same student, a month later: the police check has arrived and the mask
// fit has been cleared. The stored snapshot must be unmoved by any of it.
const stored = JSON.parse(JSON.stringify(snapshot)) as unknown;
const laterChecklist = CHECKLIST.map((item) =>
  item.document.status === "requested" || item.document.status === "needs_update"
    ? row(item.requirement.id, item.requirement.name, "received", null)
    : item,
);
const laterSnapshot = snapshotFor(laterChecklist);

const reread = parseStoredSnapshot(stored);

check(
  "13 a stored snapshot reads back exactly as it was written",
  reread !== null &&
    JSON.stringify(reread) === JSON.stringify(snapshot) &&
    reread.action_needed.length === 2,
);

check(
  "13b today's checklist does not change yesterday's snapshot",
  laterSnapshot.action_needed.length === 0 &&
    reread?.action_needed.length === 2,
);

check(
  "13c re-rendering a stored snapshot reproduces the same email",
  reread !== null &&
    renderDocumentEmail(reread).text === rendered.text &&
    renderDocumentEmail(reread).subject === rendered.subject,
);

// ---------------------------------------------------------------------------
// 14-15  Permissions
// ---------------------------------------------------------------------------

section("Who may send");

function sessionFor(role: StaffRole, isActive = true) {
  return {
    userId: "22222222-2222-4222-8222-222222222222",
    email: "staff@example.com",
    profile: {
      id: "22222222-2222-4222-8222-222222222222",
      full_name: "Staff Placeholder",
      role,
      is_active: isActive,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  };
}

check(
  "14 management cannot send",
  !canManageDocuments(sessionFor("management")),
);

check(
  "15 admin and placement_manager can send",
  canManageDocuments(sessionFor("admin")) &&
    canManageDocuments(sessionFor("placement_manager")),
);

check(
  "15b a deactivated admin cannot send, and neither can a signed out visitor",
  !canManageDocuments(sessionFor("admin", false)) && !canManageDocuments(null),
);

// ---------------------------------------------------------------------------
// 16  Webhook signature verification
// ---------------------------------------------------------------------------
//
// This is the exact call the webhook route makes, against a throwaway secret.
// Signature verification is a local HMAC: no request is made and the API key is
// never used for it, so the placeholder key below reaches nothing.

section("Webhook signature");

const WEBHOOK_SECRET = `whsec_${Buffer.from(
  "placeholder-signing-secret-for-local-checks",
).toString("base64")}`;

const webhookId = "msg_placeholder";
const webhookTimestamp = String(Math.floor(Date.now() / 1000));
const webhookPayload = JSON.stringify({
  type: "email.delivered",
  created_at: "2026-09-16T18:42:00.000Z",
  data: { email_id: "resend-email-id-placeholder" },
});

function signPayload(payload: string): string {
  const secretBytes = Buffer.from(WEBHOOK_SECRET.slice("whsec_".length), "base64");
  const signature = crypto
    .createHmac("sha256", secretBytes)
    .update(`${webhookId}.${webhookTimestamp}.${payload}`)
    .digest("base64");
  return `v1,${signature}`;
}

const verifier = new Resend("re_placeholder_key_never_used_for_a_request");

function verify(payload: string, signature: string): boolean {
  try {
    verifier.webhooks.verify({
      payload,
      headers: {
        id: webhookId,
        timestamp: webhookTimestamp,
        signature,
      },
      webhookSecret: WEBHOOK_SECRET,
    });
    return true;
  } catch {
    return false;
  }
}

check(
  "16 a correctly signed payload verifies",
  verify(webhookPayload, signPayload(webhookPayload)),
);

check(
  "16b an invalid signature is rejected",
  !verify(webhookPayload, "v1,bm90LWEtcmVhbC1zaWduYXR1cmU="),
);

check(
  "16c a tampered body is rejected under the original signature",
  !verify(
    webhookPayload.replace("email.delivered", "email.bounced"),
    signPayload(webhookPayload),
  ),
);

check(
  "16d an empty signature is rejected",
  !verify(webhookPayload, ""),
);

// ---------------------------------------------------------------------------
// 17-18  Webhook event handling
// ---------------------------------------------------------------------------

section("Webhook events");

const deliveredEvent = parseProviderEvent({
  type: "email.delivered",
  created_at: "2026-09-16T18:42:00.000Z",
  data: { email_id: "abc-123" },
});

check(
  "17 an event with no email id is ignored rather than acted on",
  parseProviderEvent({
    type: "email.delivered",
    created_at: "2026-09-16T18:42:00.000Z",
    data: {},
  }) === null,
);

check(
  "17b an event type this ticket does not handle is ignored",
  parseProviderEvent({
    type: "email.opened",
    created_at: "2026-09-16T18:42:00.000Z",
    data: { email_id: "abc-123" },
  }) === null &&
    parseProviderEvent({
      type: "contact.created",
      created_at: "2026-09-16T18:42:00.000Z",
      data: { email_id: "abc-123" },
    }) === null,
);

check(
  "17c malformed payloads are ignored safely",
  parseProviderEvent(null) === null &&
    parseProviderEvent("not an object") === null &&
    parseProviderEvent({}) === null,
);

check(
  "18 a duplicate event writes the same values again, harmlessly",
  deliveredEvent !== null &&
    canAdvanceStatus("delivered", "delivered") &&
    JSON.stringify(providerStatusChange(deliveredEvent)) ===
      JSON.stringify(providerStatusChange(deliveredEvent)),
);

check(
  "18b a late email.sent cannot demote a delivered row",
  !canAdvanceStatus("delivered", "sent"),
);

check(
  "18c a bounce or complaint after a delivery still wins",
  canAdvanceStatus("delivered", "bounced") &&
    canAdvanceStatus("delivered", "complained"),
);

check(
  "18d accepted never claims delivery on its own",
  canAdvanceStatus("accepted", "delivered") &&
    !canAdvanceStatus("accepted", "pending"),
);

const bounced = parseProviderEvent({
  type: "email.bounced",
  created_at: "2026-09-16T18:45:00.000Z",
  data: {
    email_id: "abc-123",
    bounce: { message: "The mailbox does not exist.", type: "Permanent", subType: "General" },
  },
});

check(
  "18e a bounce records its own timestamp and a safe reason",
  bounced !== null &&
    providerStatusChange(bounced).status === "bounced" &&
    providerStatusChange(bounced).bounced_at === "2026-09-16T18:45:00.000Z" &&
    providerStatusChange(bounced).error_message === "The mailbox does not exist.",
);

// ---------------------------------------------------------------------------
// The email log is append only, and only the server may append
// ---------------------------------------------------------------------------
//
// These read the migration text. They are not a substitute for applying it, but
// they do make "authenticated staff cannot rewrite an audit record" a claim the
// repository checks rather than one a comment makes.

section("Email log permissions");

const migration0008 = migrationStatements("0008_student_document_email");

check(
  "authenticated staff are granted SELECT and nothing else",
  migration0008.includes(
    "grant select on public.student_email_log to authenticated;",
  ) &&
    !/grant[^;]*(insert|update|delete)[^;]*on public\.student_email_log to authenticated/i.test(
      migration0008,
    ),
);

check(
  "every prior privilege is revoked first, from anon and from authenticated",
  migration0008.includes(
    "revoke all on public.student_email_log from anon;",
  ) &&
    migration0008.includes(
      "revoke all on public.student_email_log from authenticated;",
    ),
);

check(
  "there is no insert, update, or delete POLICY for authenticated",
  !/create policy[^;]*on public\.student_email_log for (insert|update|delete)/i.test(
    migration0008,
  ),
);

check(
  "the read policy survives, for every active staff member",
  /create policy "staff read student email log"\s+on public\.student_email_log for select/.test(
    migration0008,
  ),
);

check(
  "the server callers get insert and update, but never delete",
  migration0008.includes(
    "grant select, insert, update on public.student_email_log to service_role;",
  ) &&
    !/grant[^;]*delete[^;]*on public\.student_email_log/i.test(migration0008),
);

check(
  "deletion is refused by a trigger, which also stops the service role",
  migration0008.includes("student_email_log_prevent_delete") &&
    migrationHas(
      "Sent placement emails are a permanent record and cannot be deleted.",
    ),
);

check(
  "sent_by_name is snapshotted beside the live sent_by reference",
  /sent_by uuid references public\.profiles \(id\) on delete set null,\s*\n\s*sent_by_name text,/.test(
    migration0008,
  ),
);

// ---------------------------------------------------------------------------
// A last look at the rendered email
// ---------------------------------------------------------------------------

section("Rendered email");

check(
  "subject is the status subject",
  rendered.subject === "Placement Document Status Update - Toronto Academy",
  rendered.subject,
);

check(
  "a reminder has its own subject",
  renderDocumentEmail(snapshotFor(needsAttentionStudent, "document_reminder"))
    .subject === "Outstanding Placement Documents - Toronto Academy",
);

check(
  "the reply-to contact address is in the body",
  bodies.includes("placement@torontoacademy.ca"),
);

check(
  "there is no unsubscribe footer and no tracking pixel",
  !/unsubscribe/i.test(bodies) && !/<img/i.test(rendered.html),
);

check(
  "free text is escaped in the HTML body",
  renderDocumentEmail(
    snapshotFor([row("r1", "TB <Test> & Report", "requested", "a \"quoted\" line")]),
  ).html.includes("TB &lt;Test&gt; &amp; Report"),
);

// ---------------------------------------------------------------------------

console.log("\n---");
console.log(`${passed} checks passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log("\nSample rendered text body:\n");
console.log(rendered.text);
