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
  EMAIL_SNAPSHOT_VERSION,
  emailEntriesFrom,
  hasSendableContent,
  isReminderEligible,
  parseStoredSnapshot,
  storedOpeningMessage,
  type DocumentEmailSnapshot,
} from "../src/lib/documents/email-content";
import {
  DEFAULT_PLACEMENT_EMAIL_SETTINGS,
  effectiveOpeningMessage,
  EmailSettingsFormSchema,
  normalizeOpeningMessage,
  OPENING_MESSAGE_HELPER_TEXT,
  OPENING_MESSAGE_MAX_LENGTH,
  settingsFromRow,
  validateOpeningMessage,
} from "../src/lib/documents/email-settings";
import {
  emailActivityFiltersFrom,
  emailActivityHref,
  emptyEmailActivityValues,
  EMAIL_ACTIVITY_PAGE_SIZE,
  pageInfoFor,
  providerErrorPreview,
  PROVIDER_ERROR_PREVIEW_LENGTH,
  rangeForPage,
  resolveActivityStatuses,
  startOfAcademyDay,
} from "../src/lib/documents/email-activity";
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
  hasUnresolvedEmailStatus,
  isEmailActionNeededStatus,
  isStudentEmailSent,
  isStudentEmailStatusFinal,
  RECENT_EMAIL_WINDOW_HOURS,
  STUDENT_EMAIL_FINAL_STATUSES,
  STUDENT_EMAIL_STATUS_GROUPS,
  STUDENT_EMAIL_STATUS_GROUP_STATUSES,
  STUDENT_EMAIL_STATUSES,
  STUDENT_EMAIL_UNRESOLVED_STATUSES,
  studentEmailStatusGroup,
  type PlacementDocumentStatus,
  type StaffRole,
  type StudentEmailStatus,
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
// Email Activity: status groups, filters, and pagination (PLACEMENT-06A.1)
//
// All of it pure. The Activity page's filters, its three quick groups, and the
// rule that decides when live polling stops are arithmetic and list membership,
// so they can be exercised here without a database, a session, or a provider.
//
// The polling rule is the one worth a check rather than a comment: "stop when
// everything is final" is a sentence that reads fine and would be wrong in two
// different ways if Sent counted as final, or if a bounce did not.
// ---------------------------------------------------------------------------

section("Email Activity status groups");

const ALL_EMAIL_STATUSES = [...STUDENT_EMAIL_STATUSES];

check(
  "every status belongs to exactly one quick group",
  ALL_EMAIL_STATUSES.every((status) => {
    const groups = STUDENT_EMAIL_STATUS_GROUPS.filter((group) =>
      STUDENT_EMAIL_STATUS_GROUP_STATUSES[group].includes(status),
    );
    return groups.length === 1 && groups[0] === studentEmailStatusGroup(status);
  }),
);

check(
  "In Progress is exactly the unresolved statuses",
  STUDENT_EMAIL_STATUS_GROUP_STATUSES.in_progress.join() ===
    [...STUDENT_EMAIL_UNRESOLVED_STATUSES].join(),
);

check(
  "Delivered and Needs Attention together are exactly the final statuses",
  [
    ...STUDENT_EMAIL_STATUS_GROUP_STATUSES.delivered,
    ...STUDENT_EMAIL_STATUS_GROUP_STATUSES.needs_attention,
  ]
    .slice()
    .sort()
    .join() === [...STUDENT_EMAIL_FINAL_STATUSES].slice().sort().join(),
);

check(
  "accepted and sent are NOT final, so polling keeps waiting on them",
  !isStudentEmailStatusFinal("accepted") && !isStudentEmailStatusFinal("sent"),
);

check(
  "accepted and sent are never grouped as Delivered",
  studentEmailStatusGroup("accepted") === "in_progress" &&
    studentEmailStatusGroup("sent") === "in_progress",
);

check(
  "delivered, bounced, failed, and complained are final",
  ["delivered", "bounced", "failed", "complained"].every((status) =>
    isStudentEmailStatusFinal(status as StudentEmailStatus),
  ),
);

check(
  "a pending row is unresolved, so a stuck send is never called finished",
  !isStudentEmailStatusFinal("pending"),
);

check(
  "polling runs while one email is still unresolved",
  hasUnresolvedEmailStatus(["delivered", "bounced", "sent"]),
);

check(
  "polling stops once every visible email is final",
  !hasUnresolvedEmailStatus(["delivered", "bounced", "failed", "complained"]),
);

