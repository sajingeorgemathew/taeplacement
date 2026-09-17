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
  STUDENT_EMAIL_STATUS_GROUP_STATUSES,
  type StudentEmailStatus,
  type StudentEmailType,
} from "@/lib/placement/constants";
import { buildStudentSearchFilter } from "@/lib/students/queries";
import type { StudentEmailLogRow } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  EMAIL_ACTIVITY_STUDENT_MATCH_LIMIT,
  pageInfoFor,
  rangeForPage,
  resolveActivityStatuses,
  type EmailActivityFilters,
  type EmailActivityPageInfo,
} from "./email-activity";
import {
  buildDocumentEmailSnapshot,
  countActionNeeded,
  emailEntriesFrom,
  hasSendableContent,
  parseStoredSnapshot,
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

  return resolveSenderNames(supabase, data ?? []);
}

/** The shape resolveSenderNames needs, which both log readers satisfy. */
type SenderColumns = { sent_by: string | null; sent_by_name: string | null };

/**
 * Attach the sender's display name to a set of log rows.
 *
 * Shared by the student's Email History and by the Activity page so both answer
 * "who sent this" the same way, in the order of preference described above.
 *
 * One profile read for the whole set, and only for the rows that need it: on a
 * database where every row carries its frozen name, the profiles table is never
 * touched at all.
 */
