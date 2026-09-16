/**
 * Shared operational vocabulary for students, batches, and placement state.
 *
 * These lists match the CHECK constraints in supabase/migrations/. Keep this
 * file as the single place where the current codes and their labels live.
 *
 * Two placement vocabularies live here and they are NOT the same thing:
 * PLACEMENT_STATUSES is the high-level summary of a student's whole placement
 * requirement, and PLACEMENT_RECORD_STATUSES is the status of one placement
 * segment at one partner.
 */

export const STAFF_ROLES = ["admin", "placement_manager", "management"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  placement_manager: "Placement Manager",
  management: "Management",
};

export const PLACEMENT_STATUSES = [
  "needs_review",
  "documents_pending",
  "ready_for_placement",
  "placement_assigned",
  "placement_started",
  "placement_completed",
  "on_hold",
] as const;

export type PlacementStatus = (typeof PLACEMENT_STATUSES)[number];

export const PLACEMENT_STATUS_LABELS: Record<PlacementStatus, string> = {
  needs_review: "Needs Review",
  documents_pending: "Documents Pending",
  ready_for_placement: "Ready for Placement",
  placement_assigned: "Placement Assigned",
  placement_started: "On Placement",
  placement_completed: "Placement Completed",
  on_hold: "On Hold",
};

export const DOCUMENT_STATUSES = ["not_reviewed", "pending", "ready"] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  not_reviewed: "Not Reviewed",
  pending: "Pending",
  ready: "Ready",
};

/**
 * Detailed placement document checklist statuses.
 *
 * These live on student_placement_documents, one row per student per
 * requirement. students.document_status is the derived summary of them and only
 * ever holds not_reviewed / pending / ready.
 */
export const PLACEMENT_DOCUMENT_STATUSES = [
  "not_reviewed",
  "requested",
  "received",
  "needs_update",
  "not_applicable",
] as const;

export type PlacementDocumentStatus =
  (typeof PLACEMENT_DOCUMENT_STATUSES)[number];

export const PLACEMENT_DOCUMENT_STATUS_LABELS: Record<
  PlacementDocumentStatus,
  string
> = {
  not_reviewed: "Not Reviewed",
  requested: "Requested",
  received: "Received",
  needs_update: "Needs Update",
  not_applicable: "N/A",
};

/** Received and N/A both count as ready for the readiness total. */
export const READY_DOCUMENT_STATUSES: readonly PlacementDocumentStatus[] = [
  "received",
  "not_applicable",
];

export function isPlacementDocumentStatus(
  value: unknown,
): value is PlacementDocumentStatus {
  return (
    typeof value === "string" &&
    PLACEMENT_DOCUMENT_STATUSES.includes(value as PlacementDocumentStatus)
  );
}

export function isDocumentReady(status: PlacementDocumentStatus): boolean {
  return READY_DOCUMENT_STATUSES.includes(status);
}

/**
 * The only statuses Mark Remaining as Received may move.
 *
 * Nothing that carries a decision is listed. needs_update is a known problem a
 * staff member has to resolve deliberately, not_applicable is a judgement
 * already made, and received is done. Not Reviewed and Requested are the two
 * that simply mean "nobody has cleared this yet".
 */
export const BULK_RECEIVE_ELIGIBLE_STATUSES: readonly PlacementDocumentStatus[] =
  ["not_reviewed", "requested"];

export function isBulkReceiveEligible(
  status: PlacementDocumentStatus,
): boolean {
  return BULK_RECEIVE_ELIGIBLE_STATUSES.includes(status);
}

/**
 * Visual tone used by status pills and summary blocks.
 *
 * warning is the amber middle ground: something that is not a problem and not
 * finished either, such as a partner whose next intake is still ahead of us.
 */
export type Tone = "info" | "ready" | "attention" | "neutral" | "warning";

/**
 * Assigned and On Placement are deliberately DIFFERENT colours.
 *
 * They are the two states most easily confused on a board, and the difference
 * between them is the whole of this module: one student is waiting to start,
 * the other is at their partner right now. Blue reads as arranged, green as
 * happening.
 */
export const PLACEMENT_STATUS_TONES: Record<PlacementStatus, Tone> = {
  needs_review: "attention",
  documents_pending: "attention",
  ready_for_placement: "ready",
  placement_assigned: "info",
  placement_started: "ready",
  placement_completed: "ready",
  on_hold: "attention",
};

export const DOCUMENT_STATUS_TONES: Record<DocumentStatus, Tone> = {
  not_reviewed: "attention",
  pending: "info",
  ready: "ready",
};