check(
  "an empty list is not something to poll",
  !hasUnresolvedEmailStatus([]),
);

section("Email Activity filters");

check(
  "junk status, type, group, and range values are dropped",
  Object.keys(
    emailActivityFiltersFrom({
      ...emptyEmailActivityValues,
      status: "delivered_ish",
      type: "newsletter",
      group: "everything",
      range: "since_tuesday",
    }),
  ).length === 0,
);

check(
  "a real status, type, and group are kept",
  (() => {
    const filters = emailActivityFiltersFrom({
      ...emptyEmailActivityValues,
      status: "bounced",
      type: "document_reminder",
      group: "needs_attention",
    });
    return (
      filters.status === "bounced" &&
      filters.emailType === "document_reminder" &&
      filters.group === "needs_attention"
    );
  })(),
);

check(
  "All time sets no lower bound, and the other ranges do",
  emailActivityFiltersFrom({ ...emptyEmailActivityValues, range: "all" })
    .since === undefined &&
    typeof emailActivityFiltersFrom({
      ...emptyEmailActivityValues,
      range: "30d",
    }).since === "string",
);

check(
  "Today starts no later than now and no earlier than 25 hours ago",
  (() => {
    const now = new Date();
    const start = startOfAcademyDay(now).getTime();
    return start <= now.getTime() && now.getTime() - start < 25 * 3_600_000;
  })(),
);

check(
  "a group filter asks for that group's statuses",
  (resolveActivityStatuses({ group: "in_progress" }) ?? []).join() ===
    [...STUDENT_EMAIL_UNRESOLVED_STATUSES].join(),
);

check(
  "no status filter asks for every status",
  resolveActivityStatuses({}) === null,
);

check(
  "a status outside the group beside it matches nothing, rather than silently winning",
  (resolveActivityStatuses({ status: "delivered", group: "needs_attention" }) ?? null)
    ?.length === 0,
);

check(
  "changing a filter returns to page one",
  emailActivityHref(
    "/activity",
    { ...emptyEmailActivityValues, page: "4", batch: "b1" },
    { status: "bounced" },
  ) === "/activity?batch=b1&status=bounced",
);

check(
  "changing page keeps every filter",
  emailActivityHref(
    "/activity",
    { ...emptyEmailActivityValues, q: "amira", batch: "b1", status: "sent" },
    { page: "3" },
  ) === "/activity?q=amira&batch=b1&status=sent&page=3",
);

check(
  "the defaults stay out of the URL",
  emailActivityHref(
    "/activity",
    { ...emptyEmailActivityValues, range: "all", page: "1" },
    {},
  ) === "/activity",
);

section("Email Activity pagination");

check(
  "a page holds 50 emails",
  EMAIL_ACTIVITY_PAGE_SIZE === 50,
);

check(
  "page 2 asks for rows 50 to 99",
  rangeForPage(2).from === 50 && rangeForPage(2).to === 99,
);

check(
  "a page past the end is clamped to the last page that exists",
  pageInfoFor(120, 99).page === 3 && pageInfoFor(120, 99).pageCount === 3,
);

check(
  "the row window is described 1 based",
  pageInfoFor(120, 2).firstRow === 51 && pageInfoFor(120, 2).lastRow === 100,
);

check(
  "an empty result set is one page describing no rows",
  pageInfoFor(0, 1).pageCount === 1 && pageInfoFor(0, 1).firstRow === 0,
);

check(
  "a long provider error is cut to one line for the list",
  (providerErrorPreview("x".repeat(400)) ?? "").length ===
    PROVIDER_ERROR_PREVIEW_LENGTH,
);

check(
  "a provider error's line breaks are collapsed rather than left to break a row",
  providerErrorPreview("mailbox full\n\n  retry later") ===
    "mailbox full retry later",
);

check(
  "no provider error is no line at all",
  providerErrorPreview(null) === null && providerErrorPreview("   ") === null,
);

check(
  "the Activity list never reads the stored HTML body",
  (() => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src", "lib", "documents", "email-queries.ts"),
      "utf8",
    );
    const select = source.slice(
      source.indexOf("const ACTIVITY_SELECT"),
      source.indexOf("].join(\", \")"),
    );
    return select.length > 0 && !select.includes("body_html");
  })(),
);

