/**
 * Shared operational vocabulary for students, batches, and placement state.
 *
 * These lists match the CHECK constraints in supabase/migrations/. Placement
 * stages will get richer in a later Placement ticket, so keep this file as the
 * single place where the current codes and their labels live.
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
  placement_started: "Placement Started",
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
 * Visual tone used by status pills and summary blocks.
 *
 * warning is the amber middle ground: something that is not a problem and not
 * finished either, such as a partner whose next intake is still ahead of us.
 */
export type Tone = "info" | "ready" | "attention" | "neutral" | "warning";

export const PLACEMENT_STATUS_TONES: Record<PlacementStatus, Tone> = {
  needs_review: "attention",
  documents_pending: "attention",
  ready_for_placement: "ready",
  placement_assigned: "info",
  placement_started: "info",
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