/**
 * Green for ready, soft coral for anything the student still owes us, blue for
 * a requirement that simply does not apply, grey until someone looks at it.
 */
export const PLACEMENT_DOCUMENT_STATUS_TONES: Record<
  PlacementDocumentStatus,
  Tone
> = {
  not_reviewed: "neutral",
  requested: "attention",
  received: "ready",
  needs_update: "attention",
  not_applicable: "info",
};

/**
 * Students counted as "Students Needing Placement" on the Students page. This
 * is an early operational grouping, not a final placement metric.
 */
export const NEEDS_PLACEMENT_STATUSES: readonly PlacementStatus[] = [
  "needs_review",
  "documents_pending",
  "ready_for_placement",
];

/** Students counted as "Placement Ready". */
export const PLACEMENT_READY_STATUS: PlacementStatus = "ready_for_placement";

export const BATCH_STATUSES = ["active", "archived"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  active: "Active",
  archived: "Archived",
};

/** The only program the academy runs today. Kept as free text in the database. */
export const DEFAULT_PROGRAM = "PSW";
export const PROGRAM_OPTIONS = ["PSW"] as const;

export const DEFAULT_PROVINCE = "Ontario";

export const PROVINCE_OPTIONS = [
  "Ontario",
  "Alberta",
  "British Columbia",
  "Manitoba",
  "New Brunswick",
  "Newfoundland and Labrador",
  "Northwest Territories",
  "Nova Scotia",
  "Nunavut",
  "Prince Edward Island",
  "Quebec",
  "Saskatchewan",
  "Yukon",
] as const;

export function isPlacementStatus(value: unknown): value is PlacementStatus {
  return (
    typeof value === "string" &&
    PLACEMENT_STATUSES.includes(value as PlacementStatus)
  );
}

export function isDocumentStatus(value: unknown): value is DocumentStatus {
  return (
    typeof value === "string" &&
    DOCUMENT_STATUSES.includes(value as DocumentStatus)
  );
}

/**
 * Placement partner vocabulary.
 *
 * These match the CHECK constraint in
 * supabase/migrations/0004_placement_partners.sql.
 */
export const RELATIONSHIP_STATUSES = [
  "active",
  "prospect",
  "inactive",
  "archived",
] as const;

export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];

export const RELATIONSHIP_STATUS_LABELS: Record<RelationshipStatus, string> = {
  active: "Active",
  prospect: "Prospect",
  inactive: "Inactive",
  archived: "Archived",
};

/** Green for a working relationship, blue for a lead, coral for gone quiet. */
export const RELATIONSHIP_STATUS_TONES: Record<RelationshipStatus, Tone> = {
  active: "ready",
  prospect: "info",
  inactive: "attention",
  archived: "neutral",
};

export const DEFAULT_RELATIONSHIP_STATUS: RelationshipStatus = "active";

export function isRelationshipStatus(
  value: unknown,
): value is RelationshipStatus {
  return (
    typeof value === "string" &&
    RELATIONSHIP_STATUSES.includes(value as RelationshipStatus)
  );
}

/**
 * Partner placement availability.
 *
 * This is PARTNER level operational data: is this LTC accepting placements, and
 * if not now, when is their next intake. It is not capacity, not a slot count,
 * and not a student assignment. Those belong to PLACEMENT-04 and later.
 *
 * These match the CHECK constraint in
 * supabase/migrations/0005_partner_board_refinements.sql.
 */
export const AVAILABILITY_STATUSES = [
  "unknown",
  "available_now",
  "upcoming",
  "not_available",
] as const;

export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];

export const AVAILABILITY_STATUS_LABELS: Record<AvailabilityStatus, string> = {
  unknown: "Unknown",
  available_now: "Available Now",
  upcoming: "Upcoming Intake",
  not_available: "Not Available",
};

/**
 * Green when they are taking students, amber while an intake is still ahead,
 * soft coral when they are closed, grey until somebody actually checks.
 */
export const AVAILABILITY_STATUS_TONES: Record<AvailabilityStatus, Tone> = {
  unknown: "neutral",
  available_now: "ready",
  upcoming: "warning",
  not_available: "attention",
};

/** A partner nobody has verified yet is Unknown, never "available". */
export const DEFAULT_AVAILABILITY_STATUS: AvailabilityStatus = "unknown";

