/**
 * Reads for the placement document email workflow.
 *
 * Everything a send needs is re-read HERE, on the server, at the moment it is
 * needed. Nothing is trusted from the browser except which student and which
 * batch: not the recipient address, not the checklist, not the readiness, and
 * not the rendered body. A preview a staff member left open for twenty minutes
 * while a colleague marked a police check Received must not be able to email
 * the old list.
 *
 * The 13-document rules are never re-implemented. Readiness comes from the same
 * student_document_readiness view the checklist page uses, and the checklist
 * comes from getStudentChecklist().
 */

import { requireActiveStaff } from "@/lib/auth/session";
import { normalizeEmail } from "@/lib/email/address";
import { studentFullName } from "@/lib/format";
import {
  isEmailActionNeededStatus,
  RECENT_EMAIL_WINDOW_HOURS,
  STUDENT_EMAIL_SENT_STATUSES,
  type StudentEmailType,
} from "@/lib/placement/constants";
import type { StudentEmailLogRow } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  buildDocumentEmailSnapshot,
  countActionNeeded,
  emailEntriesFrom,
  hasSendableContent,
  type DocumentEmailSnapshot,
  type EmailReadinessSummary,
} from "./email-content";
import { renderDocumentEmail, type RenderedEmail } from "./email-template";
import { getStudentChecklist, getStudentReadiness } from "./queries";

const MS_PER_HOUR = 3_600_000;

/** The cutoff for "this student was emailed recently". */
export function recentEmailCutoff(now: Date = new Date()): string {
  return new Date(
    now.getTime() - RECENT_EMAIL_WINDOW_HOURS * MS_PER_HOUR,
  ).toISOString();
}

// ---------------------------------------------------------------------------
// Composing one student's email
// ---------------------------------------------------------------------------

export type ComposedEmail = {
  studentId: string;
  studentName: string;
  recipientEmail: string;
  snapshot: DocumentEmailSnapshot;
  rendered: RenderedEmail;
  /** How many items the student is being asked to act on. */
  actionNeededCount: number;
};

export type ComposeFailure =
  | "not_found"
  | "no_email"
  | "nothing_to_send"
  | "no_action_needed";

export type ComposeResult =
  | { ok: true; email: ComposedEmail }
  | { ok: false; reason: ComposeFailure };

/**
 * Build one student's email from the CURRENT checklist.
 *
 * Used by the preview, by the individual send, and by every row of a bulk
 * reminder, so the message a staff member approves is produced by the same code
 * that produces the message that is sent.
 *
 * requireActionNeeded is what makes a reminder a reminder. A fully ready
 * student may receive a status email on purpose, but they are never reminded of
 * nothing.
 */
export async function composeStudentDocumentEmail(
  studentId: string,
  sendType: StudentEmailType,
  options: { requireActionNeeded?: boolean; generatedAt?: Date } = {},
): Promise<ComposeResult> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data: student, error } = await supabase
    .from("students")
    .select("*, batch:batches(id, name)")
    .eq("id", studentId)
    .maybeSingle();

  if (error || !student) return { ok: false, reason: "not_found" };

  const recipientEmail = normalizeEmail(student.email);
  if (!recipientEmail) return { ok: false, reason: "no_email" };

  const [items, readiness] = await Promise.all([
    getStudentChecklist(student.id),
    getStudentReadiness(student.id),
  ]);

  // emailEntriesFrom cannot see document.note: its parameter type has no such
  // field. The internal note is not filtered out here, it is unreachable.
  const entries = emailEntriesFrom(items);
  const actionNeededCount = countActionNeeded(entries);

  if (options.requireActionNeeded && actionNeededCount === 0) {
    return { ok: false, reason: "no_action_needed" };
  }

  const batch = (student as { batch?: { name?: string | null } | null }).batch;

  const snapshot = buildDocumentEmailSnapshot({
    student: {
      id: student.id,
      student_number: student.student_number,
      first_name: student.first_name,
      full_name: studentFullName(student),
      batch_name: batch?.name ?? null,
    },
    recipientEmail,
    entries,
    readiness: readinessSummary(readiness),
    sendType,
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
  });

  if (!hasSendableContent(snapshot)) {
    return { ok: false, reason: "nothing_to_send" };
  }

  return {
    ok: true,
    email: {
      studentId: student.id,
      studentName: snapshot.student.full_name,
      recipientEmail,
      snapshot,
      rendered: renderDocumentEmail(snapshot),
      actionNeededCount,
    },
  };
}

