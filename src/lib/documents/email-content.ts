/**
 * What goes into a student placement document email, and what never does.
 *
 * This module is PURE. No database, no session, no environment, no provider.
 * That is deliberate: the inclusion rules are the part of this feature where a
 * mistake is not a bug but a privacy incident, so they live somewhere that can
 * be read end to end and exercised by a plain script.
 *
 * ---------------------------------------------------------------------------
 * The one rule this file exists to enforce
 * ---------------------------------------------------------------------------
 *
 * student_placement_documents has two free text columns and they are not
 * interchangeable:
 *
 *   note             INTERNAL. Staff only. Never emailed.
 *   student_message  STUDENT FACING. Written on purpose, for the student.
 *
 * The internal note is not omitted here by a filter that someone could later
 * relax. It is absent from EmailChecklistEntry entirely, and the function that
 * builds those entries cannot see it: its parameter type has no `note` on it,
 * so a future caller that tries to pass one does not compile.
 *
 * ---------------------------------------------------------------------------
 * The five statuses
 * ---------------------------------------------------------------------------
 *
 *   received        -> Completed, with its student message if there is one
 *   requested       -> Action Needed, with its student message if there is one
 *   needs_update    -> Action Needed, with its student message if there is one
 *   not_applicable  -> nothing. Not named, not counted, not hinted at
 *   not_reviewed    -> nothing. Staff have not looked yet; that is our state
 *
 * The two omissions are total. A not_applicable requirement's student message
 * is dropped with the requirement, because a message attached to a row the
 * student is not told about can only confuse them.
 */

import {
  isEmailActionNeededStatus,
  isEmailCompletedStatus,
  PLACEMENT_DOCUMENT_STATUS_LABELS,
  type PlacementDocumentStatus,
  type StudentEmailType,
} from "@/lib/placement/constants";

/** The current state of the snapshot format. Stored with every log row. */
export const EMAIL_SNAPSHOT_VERSION = 1;

/**
 * One checklist row, reduced to the four things an email may know about it.
 *
 * There is no `note` here and there must never be one.
 */
export type EmailChecklistEntry = {
  requirementId: string;
  name: string;
  status: PlacementDocumentStatus;
  studentMessage: string | null;
};

/** One requirement as it appears in a sent email and in its stored snapshot. */
export type EmailRequirementLine = {
  requirement_id: string;
  name: string;
  /** Only ever one of the three statuses a student is told about. */
  status: "received" | "requested" | "needs_update";
  status_label: string;
  student_message: string | null;
};

/** The readiness figures as they stood when the email was built. */
export type EmailReadinessSummary = {
  required_total: number;
  required_ready: number;
  active_total: number;
  active_ready: number;
  percent: number;
  is_ready: boolean;
};

/**
 * Exactly what the system used to build one email.
 *
 * Stored in student_email_log.content_snapshot so the Email History is read
 * from the past rather than rebuilt from the present. A student whose police
 * check was Requested in April and Received in June must still see April's
 * email saying Requested.
 *
 * It holds no internal notes, no file names, no storage paths, and no staff
 * audit metadata.
 */
export type DocumentEmailSnapshot = {
  version: number;
  send_type: StudentEmailType;
  /** When the content was built, not when the provider accepted it. */
  generated_at: string;
  student: {
    id: string;
    student_number: string;
    first_name: string;
    full_name: string;
    /** The normalized address the email was addressed to. */
    recipient_email: string;
    batch_name: string | null;
  };
  readiness: EmailReadinessSummary;
  completed: EmailRequirementLine[];
  action_needed: EmailRequirementLine[];
  /**
   * How many requirements were left out, and why.
   *
   * Counts only, and only for STAFF reading the history later. Nothing here is
   * ever rendered into the email itself: the whole point of omitting a
   * not_applicable requirement is that the student never learns it existed.
   */
  omitted: {
    not_applicable: number;
    not_reviewed: number;
  };
};

/**
 * The student identity an email needs.
 *
 * A plain shape rather than StudentRow, so this module stays independent of the
 * database types and of anything that reads a session.
 */
export type EmailStudent = {
  id: string;
  student_number: string;
  first_name: string;
  full_name: string;
  batch_name: string | null;
};

/**
 * Turn checklist rows into email entries.
 *
 * The parameter type is the narrowest thing that works, and that is the point:
 * it can see a requirement's name and a document's status and student_message,
 * and it cannot see anything else on either row. `note` is not merely unused
 * here, it is unreachable.
 */
export function emailEntriesFrom(
  items: readonly {
    requirement: { id: string; name: string };
    document: {
      status: PlacementDocumentStatus;
      student_message?: string | null;
    };
  }[],
): EmailChecklistEntry[] {
  return items.map((item) => ({
    requirementId: item.requirement.id,
    name: item.requirement.name,
    status: item.document.status,
    studentMessage: tidyMessage(item.document.student_message),
  }));
}