export function isAvailabilityStatus(
  value: unknown,
): value is AvailabilityStatus {
  return (
    typeof value === "string" &&
    AVAILABILITY_STATUSES.includes(value as AvailabilityStatus)
  );
}

/**
 * The controlled Area Board palette.
 *
 * Deliberately a fixed set of keys rather than a hex colour picker, so every
 * area stays readable against dark text and the board never turns into a
 * clash of arbitrary colours. These match the CHECK constraint on
 * placement_areas.color_key in 0005. The rendered classes live in
 * src/lib/partners/area-colors.ts.
 */
export const AREA_COLOR_KEYS = [
  "slate",
  "blue",
  "green",
  "amber",
  "purple",
  "coral",
  "teal",
  "indigo",
] as const;

export type AreaColorKey = (typeof AREA_COLOR_KEYS)[number];

export const AREA_COLOR_LABELS: Record<AreaColorKey, string> = {
  slate: "Slate",
  blue: "Blue",
  green: "Green",
  amber: "Amber",
  purple: "Purple",
  coral: "Coral",
  teal: "Teal",
  indigo: "Indigo",
};

/** Also the neutral treatment of the Unassigned column. */
export const DEFAULT_AREA_COLOR_KEY: AreaColorKey = "slate";

export function isAreaColorKey(value: unknown): value is AreaColorKey {
  return (
    typeof value === "string" &&
    AREA_COLOR_KEYS.includes(value as AreaColorKey)
  );
}

/**
 * Suggested partner types. Kept as free text in the database so an unexpected
 * kind of placement organization never needs a migration.
 */
export const PARTNER_TYPE_OPTIONS = [
  "Long Term Care",
  "Retirement Residence",
  "Hospital",
  "Community / Home Care",
  "Other",
] as const;

/**
 * The Area Board's first column. Unassigned is NOT a placement_areas row: a
 * partner is Unassigned when placement_partners.area_id IS NULL. Staff can
 * never rename, reorder, or remove it.
 */
export const UNASSIGNED_AREA_ID = "unassigned";
export const UNASSIGNED_AREA_LABEL = "Unassigned";

/**
 * Placement record vocabulary.
 *
 * This is the status of ONE student_placements row: one placement SEGMENT at
 * one partner. It is NOT the same thing as students.placement_status, which
 * stays the high-level summary of the student's whole placement requirement.
 *
 * The two completions are deliberately separate:
 *
 *   status = "completed"                    this segment finished
 *   placement_status = "placement_completed" the student's whole requirement
 *                                            finished
 *
 * A student may do part of their placement at one partner and the rest at
 * another, so one does not imply the other.
 *
 * These match the CHECK constraint in
 * supabase/migrations/0006_student_placements.sql.
 */
export const PLACEMENT_RECORD_STATUSES = [
  "assigned",
  "started",
  "completed",
  "ended_early",
  "cancelled",
] as const;

export type PlacementRecordStatus = (typeof PLACEMENT_RECORD_STATUSES)[number];

export const PLACEMENT_RECORD_STATUS_LABELS: Record<
  PlacementRecordStatus,
  string
> = {
  assigned: "Assigned",
  started: "Started",
  completed: "Completed",
  ended_early: "Ended Early",
  cancelled: "Cancelled",
};

/**
 * Blue for an assignment that is arranged, green for one that is happening or
 * finished properly, amber for one that ended early (a real placement, just not
 * a finished one), grey for an assignment that never meaningfully happened.
 */
export const PLACEMENT_RECORD_STATUS_TONES: Record<
  PlacementRecordStatus,
  Tone
> = {
  assigned: "info",
  started: "ready",
  completed: "ready",
  ended_early: "warning",
  cancelled: "neutral",
};

/**
 * The two ACTIVE placement record states. The database allows at most one row
 * per student in either of them, enforced by a partial unique index.
 *
 * They are not interchangeable to the interface. An assigned placement can be
 * started or cancelled; a started one can only be finished, because by then the
 * student has actually been there.
 */
export const ACTIVE_PLACEMENT_RECORD_STATUSES: readonly PlacementRecordStatus[] =
  ["assigned", "started"];

/** The three FINISHED states. They stay permanently visible as history. */
export const HISTORICAL_PLACEMENT_RECORD_STATUSES: readonly PlacementRecordStatus[] =
  ["completed", "ended_early", "cancelled"];

export function isActivePlacementRecordStatus(
  status: PlacementRecordStatus,
): boolean {
  return ACTIVE_PLACEMENT_RECORD_STATUSES.includes(status);
}