function readinessSummary(readiness: {
  requiredTotal: number;
  requiredReady: number;
  activeTotal: number;
  activeReady: number;
  percent: number;
  isReady: boolean;
}): EmailReadinessSummary {
  return {
    required_total: readiness.requiredTotal,
    required_ready: readiness.requiredReady,
    active_total: readiness.activeTotal,
    active_ready: readiness.activeReady,
    percent: readiness.percent,
    is_ready: readiness.isReady,
  };
}

// ---------------------------------------------------------------------------
// Email history
// ---------------------------------------------------------------------------

export type StudentEmailHistoryItem = StudentEmailLogRow & {
  /** Who sent it. The frozen name wins; see below. */
  sentByName: string | null;
};

/**
 * Every placement email ever sent to one student, newest first.
 *
 * Read from the log rows themselves. Nothing here consults today's checklist,
 * so an email that said "Police Check - Requested" in April still says that
 * after the police check arrives in June.
 *
 * The sender's name is resolved the same way, and in that order of preference:
 *
 *   sent_by_name   the name frozen onto the row at send time. Preferred, and
 *                  the reason a staff member who has since left the academy is
 *                  still credited with the email they actually sent.
 *   profiles       a live lookup, used ONLY for rows that have no frozen name,
 *                  which means rows written before sent_by_name existed.
 *
 * The live lookup is not a fallback for "the profile was deleted": sent_by is
 * `on delete set null`, so a removed profile leaves nothing to look up. That is
 * exactly the case the frozen name exists to answer.
 */