// ---------------------------------------------------------------------------
// PLACEMENT-06A.2  The opening message
// ---------------------------------------------------------------------------
//
// Two levels: a COMMON Academy-wide message with an on/off switch, and a
// PER-SEND message a staff member may keep, edit, or clear for one email. The
// rule these checks pin down is that the message is decided BEFORE the snapshot
// is built, frozen INTO the snapshot, and rendered FROM the snapshot, so the
// history never has to ask what the Admin setting says today.

section("Opening message");

const COMMON_MESSAGE =
  "Important: Please use placement@torontoacademy.ca for all placement-related communication. Please do not use WhatsApp for placement inquiries or document follow-up at this time.";

/** The same fixture student, with an opening message already decided. */
function snapshotWithOpening(
  openingMessage: string | null | undefined,
  items: ReturnType<typeof row>[] = CHECKLIST,
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
    sendType: "document_status",
    generatedAt: "2026-09-16T18:41:00.000Z",
    openingMessage,
  });
}

/** A settings row as the database returns it. */
function settingsRow(enabled: boolean, message: string) {
  return settingsFromRow({
    id: 1,
    opening_message_enabled: enabled,
    opening_message: message,
    updated_at: "2026-09-22T12:00:00.000Z",
    updated_by: "22222222-2222-4222-8222-222222222222",
  });
}

const disabledSettings = settingsRow(false, COMMON_MESSAGE);
const enabledSettings = settingsRow(true, `  ${COMMON_MESSAGE}  `);

check(
  "O1 the setting disabled means no opening message, even with text saved",
  effectiveOpeningMessage(disabledSettings) === null &&
    effectiveOpeningMessage(DEFAULT_PLACEMENT_EMAIL_SETTINGS) === null,
);

check(
  "O1b a disabled setting renders exactly the email PLACEMENT-06A rendered",
  (() => {
    const off = renderDocumentEmail(
      snapshotWithOpening(effectiveOpeningMessage(disabledSettings)),
    );
    return off.text === rendered.text && off.html === rendered.html;
  })(),
);

check(
  "O2 the setting enabled means the common message, trimmed",
  effectiveOpeningMessage(enabledSettings) === COMMON_MESSAGE,
);

check(
  "O2b enabled but blank is still no message",
  effectiveOpeningMessage(settingsRow(true, "   \n ")) === null,
);

const withCommon = snapshotWithOpening(effectiveOpeningMessage(enabledSettings));
const renderedWithCommon = renderDocumentEmail(withCommon);

check(
  "O3 the common message appears in the plain text body",
  renderedWithCommon.text.includes(COMMON_MESSAGE),
);

check(
  "O3b the common message appears in the HTML body",
  renderedWithCommon.html.includes(
    "Important: Please use placement@torontoacademy.ca",
  ),
);

check(
  "O4 it sits directly after the greeting and before the usual introduction",
  (() => {
    const text = renderedWithCommon.text;
    const greeting = text.indexOf("Hi Alex,");
    const opening = text.indexOf(COMMON_MESSAGE);
    const intro = text.indexOf("Here is your current placement-document status");
    const completed = text.indexOf("COMPLETED");
    const htmlGreeting = renderedWithCommon.html.indexOf("Hi Alex,");
    const htmlOpening = renderedWithCommon.html.indexOf("Important: Please use");
    const htmlIntro = renderedWithCommon.html.indexOf(
      "Here is your current placement-document status",
    );
    return (
      greeting !== -1 &&
      greeting < opening &&
      opening < intro &&
      intro < completed &&
      htmlGreeting < htmlOpening &&
      htmlOpening < htmlIntro
    );
  })(),
);

check(
  "O5 the rest of the email is unchanged by the opening message",
  (() => {
    // Remove the one added block from the text body and the two bodies match.
    const stripped = renderedWithCommon.text.replace(
      `${COMMON_MESSAGE}\n\n`,
      "",
    );
    return stripped === rendered.text && renderedWithCommon.subject === rendered.subject;
  })(),
);

check(
  "O6 the snapshot freezes the exact message and says so in its version",
  withCommon.opening_message === COMMON_MESSAGE &&
    withCommon.version === 2 &&
    EMAIL_SNAPSHOT_VERSION === 2,
);

check(
  "O7 an individual override changes only that email's snapshot",
  (() => {
    const custom = "Our office is closed Friday. Replies resume Monday.";
    const overridden = snapshotWithOpening(custom);
    const cleared = snapshotWithOpening(null);
    return (
      overridden.opening_message === custom &&
      renderDocumentEmail(overridden).text.includes(custom) &&
      !renderDocumentEmail(overridden).text.includes(COMMON_MESSAGE) &&
      cleared.opening_message === null &&
      renderDocumentEmail(cleared).text === rendered.text &&
      // The setting the override started from is exactly what it was.
      effectiveOpeningMessage(enabledSettings) === COMMON_MESSAGE
    );
  })(),
);