export function isPlacementRecordStatus(
  value: unknown,
): value is PlacementRecordStatus {
  return (
    typeof value === "string" &&
    PLACEMENT_RECORD_STATUSES.includes(value as PlacementRecordStatus)
  );
}

/**
 * The outcomes Finish Placement offers.
 *
 * Both of them describe a placement the student ACTUALLY PARTICIPATED IN. That
 * is what finishing means, and it is why cancellation is not on this list:
 *
 *   Cancel Assignment   the assignment never meaningfully started. Only ever
 *                       offered on an assigned placement, credits nothing, and
 *                       never asks about the placement requirement.
 *   Finish Placement    the student was here, and this segment is now ending.
 *
 * The distinction inside this list matters just as much. A student who worked
 * at a partner and then moved has NOT had a cancelled placement: they had a
 * real one that ended early, and their credited hours still count.
 */
export const PLACEMENT_OUTCOMES = ["completed", "ended_early"] as const;

export type PlacementOutcome = (typeof PLACEMENT_OUTCOMES)[number];

export const PLACEMENT_OUTCOME_LABELS: Record<PlacementOutcome, string> = {
  completed: "Completed at this Partner",
  ended_early: "Ended Early / Transferred",
};

export const PLACEMENT_OUTCOME_DESCRIPTIONS: Record<PlacementOutcome, string> = {
  completed:
    "The student finished this placement. Their hours here are credited.",
  ended_early:
    "The student really worked here, but the placement ended before it was finished. They may continue at another partner.",
};

export function isPlacementOutcome(value: unknown): value is PlacementOutcome {
  return (
    typeof value === "string" &&
    PLACEMENT_OUTCOMES.includes(value as PlacementOutcome)
  );
}

/**
 * Whether a placement segment counts towards the student's credited hours.
 *
 * Everything except a cancellation. The database nulls credited_hours on a
 * cancelled row anyway, so this is belt and braces, and it is also what stops a
 * cancelled row appearing in an hours total by accident.
 */
export function countsTowardCreditedHours(
  status: PlacementRecordStatus,
): boolean {
  return status !== "cancelled";
}

/**
 * The placement statuses a student may be moved out of automatically.
 *
 * Mirrors public.is_pre_placement_status() in 0006. A student in any OTHER
 * status has a real placement fact or a deliberate staff decision behind their
 * status, and a document change must never drag them backwards.
 */
export const PRE_PLACEMENT_STATUSES: readonly PlacementStatus[] = [
  "needs_review",
  "documents_pending",
  "ready_for_placement",
];

export function isPrePlacementStatus(status: PlacementStatus): boolean {
  return PRE_PLACEMENT_STATUSES.includes(status);
}

/**
 * not_reviewed -> needs_review, pending -> documents_pending,
 * ready -> ready_for_placement.
 *
 * Mirrors public.placement_status_for_documents() in 0006 so the interface can
 * SAY where a student would land. The database is what actually decides it, and
 * the 13-document rules behind document_status are never re-implemented here.
 */
export const DOCUMENT_TO_PLACEMENT_STATUS: Record<
  DocumentStatus,
  PlacementStatus
> = {
  not_reviewed: "needs_review",
  pending: "documents_pending",
  ready: "ready_for_placement",
};

/**
 * Student placement document email vocabulary.
 *
 * These match the CHECK constraints in
 * supabase/migrations/0008_student_document_email.sql.
 *
 * An email is an OBSERVATION about the checklist. Nothing in this section
 * changes a document status, a readiness total, or a placement status, and no
 * status change anywhere ever sends an email. Staff decide when to send.
 */

export const STUDENT_EMAIL_TYPES = [
  "document_status",
  "document_reminder",
] as const;

export type StudentEmailType = (typeof STUDENT_EMAIL_TYPES)[number];

export const STUDENT_EMAIL_TYPE_LABELS: Record<StudentEmailType, string> = {
  document_status: "Document Status Update",
  document_reminder: "Outstanding Document Reminder",
};

export function isStudentEmailType(value: unknown): value is StudentEmailType {
  return (
    typeof value === "string" &&
    STUDENT_EMAIL_TYPES.includes(value as StudentEmailType)
  );
}

/**
 * The local delivery status of one logged email.
 *
 * accepted is deliberately NOT "delivered". It means Resend took the API call
 * and nothing more. Only a provider webhook may say an email reached someone,
 * so the interface never promises delivery on the strength of a 200 response.
 */