export async function listStudentEmailHistory(
  studentId: string,
): Promise<StudentEmailHistoryItem[]> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("student_email_log")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = data ?? [];

  // Only rows with no frozen name need a profile read at all, so on a database
  // where every row has one this query never runs.
  const senderIds = [
    ...new Set(
      rows
        .filter((row) => !row.sent_by_name)
        .map((row) => row.sent_by)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const names = new Map<string, string | null>();
  if (senderIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", senderIds);

    if (profileError) throw new Error(profileError.message);
    for (const profile of profiles ?? []) names.set(profile.id, profile.full_name);
  }

  return rows.map((row) => ({
    ...row,
    sentByName:
      row.sent_by_name ??
      (row.sent_by ? (names.get(row.sent_by) ?? null) : null),
  }));
}

/**
 * The most recent REAL send to one student inside the duplicate window.
 *
 * Only the statuses that mean a message actually left the building count. A
 * failed attempt is not a duplicate risk, and neither is a bounce: nothing
 * arrived, so sending again is the right thing to do rather than a mistake.
 */
export async function getRecentEmailSend(
  studentId: string,
  now: Date = new Date(),
): Promise<StudentEmailLogRow | null> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("student_email_log")
    .select("*")
    .eq("student_id", studentId)
    .in("status", [...STUDENT_EMAIL_SENT_STATUSES])
    .gte("sent_at", recentEmailCutoff(now))
    .order("sent_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Batch reminder review
// ---------------------------------------------------------------------------

/** One student on the batch reminder review screen. */
export type ReminderCandidate = {
  studentId: string;
  studentName: string;
  studentNumber: string;
  /** Normalized. Null when this student cannot be emailed at all. */
  recipientEmail: string | null;
  actionNeededCount: number;
  /** True when at least one requirement is Requested or Needs Update. */
  isEligible: boolean;
  /** When they were last really emailed, inside the 24 hour window. */
  lastEmailedAt: string | null;
};

export type BatchReminderReview = {
  batchId: string;
  candidates: ReminderCandidate[];
  /** Eligible, has an email, and was not emailed in the last 24 hours. */
  readyCount: number;
  /** Eligible but has no usable email address. */
  noEmailCount: number;
  /** Eligible, emailable, and already emailed inside the window. */
  recentlyEmailedCount: number;
};

/**
 * Who in one batch needs reminding, and who is deliberately left out.
 *
 * Batch scoped, always. There is no roster-wide send in this feature and there
 * must not be one: a blind "email everyone" button is one misclick away from
 * writing to every student the academy has ever had.
 *
 * Eligibility is exactly the email rule, not the readiness rule:
 *
 *   at least one ACTIVE requirement Requested or Needs Update  -> eligible
 *   everything Received or N/A                                 -> not eligible
 *   everything still Not Reviewed                              -> not eligible
 *
 * The last one is the one that matters. Not Reviewed means staff have not
 * looked yet, so reminding that student would chase them for work that may
 * already be sitting in the LMS.
 *
 * Five reads, not one per student: the roster, the active requirement list, the
 * checklist rows, and the recent sends all come back in bulk and are joined in
 * memory.
 */
export async function getBatchReminderReview(
  batchId: string,
  now: Date = new Date(),
): Promise<BatchReminderReview> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const [studentsResult, requirementsResult] = await Promise.all([
    supabase
      .from("students")
      .select("id, student_number, first_name, middle_name, last_name, email")
      .eq("batch_id", batchId)
      .eq("is_active", true)
      .order("last_name", { ascending: true, nullsFirst: false })
      .order("first_name", { ascending: true }),
    supabase
      .from("placement_document_requirements")
      .select("id")
      .eq("is_active", true),
  ]);

  if (studentsResult.error) throw new Error(studentsResult.error.message);
  if (requirementsResult.error) throw new Error(requirementsResult.error.message);

  const students = studentsResult.data ?? [];
  const activeRequirementIds = new Set(
    (requirementsResult.data ?? []).map((requirement) => requirement.id),
  );

  if (students.length === 0) {
    return {
      batchId,
      candidates: [],
      readyCount: 0,
      noEmailCount: 0,
      recentlyEmailedCount: 0,
    };
  }

  const studentIds = students.map((student) => student.id);

  const [documentsResult, recentResult] = await Promise.all([
    supabase
      .from("student_placement_documents")
      .select("student_id, requirement_id, status")
      .in("student_id", studentIds),
    supabase
      .from("student_email_log")
      .select("student_id, sent_at")
      .in("student_id", studentIds)
      .in("status", [...STUDENT_EMAIL_SENT_STATUSES])
      .gte("sent_at", recentEmailCutoff(now))
      .order("sent_at", { ascending: false }),
  ]);

  if (documentsResult.error) throw new Error(documentsResult.error.message);
  if (recentResult.error) throw new Error(recentResult.error.message);

  // Only ACTIVE requirements count. An archived requirement still has rows on
  // every student who had it, and reminding somebody about a requirement the
  // academy has retired would be asking for a document nobody wants.
  const actionCounts = new Map<string, number>();
  for (const row of documentsResult.data ?? []) {
    if (!activeRequirementIds.has(row.requirement_id)) continue;
    if (!isEmailActionNeededStatus(row.status)) continue;
    actionCounts.set(row.student_id, (actionCounts.get(row.student_id) ?? 0) + 1);
  }

  // Ordered newest first above, so the first row per student is the latest.
  const lastEmailed = new Map<string, string>();
  for (const row of recentResult.data ?? []) {
    if (!row.sent_at) continue;
    if (!lastEmailed.has(row.student_id)) {
      lastEmailed.set(row.student_id, row.sent_at);
    }
  }

  const candidates: ReminderCandidate[] = students.map((student) => {
    const actionNeededCount = actionCounts.get(student.id) ?? 0;
    return {
      studentId: student.id,
      studentName: studentFullName(student),
      studentNumber: student.student_number,
      recipientEmail: normalizeEmail(student.email),
      actionNeededCount,
      isEligible: actionNeededCount > 0,
      lastEmailedAt: lastEmailed.get(student.id) ?? null,
    };
  });

  let readyCount = 0;
  let noEmailCount = 0;
  let recentlyEmailedCount = 0;

  for (const candidate of candidates) {
    if (!candidate.isEligible) continue;
    if (!candidate.recipientEmail) {
      noEmailCount += 1;
      continue;
    }
    if (candidate.lastEmailedAt) {
      recentlyEmailedCount += 1;
      continue;
    }
    readyCount += 1;
  }

  return {
    batchId,
    candidates,
    readyCount,
    noEmailCount,
    recentlyEmailedCount,
  };
}