check(
  "O8 in a batch, one customized student does not change another, and reset restores the common message",
  (() => {
    // The resolution rule the batch action applies, per student: a key in the
    // customizations wins (a null value means cleared); otherwise the common
    // message. Reset to common is deleting the key.
    const common = effectiveOpeningMessage(enabledSettings);
    const custom = new Map<string, string | null>([
      ["student-b", "Bring your certificate to the front desk."],
      ["student-c", null],
    ]);
    const resolve = (id: string) =>
      custom.has(id) ? (custom.get(id) ?? null) : common;

    const a = snapshotWithOpening(resolve("student-a")).opening_message;
    const b = snapshotWithOpening(resolve("student-b")).opening_message;
    const c = snapshotWithOpening(resolve("student-c")).opening_message;
    custom.delete("student-b");
    const bReset = snapshotWithOpening(resolve("student-b")).opening_message;

    return (
      a === COMMON_MESSAGE &&
      b === "Bring your certificate to the front desk." &&
      c === null &&
      bReset === COMMON_MESSAGE
    );
  })(),
);

check(
  "O9 normalization trims and treats blank as none",
  normalizeOpeningMessage("  hello  ") === "hello" &&
    normalizeOpeningMessage("   ") === null &&
    normalizeOpeningMessage("") === null &&
    normalizeOpeningMessage(null) === null &&
    normalizeOpeningMessage(undefined) === null,
);

check(
  "O10 600 characters is accepted and 601 is refused, measured after trimming",
  (() => {
    const exact = validateOpeningMessage("x".repeat(OPENING_MESSAGE_MAX_LENGTH));
    const over = validateOpeningMessage(
      "x".repeat(OPENING_MESSAGE_MAX_LENGTH + 1),
    );
    const padded = validateOpeningMessage(
      `   ${"x".repeat(OPENING_MESSAGE_MAX_LENGTH)}   `,
    );
    return (
      OPENING_MESSAGE_MAX_LENGTH === 600 &&
      exact.ok &&
      exact.message?.length === 600 &&
      !over.ok &&
      /600/.test(over.error) &&
      padded.ok &&
      padded.message?.length === 600
    );
  })(),
);

check(
  "O10b null means cleared and is accepted; anything that is not text is refused",
  (() => {
    const cleared = validateOpeningMessage(null);
    const blank = validateOpeningMessage("   ");
    return (
      cleared.ok &&
      cleared.message === null &&
      blank.ok &&
      blank.message === null &&
      !validateOpeningMessage(42).ok &&
      !validateOpeningMessage({ text: "hi" }).ok &&
      !validateOpeningMessage(["hi"]).ok
    );
  })(),
);

check(
  "O10c the Admin form trims, allows blank, and refuses 601 characters",
  (() => {
    const ok = EmailSettingsFormSchema.safeParse({
      opening_message_enabled: true,
      opening_message: `  ${COMMON_MESSAGE}  `,
    });
    const blank = EmailSettingsFormSchema.safeParse({
      opening_message_enabled: false,
      opening_message: "",
    });
    const over = EmailSettingsFormSchema.safeParse({
      opening_message_enabled: true,
      opening_message: "y".repeat(601),
    });
    return (
      ok.success &&
      ok.data.opening_message === COMMON_MESSAGE &&
      blank.success &&
      !over.success
    );
  })(),
);

check(
  "O11 the opening message is escaped in the HTML body, with line breaks kept",
  (() => {
    const hostile = 'Use <b>email</b> & "reply"\nNot <script>alert(1)</script>';
    const html = renderDocumentEmail(snapshotWithOpening(hostile)).html;
    return (
      html.includes(
        "Use &lt;b&gt;email&lt;/b&gt; &amp; &quot;reply&quot;<br />Not &lt;script&gt;alert(1)&lt;/script&gt;",
      ) &&
      !html.includes("<script") &&
      !html.includes("<b>email")
    );
  })(),
);

check(
  "O12 a PLACEMENT-06A snapshot with no opening_message key still parses and renders",
  (() => {
    // Exactly what a version 1 row looks like: no key at all, version 1.
    const v1 = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
    delete v1.opening_message;
    v1.version = 1;
    const reread = parseStoredSnapshot(v1);
    if (!reread) return false;
    const renderedV1 = renderDocumentEmail(reread);
    return (
      !("opening_message" in reread) &&
      storedOpeningMessage(reread) === null &&
      renderedV1.text === rendered.text &&
      renderedV1.html === rendered.html
    );
  })(),
);

