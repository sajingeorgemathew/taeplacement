"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  canManageDocuments,
  requireActiveStaff,
  staffDisplayName,
  type StaffSession,
} from "@/lib/auth/session";
import { NO_EMAIL_MESSAGE } from "@/lib/email/address";
import { sendPlacementEmail } from "@/lib/email/resend";
import {
  type StudentEmailStatus,
  type StudentEmailType,
} from "@/lib/placement/constants";
import type { StudentEmailLogInsert } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

import {
  NOTHING_TO_SEND_MESSAGE,
  type DocumentEmailSnapshot,
} from "./email-content";
import {
  composeStudentDocumentEmail,
  getRecentEmailSend,
  type ComposedEmail,
  type ComposeFailure,
} from "./email-queries";

/**
 * Sending placement document emails.
 *
 * The one rule that shapes every function here: NOTHING SENDS BY ITSELF. There
 * is no trigger, no schedule, and no status change anywhere in the application
 * that reaches this file. A staff member opens a preview, reads it, and presses
 * Send.
 *
 * ---------------------------------------------------------------------------
 * The send sequence, and why the log row comes first
 * ---------------------------------------------------------------------------
 *
 *   1  active staff
 *   2  can_manage_documents
 *   3  ONLY NOW, reach for the service role client
 *   4  re-read the student and the checklist on the SERVER
 *   5  build the email on the server
 *   6  insert a pending log row, whose idempotency_key is UNIQUE
 *   7  call Resend with that same key as its Idempotency-Key
 *   8  store the provider id, mark the row accepted
 *   9  a webhook later advances it to sent / delivered / bounced / failed
 *
 * Steps 1 to 3 are the whole of the authorization story and they happen in that
 * order, in authorizeSend() below. student_email_log is append only and grants
 * ordinary authenticated staff SELECT and nothing else, so the log row cannot
 * be written with the staff member's own token at all. It is written with the
 * service role, which bypasses Row Level Security - and that is precisely why
 * nothing may touch the service role until the two checks above have passed.
 * The credential is never handed to the caller, never returned from an action,
 * and never reaches client code: src/lib/supabase/service.ts is server only.
 *
 * Step 5 happens BEFORE step 6 on purpose. The unique constraint is the real
 * duplicate protection: a double-clicked button, a browser retry, and two staff
 * members pressing Send on the same submission all collide in Postgres and lose
 * before anything reaches the provider. The Resend idempotency key is the
 * second line, for the case where our request succeeded but the response never
 * came back to us.
 *
 * Step 7 stops at "accepted". The interface never says Delivered because an API
 * call returned 200.
 */

/** The result of one attempted send. */
export type SendEmailActionResult = {
  ok: boolean;
  error: string | null;
  /** The local status the log row ended on. */
  status?: StudentEmailStatus;
  /**
   * True when this exact submission had already been handled. Nothing was sent
   * a second time and this is not an error.
   */
  duplicate?: boolean;
};

const NOT_ALLOWED: SendEmailActionResult = {
  ok: false,
  error:
    "Your account can view placement documents but not email students about them. Ask a placement manager or an admin.",
};

/**
 * The most students one submission may email.
 *
 * A generous ceiling on the largest batch the academy runs, not a throttle. It
 * exists so that a malformed or replayed request cannot turn one click into a
 * thousand messages, which is the same reason bulk sending is batch scoped in
 * the first place.
 */
const MAX_BULK_RECIPIENTS = 200;

/**
 * How many provider calls are in flight at once during a bulk send.
 *
 * Small on purpose. Placement reminders are not a marketing campaign: four at a
 * time finishes a 30-student batch in a few seconds, stays well inside any
 * provider rate limit, and keeps each failure attached to the one student it
 * belongs to.
 */
const SEND_CONCURRENCY = 4;

const UuidSchema = z.uuid();

/**
 * The Supabase client that may write the email log.
 *
 * Only ever obtained through authorizeSend(). It bypasses Row Level Security,
 * so the type is deliberately not exported and no function in this file takes
 * one as a public parameter.
 */
type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>;

type SendAuthorization =
  | { ok: true; session: StaffSession; sentByName: string; service: ServiceClient }
  | { ok: false; error: string };

/**
 * Authenticate, authorize, and only then reach for the service role.
 *
 * The order is the point. requireActiveStaff() establishes WHO is asking and
 * redirects a signed out or unactivated visitor. canManageDocuments() decides
 * whether that person may email a student about their documents, which is the
 * same question as whether they may change those documents, mirroring
 * public.can_manage_documents() in the database. Only after both have passed
 * does createSupabaseServiceRoleClient() get called.
 *
 * Nothing about the service role is reachable from a browser. It is created
 * inside this module, used inside this module, and dropped when the action
 * returns; src/lib/supabase/service.ts carries the `server-only` import that
 * makes a client-side import a build error rather than a leak.
 *
 * The sender's display name is captured here, at the moment we know who is
 * sending, so it can be frozen onto the log row beside sent_by.
 */