export const STUDENT_EMAIL_STATUSES = [
  "pending",
  "accepted",
  "sent",
  "delivered",
  "delivery_delayed",
  "bounced",
  "failed",
  "complained",
] as const;

export type StudentEmailStatus = (typeof STUDENT_EMAIL_STATUSES)[number];

export const STUDENT_EMAIL_STATUS_LABELS: Record<StudentEmailStatus, string> = {
  pending: "Preparing",
  accepted: "Accepted by Resend",
  sent: "Sent",
  delivered: "Delivered",
  delivery_delayed: "Delivery Delayed",
  bounced: "Bounced",
  failed: "Failed",
  complained: "Marked as Spam",
};

/**
 * Grey while it is still only our word for it, green once the provider says the
 * message arrived, amber for a delay that may still resolve itself, coral for
 * the three outcomes a staff member has to do something about.
 */
export const STUDENT_EMAIL_STATUS_TONES: Record<StudentEmailStatus, Tone> = {
  pending: "neutral",
  accepted: "info",
  sent: "info",
  delivered: "ready",
  delivery_delayed: "warning",
  bounced: "attention",
  failed: "attention",
  complained: "attention",
};

/**
 * The statuses that count as "this student has already been emailed".
 *
 * accepted, sent, and delivered are all real sends: the message left the
 * building. delivery_delayed is one of them too, because a delayed message is
 * still on its way and emailing again would double it.
 *
 * pending is not, because it means an attempt that never reached the provider.
 * bounced, failed, and complained are not either: nothing arrived, so a second
 * attempt is not a duplicate. That is also why the duplicate WARNING is only
 * ever a warning and never a block.
 */
export const STUDENT_EMAIL_SENT_STATUSES: readonly StudentEmailStatus[] = [
  "accepted",
  "sent",
  "delivered",
  "delivery_delayed",
];

export function isStudentEmailSent(status: StudentEmailStatus): boolean {
  return STUDENT_EMAIL_SENT_STATUSES.includes(status);
}

export function isStudentEmailStatus(
  value: unknown,
): value is StudentEmailStatus {
  return (
    typeof value === "string" &&
    STUDENT_EMAIL_STATUSES.includes(value as StudentEmailStatus)
  );
}

/**
 * How the checklist is divided in a STUDENT FACING email.
 *
 * This is not the readiness split and it must never be confused with it.
 * READY_DOCUMENT_STATUSES counts not_applicable as ready, because a
 * requirement that does not apply cannot hold a student back. An email is a
 * different question: what should this student READ?
 *
 *   received        Completed. Tell them it is done.
 *   requested       Action Needed. We asked; it has not arrived.
 *   needs_update    Action Needed. It arrived and something is wrong with it.
 *   not_applicable  NOTHING. Omitted completely, name and all. A student who is
 *                   exempt from a requirement should not be handed a list that
 *                   says so, and "N/A" in an email reads as a problem.
 *   not_reviewed    NOTHING. It means nobody on staff has looked yet, which is
 *                   our state, not theirs. Printing it as outstanding would ask
 *                   a student to chase a document they may have already sent.
 *
 * The two omissions are the whole reason these lists exist separately.
 */
export const EMAIL_COMPLETED_STATUSES: readonly PlacementDocumentStatus[] = [
  "received",
];

export const EMAIL_ACTION_NEEDED_STATUSES: readonly PlacementDocumentStatus[] =
  ["requested", "needs_update"];

/** Never named, never counted, never hinted at in a student email. */
export const EMAIL_OMITTED_STATUSES: readonly PlacementDocumentStatus[] = [
  "not_applicable",
  "not_reviewed",
];

export function isEmailCompletedStatus(
  status: PlacementDocumentStatus,
): boolean {
  return EMAIL_COMPLETED_STATUSES.includes(status);
}

/**
 * True for the two statuses that make a student a BULK REMINDER recipient.
 *
 * A student with nothing in this state is not reminded. That excludes a fully
 * ready student, and it excludes a student whose requirements are all still
 * Not Reviewed, who would otherwise be chased for work staff have not looked at
 * yet.
 */
export function isEmailActionNeededStatus(
  status: PlacementDocumentStatus,
): boolean {
  return EMAIL_ACTION_NEEDED_STATUSES.includes(status);
}

export function isEmailOmittedStatus(
  status: PlacementDocumentStatus,
): boolean {
  return EMAIL_OMITTED_STATUSES.includes(status);
}

/** Within this window a second email to the same student is a duplicate risk. */
export const RECENT_EMAIL_WINDOW_HOURS = 24;