check(
  "O12b a stored version 2 snapshot reads back its exact message and re-renders identically",
  (() => {
    const stored = JSON.parse(JSON.stringify(withCommon)) as unknown;
    const reread = parseStoredSnapshot(stored);
    return (
      reread !== null &&
      storedOpeningMessage(reread) === COMMON_MESSAGE &&
      renderDocumentEmail(reread).text === renderedWithCommon.text &&
      renderDocumentEmail(reread).html === renderedWithCommon.html
    );
  })(),
);

check(
  "O12c the history is not rebuilt from today's setting",
  (() => {
    // The stored snapshot said one thing. The Admin setting now says another.
    // Rendering the stored snapshot must produce the stored thing.
    const stored = parseStoredSnapshot(
      JSON.parse(JSON.stringify(snapshotWithOpening("Old notice."))),
    );
    const todaysSetting = settingsRow(true, "New notice.");
    return (
      stored !== null &&
      effectiveOpeningMessage(todaysSetting) === "New notice." &&
      renderDocumentEmail(stored).text.includes("Old notice.") &&
      !renderDocumentEmail(stored).text.includes("New notice.")
    );
  })(),
);

check(
  "O12d a snapshot whose opening_message is somehow not text renders none",
  (() => {
    const odd = {
      ...withCommon,
      opening_message: { unexpected: true },
    } as unknown as DocumentEmailSnapshot;
    return (
      storedOpeningMessage(odd) === null &&
      renderDocumentEmail(odd).text === rendered.text
    );
  })(),
);

check(
  "O13 the internal note still never appears, opening message or not",
  !renderedWithCommon.text.includes(INTERNAL_NOTE) &&
    !renderedWithCommon.html.includes(INTERNAL_NOTE) &&
    !JSON.stringify(withCommon).includes(INTERNAL_NOTE),
);

check(
  "O14 the Admin helper text is the agreed student-facing warning",
  OPENING_MESSAGE_HELPER_TEXT ===
    "This message appears near the top of placement document emails. Keep it student-facing and do not include confidential or medical information.",
);

check(
  "O15 saving the Admin setting cannot send: the settings action never touches the send path",
  (() => {
    const source = fs.readFileSync(
      path.join(
        process.cwd(),
        "src",
        "lib",
        "documents",
        "email-settings-actions.ts",
      ),
      "utf8",
    );
    // Imports, not prose: the file's comments talk about the very things it
    // must not import.
    return (
      !/from "\.\/email-actions"/.test(source) &&
      !/from "@\/lib\/email\/resend"/.test(source) &&
      !/from "@\/lib\/supabase\/service"/.test(source) &&
      !source.includes("sendPlacementEmail(") &&
      !source.includes("createSupabaseServiceRoleClient(") &&
      source.includes("isAdmin(session)")
    );
  })(),
);

check(
  "O16 the send path validates the submitted message and still re-composes the checklist on the server",
  (() => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src", "lib", "documents", "email-actions.ts"),
      "utf8",
    );
    const individual = source.slice(
      source.indexOf("export async function sendStudentDocumentEmailAction"),
      source.indexOf("// Batch reminders"),
    );
    const batch = source.slice(
      source.indexOf("export async function sendBatchDocumentRemindersAction"),
    );
    return (
      individual.includes("validateOpeningMessage(input.openingMessage)") &&
      individual.includes("composeStudentDocumentEmail(") &&
      // The browser hands over an opening message and nothing about documents.
      !individual.includes("input.snapshot") &&
      !individual.includes("input.entries") &&
      batch.includes("customOpeningMessages") &&
      batch.includes("composeStudentDocumentEmail(") &&
      // Every customized message goes through the same schema, inside the
      // bulk input schema, before the first email is sent.
      source.includes("openingMessage: OpeningMessageSchema")
    );
  })(),
);

check(
  "O16b a batch send uses the REVIEWED default it was given and never re-reads the Admin setting",
  (() => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src", "lib", "documents", "email-actions.ts"),
      "utf8",
    );
    const batch = source.slice(
      source.indexOf("export async function sendBatchDocumentRemindersAction"),
    );
    return (
      // Required on the input, validated by the same schema as every message.
      source.includes("defaultOpeningMessage: OpeningMessageSchema") &&
      batch.includes("parsed.data") &&
      batch.includes("defaultOpeningMessage") &&
      !batch.includes("getCommonOpeningMessage(")
    );
  })(),
);