/** Blank, whitespace, and undefined all mean "no message". */
function tidyMessage(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function lineFor(
  entry: EmailChecklistEntry,
  status: EmailRequirementLine["status"],
): EmailRequirementLine {
  return {
    requirement_id: entry.requirementId,
    name: entry.name,
    status,
    status_label: PLACEMENT_DOCUMENT_STATUS_LABELS[status],
    student_message: entry.studentMessage,
  };
}

/** The requirements a student is told are done. */
export function completedLines(
  entries: readonly EmailChecklistEntry[],
): EmailRequirementLine[] {
  return entries
    .filter((entry) => isEmailCompletedStatus(entry.status))
    .map((entry) => lineFor(entry, "received"));
}

/**
 * The requirements a student is asked to act on.
 *
 * requested and needs_update only. This is also the definition of "needs
 * attention" everywhere else in the feature, including bulk reminder
 * eligibility, so a student can never be reminded about something an email
 * would not have listed.
 */
export function actionNeededLines(
  entries: readonly EmailChecklistEntry[],
): EmailRequirementLine[] {
  return entries
    .filter((entry) => isEmailActionNeededStatus(entry.status))
    .map((entry) =>
      lineFor(
        entry,
        entry.status === "needs_update" ? "needs_update" : "requested",
      ),
    );
}

/** How many items this student would be asked to act on. */
export function countActionNeeded(
  entries: readonly EmailChecklistEntry[],
): number {
  return entries.filter((entry) => isEmailActionNeededStatus(entry.status))
    .length;
}

/**
 * Whether this student belongs in a BULK REMINDER.
 *
 * A fully ready student is not reminded: there is nothing to remind them of. A
 * student whose requirements are all still Not Reviewed is not reminded either,
 * and that is the important one. Not Reviewed means nobody on staff has looked
 * yet, so chasing them would ask for documents they may have already sent.
 */
export function isReminderEligible(
  entries: readonly EmailChecklistEntry[],
): boolean {
  return countActionNeeded(entries) > 0;
}

/**
 * Build the snapshot for one student.
 *
 * generatedAt is passed in rather than read from the clock, so the same inputs
 * always produce the same snapshot and a test can assert on it.
 */
export function buildDocumentEmailSnapshot(input: {
  student: EmailStudent;
  recipientEmail: string;
  entries: readonly EmailChecklistEntry[];
  readiness: EmailReadinessSummary;
  sendType: StudentEmailType;
  generatedAt: string;
}): DocumentEmailSnapshot {
  const { entries } = input;

  return {
    version: EMAIL_SNAPSHOT_VERSION,
    send_type: input.sendType,
    generated_at: input.generatedAt,
    student: {
      id: input.student.id,
      student_number: input.student.student_number,
      first_name: input.student.first_name,
      full_name: input.student.full_name,
      recipient_email: input.recipientEmail,
      batch_name: input.student.batch_name,
    },
    readiness: input.readiness,
    completed: completedLines(entries),
    action_needed: actionNeededLines(entries),
    omitted: {
      not_applicable: entries.filter(
        (entry) => entry.status === "not_applicable",
      ).length,
      not_reviewed: entries.filter((entry) => entry.status === "not_reviewed")
        .length,
    },
  };
}

/**
 * Whether there is anything worth sending.
 *
 * An email with no Completed section and no Action Needed section says nothing
 * at all. That happens when every requirement is still Not Reviewed, or when
 * every one of them is N/A, and in both cases the honest answer is to review
 * the checklist rather than to send the student a blank letter.
 *
 * A fully ready student DOES have sendable content: their Completed section is
 * the message, and telling somebody their documents are done is a useful thing
 * to send.
 */
export function hasSendableContent(snapshot: DocumentEmailSnapshot): boolean {
  return snapshot.completed.length > 0 || snapshot.action_needed.length > 0;
}

/** The plain sentence the interface shows when there is nothing to send. */
export const NOTHING_TO_SEND_MESSAGE =
  "This student has no reviewed requirements yet, so there is nothing to tell them. Review the checklist first.";

/**
 * Re-read a stored snapshot.
 *
 * Old rows are read back exactly as they were written, so this only checks that
 * the value has the shape the history UI needs. Nothing is recomputed and no
 * missing field is filled in from today's data: a snapshot that cannot be read
 * is shown as unavailable rather than quietly replaced by a fresh one.
 */
export function parseStoredSnapshot(
  value: unknown,
): DocumentEmailSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<DocumentEmailSnapshot>;
  if (!snapshot.student || !Array.isArray(snapshot.completed)) return null;
  if (!Array.isArray(snapshot.action_needed)) return null;
  return snapshot as DocumentEmailSnapshot;
}
