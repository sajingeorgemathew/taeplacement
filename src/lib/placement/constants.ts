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

/** Visual tone used by status pills and summary blocks. */
export type Tone = "info" | "ready" | "attention" | "neutral";

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