check(
  "O16c the review screen submits its own displayed default and previews with it",
  (() => {
    const panel = fs.readFileSync(
      path.join(
        process.cwd(),
        "src",
        "components",
        "documents",
        "BatchReminderPanel.tsx",
      ),
      "utf8",
    );
    return (
      panel.includes("defaultOpeningMessage: commonOpeningMessage") &&
      // Previews of non-customized students use the session's default too,
      // rather than leaving the server to look up today's value.
      /openingMessage: customMessages\.has\(studentId\)\s*\?[^:]*:\s*commonOpeningMessage/.test(
        panel,
      )
    );
  })(),
);

check(
  "O16d Message A reviewed, Admin changes to Message B, the reviewed batch still sends A and a new review sees B",
  (() => {
    // The review page loads: the enabled common message is resolved ONCE.
    let adminSetting = settingsRow(true, "Message A");
    const reviewedDefault = effectiveOpeningMessage(adminSetting);

    // The admin changes Email Settings while the review screen is open.
    adminSetting = settingsRow(true, "Message B");

    // The already-open review is sent. The submission carries the reviewed
    // default and one customization; the server resolves per student from the
    // SUBMISSION, exactly as sendBatchDocumentRemindersAction does.
    const submission = {
      defaultOpeningMessage: reviewedDefault,
      customOpeningMessages: [
        { studentId: "student-b", openingMessage: "Custom for B." },
      ],
    };
    const custom = new Map(
      submission.customOpeningMessages.map((entry) => [
        entry.studentId,
        entry.openingMessage,
      ]),
    );
    const resolve = (id: string) =>
      custom.has(id)
        ? (custom.get(id) ?? null)
        : submission.defaultOpeningMessage;

    const a = snapshotWithOpening(resolve("student-a"));
    const b = snapshotWithOpening(resolve("student-b"));

    // A NEW review opened afterwards resolves the setting again.
    const newReviewDefault = effectiveOpeningMessage(adminSetting);

    return (
      reviewedDefault === "Message A" &&
      a.opening_message === "Message A" &&
      renderDocumentEmail(a).text.includes("Message A") &&
      !renderDocumentEmail(a).text.includes("Message B") &&
      b.opening_message === "Custom for B." &&
      newReviewDefault === "Message B"
    );
  })(),
);

// The 0009 migration: who may read, who may write, and what the column allows.

const migration0009 = migrationStatements("0009_placement_email_settings");

check(
  "O17 every active staff member may read the setting",
  /create policy "staff read placement email settings"\s+on public\.placement_email_settings for select\s+to authenticated\s+using \(public\.is_active_staff\(\)\)/.test(
    migration0009,
  ),
);

check(
  "O17b only an admin may update it, checked by the existing is_admin() helper",
  /create policy "admin update placement email settings"\s+on public\.placement_email_settings for update\s+to authenticated\s+using \(public\.is_admin\(\)\)\s+with check \(public\.is_admin\(\)\)/.test(
    migration0009,
  ) &&
    !/create policy[^;]*on public\.placement_email_settings for (insert|delete)/i.test(
      migration0009,
    ),
);

check(
  "O17c grants are select and update for authenticated, nothing for anon, nothing new for the service role",
  migration0009.includes(
    "revoke all on public.placement_email_settings from anon;",
  ) &&
    migration0009.includes(
      "revoke all on public.placement_email_settings from authenticated;",
    ) &&
    migration0009.includes(
      "grant select, update on public.placement_email_settings to authenticated;",
    ) &&
    !/grant[^;]*(insert|delete)[^;]*on public\.placement_email_settings/i.test(
      migration0009,
    ) &&
    !/service_role/i.test(migration0009),
);

check(
  "O17d the 600 character limit is a database constraint, and the row is a singleton",
  migration0009.includes("check (length(opening_message) <= 600)") &&
    migration0009.includes("check (id = 1)") &&
    /insert into public\.placement_email_settings[^;]*values \(1, false, ''\)/.test(
      migration0009,
    ),
);

check(
  "O17e the migration touches no existing table",
  !/alter table public\.(students|student_email_log|student_placement_documents|batches|placement_document_requirements)/i.test(
    migration0009,
  ) &&
    !/(update|delete from) public\.student_email_log/i.test(migration0009),
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