async function authorizeSend(): Promise<SendAuthorization> {
  const session = await requireActiveStaff();
  if (!canManageDocuments(session)) {
    return { ok: false, error: NOT_ALLOWED.error ?? "Not allowed." };
  }

  const service = createSupabaseServiceRoleClient();
  if (!service) {
    // The send path cannot record what it is about to do, so it does not do it.
    // An email nobody has a permanent record of is worse than no email.
    return {
      ok: false,
      error:
        "Email sending is not configured on this server, so nothing was sent.",
    };
  }

  return {
    ok: true,
    session,
    sentByName: staffDisplayName(session),
    service,
  };
}

function messageFor(reason: ComposeFailure): string {
  switch (reason) {
    case "not_found":
      return "That student could not be found.";
    case "no_email":
      return NO_EMAIL_MESSAGE;
    case "nothing_to_send":
      return NOTHING_TO_SEND_MESSAGE;
    case "no_action_needed":
      return "This student has no outstanding documents, so there is nothing to remind them about.";
  }
}

function revalidateEmailViews(studentId: string) {
  revalidatePath(`/students/${studentId}/documents`);
  revalidatePath(`/students/${studentId}`);
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export type EmailPreview = {
  studentName: string;
  recipientEmail: string;
  subject: string;
  /** The exact plain text body that would be sent. */
  bodyText: string;
  snapshot: DocumentEmailSnapshot;
  actionNeededCount: number;
  /** A real send inside the last 24 hours, so the dialog can warn. */
  recentSend: { sentAt: string | null; status: StudentEmailStatus } | null;
};

export type PreviewResult =
  | { ok: true; preview: EmailPreview }
  | { ok: false; error: string };

/**
 * What the staff member reads before anything is sent.
 *
 * Built from the live checklist, by the same composer the send itself uses, so
 * the preview is not a mock-up of the email: it is the email. The send re-reads
 * everything again a moment later, so an approved preview still cannot send
 * stale content if the checklist moved in between.
 */
export async function previewStudentDocumentEmailAction(input: {
  studentId: string;
  sendType?: StudentEmailType;
}): Promise<PreviewResult> {
  const session = await requireActiveStaff();
  if (!canManageDocuments(session)) {
    return { ok: false, error: NOT_ALLOWED.error ?? "Not allowed." };
  }
  if (!UuidSchema.safeParse(input.studentId).success) {
    return { ok: false, error: "That student could not be found." };
  }

  const sendType: StudentEmailType = input.sendType ?? "document_status";
  const composed = await composeStudentDocumentEmail(input.studentId, sendType, {
    requireActionNeeded: sendType === "document_reminder",
  });

  if (!composed.ok) return { ok: false, error: messageFor(composed.reason) };

  const recent = await getRecentEmailSend(input.studentId);

  return {
    ok: true,
    preview: {
      studentName: composed.email.studentName,
      recipientEmail: composed.email.recipientEmail,
      subject: composed.email.rendered.subject,
      bodyText: composed.email.rendered.text,
      snapshot: composed.email.snapshot,
      actionNeededCount: composed.email.actionNeededCount,
      recentSend: recent
        ? { sentAt: recent.sent_at, status: recent.status }
        : null,
    },
  };
}

// ---------------------------------------------------------------------------
// One send
// ---------------------------------------------------------------------------

/** Postgres unique violation: this submission has already been handled. */
function isDuplicateKey(code: string | undefined): boolean {
  return code === "23505";
}

/**
 * Insert the pending row, send, record what happened.
 *
 * Shared by the individual send and by every row of a bulk reminder, so a
 * reminder to 27 students is 27 runs of exactly the code that sends one email.
 * There is no second, bulk-shaped send path where the rules could drift.
 *
 * `service` is the service role client, and it is private to this module. It
 * only ever arrives here from authorizeSend(), which means an authenticated,
 * active staff member who passes canManageDocuments() is already established by
 * the time this function exists. It is used for exactly three statements: the
 * pending insert and the two possible follow-up updates on the row it just
 * created.
 */
async function deliverComposedEmail(options: {
  service: ServiceClient;
  email: ComposedEmail;
  emailType: StudentEmailType;
  idempotencyKey: string;
  sendGroupId: string | null;
  sentBy: string;
  sentByName: string;
}): Promise<SendEmailActionResult> {
  const { service, email, emailType, idempotencyKey } = options;

  const pending: StudentEmailLogInsert = {
    student_id: email.studentId,
    email_type: emailType,
    recipient_email: email.recipientEmail,
    subject: email.rendered.subject,
    body_text: email.rendered.text,
    body_html: email.rendered.html,
    // Cast because content_snapshot is jsonb and the row type keeps it as
    // unknown: the snapshot's shape is owned by email-content.ts, not by the
    // database types.
    content_snapshot: email.snapshot as unknown,
    idempotency_key: idempotencyKey,
    send_group_id: options.sendGroupId,
    sent_by: options.sentBy,
    // Frozen here, not looked up later. sent_by can go null when a staff member
    // leaves; the name of whoever sent this email must not go with them.
    sent_by_name: options.sentByName,
    status: "pending",
  };

  const { data: logRow, error: insertError } = await service
    .from("student_email_log")
    .insert(pending)
    .select("id")
    .maybeSingle();

  if (insertError || !logRow) {
    if (isDuplicateKey(insertError?.code)) {
      // The same submission reached us twice. The first one owns the send.
      return { ok: true, error: null, duplicate: true };
    }
    return {
      ok: false,
      error: "That email could not be recorded, so nothing was sent.",
    };
  }

  const sent = await sendPlacementEmail({
    to: email.recipientEmail,
    subject: email.rendered.subject,
    text: email.rendered.text,
    html: email.rendered.html,
    idempotencyKey,
  });

  const now = new Date().toISOString();

  if (!sent.ok) {
    await service
      .from("student_email_log")
      .update({
        status: "failed",
        failed_at: now,
        error_message: sent.error,
      })
      .eq("id", logRow.id);

    return { ok: false, error: sent.error, status: "failed" };
  }

  const { error: updateError } = await service
    .from("student_email_log")
    .update({
      resend_email_id: sent.id,
      // accepted, never delivered. Only a provider webhook may say the message
      // arrived somewhere.
      status: "accepted",
      sent_at: now,
    })
    .eq("id", logRow.id);

  if (updateError) {
    // The email really was accepted, so the row must not be left saying
    // pending. The provider id is what failed to store; record that plainly
    // rather than pretending the send did not happen.
    await service
      .from("student_email_log")
      .update({
        status: "accepted",
        sent_at: now,
        error_message:
          "Sent, but the provider reference could not be stored. Delivery updates may not reach this record.",
      })
      .eq("id", logRow.id);
  }

  return { ok: true, error: null, status: "accepted" };
}

/**
 * Send one student their current placement document status.
 *
 * requestId is a UUID the browser creates once, when the preview opens. It is
 * what makes the submission, rather than the click, the unit of work: a double
 * click sends the same requestId twice and the second one loses the unique
 * constraint. Sending again on purpose is a different submission with a new
 * requestId, which is why Send Again is never blocked.
 */
export async function sendStudentDocumentEmailAction(input: {
  studentId: string;
  requestId: string;
}): Promise<SendEmailActionResult> {
  const auth = await authorizeSend();
  if (!auth.ok) return { ok: false, error: auth.error };

  if (
    !UuidSchema.safeParse(input.studentId).success ||
    !UuidSchema.safeParse(input.requestId).success
  ) {
    return { ok: false, error: "That request could not be read. Try again." };
  }

  const composed = await composeStudentDocumentEmail(
    input.studentId,
    "document_status",
  );
  if (!composed.ok) {
    return { ok: false, error: messageFor(composed.reason) };
  }

  const result = await deliverComposedEmail({
    service: auth.service,
    email: composed.email,
    emailType: "document_status",
    idempotencyKey: `document_status:${input.studentId}:${input.requestId}`,
    sendGroupId: null,
    sentBy: auth.session.userId,
    sentByName: auth.sentByName,
  });

  revalidateEmailViews(input.studentId);
  return result;
}

// ---------------------------------------------------------------------------
// Batch reminders
// ---------------------------------------------------------------------------

export type BulkSendResult = {
  error: string | null;
  sent: number;
  failed: number;
  skipped: number;
  /** Student names that could not be emailed, so the screen can name them. */
  failures: { studentId: string; message: string }[];
};

const BulkInputSchema = z.object({
  batchId: z.uuid(),
  sendGroupId: z.uuid(),
  studentIds: z.array(z.uuid()).min(1).max(MAX_BULK_RECIPIENTS),
});

/**
 * Send one personalized reminder to each selected student in one batch.
 *
 * ---------------------------------------------------------------------------
 * Why individual sends rather than the Resend batch endpoint
 * ---------------------------------------------------------------------------
 *
 * Resend can take up to 100 emails in one call, and it would be fewer HTTP
 * requests. It is the wrong shape for this feature for three reasons:
 *
 *   Idempotency is per REQUEST, not per email. `resend.batch.send` accepts one
 *   Idempotency-Key for the whole call, so a retry is all-or-nothing across 27
 *   students. Here each student has their own key, tied to their own log row.
 *
 *   Failures are positional. A partly rejected batch reports errors by INDEX,
 *   and only in permissive mode. Mapping index 14 back to a student to write
 *   the right failure onto the right permanent record is exactly the kind of
 *   bookkeeping that is silently wrong the first time the response shape
 *   changes.
 *
 *   The log rows have to be one-to-one anyway. Every student needs their own
 *   row, subject, body, snapshot, provider id, and delivery status, so the
 *   batch endpoint would save one round trip and cost a fragile join.
 *
 * So each student is composed, logged, and sent on their own, a few at a time.
 *
 * ---------------------------------------------------------------------------
 * What is re-checked here
 * ---------------------------------------------------------------------------
 *
 * Every selected student is re-read and re-composed on the server. A student
 * whose last outstanding document was marked Received while the review screen
 * was open is skipped, not emailed, because composing them as a reminder fails
 * the "has something to act on" check. The browser's selection decides WHO is
 * considered, never WHAT is true about them.
 *
 * Students are never BCC'd together. Each one gets their own message, and one
 * student can never see another student's address.
 */
export async function sendBatchDocumentRemindersAction(input: {
  batchId: string;
  sendGroupId: string;
  studentIds: string[];
}): Promise<BulkSendResult> {
  const auth = await authorizeSend();
  if (!auth.ok) {
    return {
      error: auth.error,
      sent: 0,
      failed: 0,
      skipped: 0,
      failures: [],
    };
  }

  const parsed = BulkInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: `Choose between 1 and ${MAX_BULK_RECIPIENTS} students in this batch.`,
      sent: 0,
      failed: 0,
      skipped: 0,
      failures: [],
    };
  }

  // Deliberately the ORDINARY authenticated client, not the service role. This
  // is a read the signed in staff member is entitled to make, so it goes
  // through Row Level Security like every other read in the application. The
  // service role is for writing the append only log and nothing else.
  const supabase = await createSupabaseServerClient();

  // The batch is the boundary. A student id that is not in the selected batch
  // is dropped here rather than emailed, so a tampered or stale selection can
  // never widen a batch reminder into a roster-wide send.
  const { data: batchStudents, error: batchError } = await supabase
    .from("students")
    .select("id")
    .eq("batch_id", parsed.data.batchId)
    .eq("is_active", true);

  if (batchError) {
    return {
      error: "That batch could not be read. Try again.",
      sent: 0,
      failed: 0,
      skipped: 0,
      failures: [],
    };
  }

  const inBatch = new Set((batchStudents ?? []).map((student) => student.id));
  const selected = [...new Set(parsed.data.studentIds)].filter((id) =>
    inBatch.has(id),
  );

  if (selected.length === 0) {
    return {
      error: "None of the selected students are in this batch.",
      sent: 0,
      failed: 0,
      skipped: 0,
      failures: [],
    };
  }

  const outcomes = await mapWithConcurrency(
    selected,
    SEND_CONCURRENCY,
    async (studentId) => {
      const composed = await composeStudentDocumentEmail(
        studentId,
        "document_reminder",
        { requireActionNeeded: true },
      );

      if (!composed.ok) {
        // no_action_needed means the checklist moved while the review screen
        // was open. That is a skip, not a failure: the student is fine.
        const skipped = composed.reason === "no_action_needed";
        return {
          studentId,
          skipped,
          ok: false,
          message: messageFor(composed.reason),
        };
      }

      const result = await deliverComposedEmail({
        service: auth.service,
        email: composed.email,
        emailType: "document_reminder",
        idempotencyKey: `document_reminder:${parsed.data.sendGroupId}:${studentId}`,
        sendGroupId: parsed.data.sendGroupId,
        sentBy: auth.session.userId,
        sentByName: auth.sentByName,
      });

      return {
        studentId,
        skipped: Boolean(result.duplicate),
        ok: result.ok,
        message: result.error ?? "",
      };
    },
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const failures: BulkSendResult["failures"] = [];

  for (const outcome of outcomes) {
    if (outcome.skipped) {
      skipped += 1;
      continue;
    }
    if (outcome.ok) {
      sent += 1;
      continue;
    }
    failed += 1;
    failures.push({ studentId: outcome.studentId, message: outcome.message });
  }

  for (const studentId of selected) revalidateEmailViews(studentId);
  revalidatePath(`/students/batches/${parsed.data.batchId}/document-reminders`);

  return { error: null, sent, failed, skipped, failures };
}

/**
 * Run work over a list a few items at a time, keeping the results in order.
 *
 * Plain and local rather than a dependency. The one behaviour that matters is
 * that a rejected item cannot abandon the rest: deliverComposedEmail never
 * throws, so every student in the selection is attempted and every attempt ends
 * up in its own log row.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await work(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, runner),
  );

  return results;
}