async function resolveSenderNames<Row extends SenderColumns>(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rows: Row[],
): Promise<(Row & { sentByName: string | null })[]> {
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

// ---------------------------------------------------------------------------
// Email Activity
// ---------------------------------------------------------------------------

/**
 * One row of the Activity list.
 *
 * Everything operational about the send comes from the LOG ROW, never from
 * today's records: recipient_email is the address the message actually went to,
 * sent_by_name is who sent it at the time, and content_snapshot is what it
 * said. Only the two things a log row cannot know about itself are joined in,
 * and only so staff can read the list:
 *
 *   studentName   today's name, because it is the link to the student record
 *   batchName     today's batch, because that is how staff scan the list
 *
 * They are display context, not history. A student who moves batch appears
 * under their current batch, and the email they were sent is unchanged.
 */
export type EmailActivityItem = Omit<
  StudentEmailLogRow,
  "body_html" | "idempotency_key"
> & {
  sentByName: string | null;
  studentName: string;
  batchName: string | null;
  /**
   * How many items the stored snapshot asked the student to act on, or null
   * when the snapshot cannot be read. Never recounted from the checklist.
   */
  actionNeededCount: number | null;
};

/**
 * The columns the Activity list reads.
 *
 * body_html and idempotency_key are deliberately absent. The HTML body is the
 * largest column on the table and nothing renders it - the dialog shows the
 * structured snapshot and the exact plain text - so fetching fifty of them
 * would move megabytes to a browser to display none of it. The idempotency key
 * is a send-path implementation detail with no reader here.
 */
const ACTIVITY_SELECT = [
  "id",
  "student_id",
  "email_type",
  "recipient_email",
  "subject",
  "body_text",
  "content_snapshot",
  "resend_email_id",
  "status",
  "send_group_id",
  "sent_by",
  "sent_by_name",
  "sent_at",
  "delivered_at",
  "bounced_at",
  "failed_at",
  "complained_at",
  "last_provider_event_at",
  "error_message",
  "created_at",
  "updated_at",
  "student:students(id, first_name, middle_name, last_name, batch:batches(id, name))",
].join(", ");

type ActivityRow = Omit<StudentEmailLogRow, "body_html" | "idempotency_key"> & {
  student: {
    id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string | null;
    batch: { id: string; name: string } | null;
  } | null;
};

/**
 * Which students the filters restrict the log to.
 *
 * The search box asks one question across two tables - "this student, or this
 * recipient address" - and PostgREST cannot express an OR that spans a join. So
 * the roster is asked first, by the same five columns the Students page
 * searches, and the log is then filtered by the ids that came back OR by the
 * recipient address on the row itself.
 *
 * Two things about that roster read matter:
 *
 *   Inactive students are INCLUDED. A deactivated student's emails are part of
 *   the permanent record and must not vanish from Activity when their record is
 *   retired.
 *
 *   Ids only. No names and no addresses are carried around: this is a filter,
 *   not a result.
 */
type StudentScope = {
  /** Log rows must belong to one of these students. Null means no restriction. */
  requiredIds: string[] | null;
  /** The `or` filter matching the recipient address or a matching student. */
  searchFilter: string | null;
  /** True when the filters cannot match anything at all. */
  impossible: boolean;
};

async function resolveStudentScope(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  filters: EmailActivityFilters,
): Promise<StudentScope> {
  const scope: StudentScope = {
    requiredIds: null,
    searchFilter: null,
    impossible: false,
  };

  if (filters.batchId) {
    const { data, error } = await supabase
      .from("students")
      .select("id")
      .eq("batch_id", filters.batchId);

    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((student) => student.id);
    // A batch with no students cannot have been emailed. Saying so here also
    // keeps an empty `in.()` out of the query, which PostgREST would refuse.
    if (ids.length === 0) return { ...scope, impossible: true };
    scope.requiredIds = ids;
  }

  if (filters.search) {
    // Supabase `or` filters are comma separated, so anything that would change
    // the shape of the filter string is removed before it is used. The roster
    // read below sanitizes the same term again for itself.
    const clean = filters.search
      .replace(/[,()*%\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const studentFilter = buildStudentSearchFilter(filters.search);

    let matchedIds: string[] = [];
    if (studentFilter) {
      const { data, error } = await supabase
        .from("students")
        .select("id")
        .or(studentFilter)
        .limit(EMAIL_ACTIVITY_STUDENT_MATCH_LIMIT);

      if (error) throw new Error(error.message);
      matchedIds = (data ?? []).map((student) => student.id);
    }

    const conditions: string[] = [];
    if (clean) conditions.push(`recipient_email.ilike.%${clean}%`);
    if (matchedIds.length > 0) {
      conditions.push(`student_id.in.(${matchedIds.join(",")})`);
    }

    if (conditions.length === 0) return { ...scope, impossible: true };
    scope.searchFilter = conditions.join(",");
  }

  return scope;
}

/**
 * One filtered query over the email log.
 *
 * Every read on this page goes through here - the page of rows, and each of the
 * four counts above it - so a filter can never apply to the list and not to the
 * numbers describing it.
 *
 * The client is the ordinary authenticated server client, so Row Level Security
 * applies exactly as it does everywhere else: active staff may SELECT this
 * table and nothing more. The service role is not used here, and must not be.
 */
function activityQuery(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  select: string,
  options: { count?: "exact"; head?: boolean },
  filters: EmailActivityFilters,
  scope: StudentScope,
  statuses: readonly StudentEmailStatus[] | null,
) {
  let query = supabase.from("student_email_log").select(select, options);

  if (scope.requiredIds) query = query.in("student_id", scope.requiredIds);
  if (scope.searchFilter) query = query.or(scope.searchFilter);
  if (statuses) query = query.in("status", [...statuses]);
  if (filters.emailType) query = query.eq("email_type", filters.emailType);
  if (filters.since) query = query.gte("created_at", filters.since);

  return query;
}

export type EmailActivityResult = EmailActivityPageInfo & {
  items: EmailActivityItem[];
};

/**
 * One page of placement emails across every student, newest first.
 *
 * Ordered by created_at, which is the column the log is indexed on and the only
 * one that is never null: sent_at is still empty on a row whose send never
 * reached the provider, and a failed attempt has to appear at the moment it was
 * attempted rather than sink to the bottom of the list.
 */
export async function getEmailActivity(
  filters: EmailActivityFilters = {},
  requestedPage = 1,
): Promise<EmailActivityResult> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const statuses = resolveActivityStatuses(filters);
  const scope = await resolveStudentScope(supabase, filters);

  const empty = (): EmailActivityResult => ({ ...pageInfoFor(0, 1), items: [] });

  if (scope.impossible) return empty();
  if (statuses && statuses.length === 0) return empty();

  // Counted first, so a page number past the end of the result set can be
  // clamped to a page that exists rather than answered with a blank list.
  const { count, error: countError } = await activityQuery(
    supabase,
    "id",
    { count: "exact", head: true },
    filters,
    scope,
    statuses,
  );

  if (countError) throw new Error(countError.message);

  const total = count ?? 0;
  const info = pageInfoFor(total, requestedPage);
  if (total === 0) return { ...info, items: [] };

  const { from, to } = rangeForPage(info.page, info.pageSize);

  const { data, error } = await activityQuery(
    supabase,
    ACTIVITY_SELECT,
    {},
    filters,
    scope,
    statuses,
  )
    .order("created_at", { ascending: false })
    // A tiebreaker, so a bulk reminder that wrote twenty-seven rows in the same
    // millisecond cannot shuffle between two reads and show one student twice
    // across a page boundary while hiding another.
    .order("id", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as ActivityRow[];
  const withSenders = await resolveSenderNames(supabase, rows);

  const items: EmailActivityItem[] = withSenders.map((row) => {
    const { student, ...log } = row;
    const snapshot = parseStoredSnapshot(log.content_snapshot);

    return {
      ...log,
      studentName: student
        ? studentFullName(student)
        : // student_id is NOT NULL and the foreign key is `on delete restrict`,
          // so this is unreachable through the database. It is handled rather
          // than asserted away because a row whose student cannot be read
          // should still be listed: the email still happened.
          "Unknown student",
      batchName: student?.batch?.name ?? null,
      actionNeededCount: snapshot ? snapshot.action_needed.length : null,
    };
  });

  return { ...info, items };
}

export type EmailActivitySummary = {
  total: number;
  delivered: number;
  inProgress: number;
  needsAttention: number;
};

/**
 * The four counts above the list.
 *
 * They deliberately IGNORE the status and group filters and honour every other
 * one. That is what makes them usable as the quick filters: standing on Needs
 * Attention, a staff member can still see how many emails in the same search,
 * batch, type, and date scope were delivered, and click straight to them. The
 * page labels them as counts for that scope, so a number is never presented as
 * the total of something it is not.
 *
 * Four counting queries rather than one read of every row: a count is a
 * COUNT(*) that returns a number, where "select the status column and tally it
 * here" would pull a year of the log into memory to produce four numbers.
 */
export async function getEmailActivitySummary(
  filters: EmailActivityFilters = {},
): Promise<EmailActivitySummary> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const scope = await resolveStudentScope(supabase, filters);
  if (scope.impossible) {
    return { total: 0, delivered: 0, inProgress: 0, needsAttention: 0 };
  }

  const countFor = async (
    statuses: readonly StudentEmailStatus[] | null,
  ): Promise<number> => {
    const { count, error } = await activityQuery(
      supabase,
      "id",
      { count: "exact", head: true },
      filters,
      scope,
      statuses,
    );
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const [total, delivered, inProgress, needsAttention] = await Promise.all([
    countFor(null),
    countFor(STUDENT_EMAIL_STATUS_GROUP_STATUSES.delivered),
    countFor(STUDENT_EMAIL_STATUS_GROUP_STATUSES.in_progress),
    countFor(STUDENT_EMAIL_STATUS_GROUP_STATUSES.needs_attention),
  ]);

  return { total, delivered, inProgress, needsAttention };
}
