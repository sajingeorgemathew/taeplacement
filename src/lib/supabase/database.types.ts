/**
 * Hand written database types for the PLACEMENT-01 to PLACEMENT-06A.2 schema.
 *
 * Keep this file in step with supabase/migrations/. It is deliberately small:
 * only the tables this application actually reads and writes.
 *
 * student_placement_documents still has file_path, original_file_name,
 * mime_type, and file_size_bytes in the database. 0003 deprecated them when
 * per-requirement uploads were replaced by the single merged Final Placement
 * Package, so they are deliberately absent here: the application must not read
 * or write them.
 */

import type {
  AreaColorKey,
  AvailabilityStatus,
  DocumentStatus,
  PlacementDocumentStatus,
  PlacementRecordStatus,
  PlacementStatus,
  RelationshipStatus,
  StaffRole,
  StudentEmailStatus,
  StudentEmailType,
} from "@/lib/placement/constants";

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type ProfileRow = Timestamps & {
  id: string;
  full_name: string | null;
  role: StaffRole;
  is_active: boolean;
};

export type BatchRow = Timestamps & {
  id: string;
  name: string;
  program: string;
  start_date: string | null;
  schedule_label: string | null;
  status: "active" | "archived";
  sort_order: number | null;
};

export type StudentRow = Timestamps & {
  id: string;
  student_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  program: string;
  batch_id: string | null;
  phone: string | null;
  email: string | null;
  address_line: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  is_returning: boolean;
  placement_status: PlacementStatus;
  document_status: DocumentStatus;
  /** Short optional reason the student is On Hold. Null when not on hold. */
  placement_hold_reason: string | null;
  placement_hold_at: string | null;
  is_active: boolean;
  migration_source: string | null;
};

export type StudentNoteRow = Timestamps & {
  id: string;
  student_id: string;
  body: string;
  created_by: string | null;
};

export type DocumentRequirementRow = Timestamps & {
  id: string;
  name: string;
  short_name: string | null;
  description: string | null;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
};

export type StudentDocumentRow = Timestamps & {
  id: string;
  student_id: string;
  requirement_id: string;
  status: PlacementDocumentStatus;
  requested_by: string | null;
  requested_at: string | null;
  received_by: string | null;
  received_at: string | null;
  updated_by: string | null;
  /**
   * INTERNAL. Staff only. Never leaves the application and is never placed in
   * an email to a student.
   */
  note: string | null;
  /**
   * STUDENT FACING. A short staff-written line that may be included in a
   * placement document email. Deliberately a different column from note, and
   * nothing is ever copied between the two.
   */
  student_message: string | null;
};

/**
 * The one merged PDF an admin uploads per student.
 *
 * Separate from the checklist on purpose: the 13 requirements are a readiness
 * checklist and store no files.
 */
export type StudentPackageRow = {
  id: string;
  student_id: string;
  file_path: string;
  original_file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
  updated_at: string;
};

/** Derived view. Never written to. */
export type DocumentReadinessRow = {
  student_id: string;
  required_total: number;
  active_total: number;
  required_ready: number;
  active_ready: number;
  reviewed_count: number;
};

/**
 * Configurable operational area. Admin only.
 *
 * Unassigned is deliberately absent: it is placement_partners.area_id IS NULL,
 * never a row here.
 */
export type PlacementAreaRow = Timestamps & {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  /** Controlled Area Board colour. The board never colours by array position. */
  color_key: AreaColorKey;
  is_active: boolean;
};

export type PlacementPartnerRow = Timestamps & {
  id: string;
  name: string;
  partner_type: string | null;
  main_phone: string | null;
  website: string | null;
  address_line: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  /** null means Unassigned. */
  area_id: string | null;
  relationship_status: RelationshipStatus;
  legacy_zoho_account_id: string | null;
  legacy_owner_name: string | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  /**
   * Operational placement availability. Partner level, not a student
   * assignment and not capacity.
   */
  availability_status: AvailabilityStatus;
  /** A DATE ("2026-10-20"), because an intake is a day, not a moment. */
  next_intake_date: string | null;
  availability_note: string | null;
  availability_checked_at: string | null;
  is_active: boolean;
};

/** One partner may have many contacts. Archived, never deleted. */
export type PartnerContactRow = Timestamps & {
  id: string;
  partner_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  is_primary: boolean;
  legacy_zoho_contact_id: string | null;
  legacy_owner_name: string | null;
  is_active: boolean;
};

export type PartnerNoteRow = Timestamps & {
  id: string;
  partner_id: string;
  body: string;
  created_by: string | null;
};

/**
 * One normalized student city mapped to one operational placement area.
 *
 * The bridge between students.city and placement_areas. There is deliberately
 * no area_id on a student: their Area is always derived through this table, so
 * re-mapping a city rewrites no student record and correcting one student's
 * city disturbs nobody else's Area.
 *
 * Unmapped is the ABSENCE of a row here, never a placeholder row and never a
 * fake area.
 */
export type PlacementAreaCityRow = Timestamps & {
  id: string;
  area_id: string;
  /** Readable label, for example "Mississauga". Never written to a student. */
  city_name: string;
  /** Trimmed, whitespace collapsed, lowercased. Unique across the table. */
  normalized_city_name: string;
};

/**
 * One Student <-> Placement Partner placement.
 *
 * A student may have many rows over time and none is ever deleted. The database
 * allows at most ONE row per student in an active status (assigned or started),
 * enforced by a partial unique index rather than by application convention.
 *
 * status here is the status of THIS placement SEGMENT. It is not the student's
 * overall placement requirement: that is students.placement_status, a separate
 * high-level summary kept in step by triggers in 0006. A student may complete
 * one segment, end another early, and only then be placement_completed.
 */
export type StudentPlacementRow = Timestamps & {
  id: string;
  student_id: string;
  partner_id: string;
  status: PlacementRecordStatus;
  assigned_at: string;
  assigned_by: string | null;
  /** DATE values ("2026-04-27"), because a placement day must not shift. */
  planned_start_date: string | null;
  planned_end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  assignment_note: string | null;
  /** The final hours staff accept for THIS segment. Not a timesheet. */
  credited_hours: number | null;
  completion_note: string | null;
  /** Only ever set on ended_early. A cancellation uses cancellation_reason. */
  end_reason: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
};

/**
 * One outbound placement document email to one student.
 *
 * The permanent business record of what the academy sent. A bulk reminder to 27
 * students is 27 rows, each with its own subject, body, snapshot, provider id,
 * and delivery status; send_group_id records only that they went out together.
 *
 * content_snapshot holds the structured content used AT SEND TIME, so the Email
 * History never rebuilds an old email from today's checklist. It contains no
 * internal notes. See DocumentEmailSnapshot in src/lib/documents/email-content.ts
 * for its shape.
 */
export type StudentEmailLogRow = Timestamps & {
  id: string;
  student_id: string;
  email_type: StudentEmailType;
  /** The address actually used, normalized, as it was at send time. */
  recipient_email: string;
  subject: string;
  body_text: string;
  body_html: string;
  content_snapshot: unknown;
  /** Null until Resend accepts the send. */
  resend_email_id: string | null;
  status: StudentEmailStatus;
  idempotency_key: string;
  /** Shared by one bulk reminder. Null for an individual send. */
  send_group_id: string | null;
  /** Live profile reference. Nulled if that staff profile is ever removed. */
  sent_by: string | null;
  /**
   * The sender's display name, frozen at send time.
   *
   * Snapshotted like the body and the content, so "who told this student their
   * police check was missing" stays answerable after that person has left and
   * sent_by has gone null. Never recomputed from today's profiles.
   */
  sent_by_name: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  failed_at: string | null;
  complained_at: string | null;
  last_provider_event_at: string | null;
  /** Safe message only. Never a provider secret or raw payload. */
  error_message: string | null;
};

type TableShape<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type BatchInsert = Omit<BatchRow, "id" | "created_at" | "updated_at"> &
  Partial<Pick<BatchRow, "id">>;
export type BatchUpdate = Partial<BatchInsert>;

/** The hold columns default to null, so no caller has to send them. */
export type StudentInsert = Omit<
  StudentRow,
  "id" | "created_at" | "updated_at" | "placement_hold_reason" | "placement_hold_at"
> &
  Partial<
    Pick<StudentRow, "id" | "placement_hold_reason" | "placement_hold_at">
  >;
export type StudentUpdate = Partial<StudentInsert>;

export type StudentNoteInsert = Omit<
  StudentNoteRow,
  "id" | "created_at" | "updated_at"
> &
  Partial<Pick<StudentNoteRow, "id">>;

export type DocumentRequirementInsert = Omit<
  DocumentRequirementRow,
  "id" | "created_at" | "updated_at"
> &
  Partial<Pick<DocumentRequirementRow, "id">>;
export type DocumentRequirementUpdate = Partial<DocumentRequirementInsert>;

export type StudentDocumentInsert = Omit<
  StudentDocumentRow,
  "id" | "created_at" | "updated_at"
> &
  Partial<Pick<StudentDocumentRow, "id">>;
export type StudentDocumentUpdate = Partial<StudentDocumentInsert>;

export type StudentPackageInsert = Omit<
  StudentPackageRow,
  "id" | "uploaded_at" | "updated_at"
> &
  Partial<Pick<StudentPackageRow, "id" | "uploaded_at">>;
export type StudentPackageUpdate = Partial<StudentPackageInsert>;

export type PlacementAreaInsert = Omit<
  PlacementAreaRow,
  "id" | "created_at" | "updated_at"
> &
  Partial<Pick<PlacementAreaRow, "id">>;
export type PlacementAreaUpdate = Partial<PlacementAreaInsert>;

export type PlacementPartnerInsert = Omit<
  PlacementPartnerRow,
  "id" | "created_at" | "updated_at"
> &
  Partial<Pick<PlacementPartnerRow, "id">>;
export type PlacementPartnerUpdate = Partial<PlacementPartnerInsert>;

export type PartnerContactInsert = Omit<
  PartnerContactRow,
  "id" | "created_at" | "updated_at"
> &
  Partial<Pick<PartnerContactRow, "id">>;
export type PartnerContactUpdate = Partial<PartnerContactInsert>;

export type PartnerNoteInsert = Omit<
  PartnerNoteRow,
  "id" | "created_at" | "updated_at"
> &
  Partial<Pick<PartnerNoteRow, "id">>;

export type PlacementAreaCityInsert = Omit<
  PlacementAreaCityRow,
  "id" | "created_at" | "updated_at"
> &
  Partial<Pick<PlacementAreaCityRow, "id">>;
export type PlacementAreaCityUpdate = Partial<PlacementAreaCityInsert>;

/**
 * Everything the provider fills in later defaults to null, so creating the
 * pending row before the Resend call sends only what the application knows.
 */
export type StudentEmailLogInsert = Omit<
  StudentEmailLogRow,
  | "id"
  | "created_at"
  | "updated_at"
  | "resend_email_id"
  | "status"
  | "send_group_id"
  | "sent_by"
  | "sent_by_name"
  | "sent_at"
  | "delivered_at"
  | "bounced_at"
  | "failed_at"
  | "complained_at"
  | "last_provider_event_at"
  | "error_message"
> &
  Partial<
    Pick<
      StudentEmailLogRow,
      | "id"
      | "resend_email_id"
      | "status"
      | "send_group_id"
      | "sent_by"
      | "sent_by_name"
      | "sent_at"
      | "delivered_at"
      | "bounced_at"
      | "failed_at"
      | "complained_at"
      | "last_provider_event_at"
      | "error_message"
    >
  >;
export type StudentEmailLogUpdate = Partial<StudentEmailLogInsert>;

/**
 * The one row of Academy-wide placement email settings.
 *
 * A singleton: id is always 1, enforced by a CHECK in
 * supabase/migrations/0009_placement_email_settings.sql. Read by any active
 * staff member, updated only by an admin, never inserted or deleted from the
 * application. See PlacementEmailSettings in
 * src/lib/documents/email-settings.ts for the application-side shape.
 */
export type PlacementEmailSettingsRow = {
  id: number;
  opening_message_enabled: boolean;
  /** STUDENT FACING. Trimmed, at most 600 characters. Blank means no message. */
  opening_message: string;
  updated_at: string;
  updated_by: string | null;
};

/** Only the two settings and who saved them. The id and updated_at never move. */
export type PlacementEmailSettingsUpdate = Partial<
  Pick<
    PlacementEmailSettingsRow,
    "opening_message_enabled" | "opening_message" | "updated_by"
  >
>;

export type StudentPlacementInsert = Omit<
  StudentPlacementRow,
  "id" | "created_at" | "updated_at" | "assigned_at"
> &
  Partial<Pick<StudentPlacementRow, "id" | "assigned_at">>;
export type StudentPlacementUpdate = Partial<StudentPlacementInsert>;

export type Database = {
  public: {
    Tables: {
      profiles: TableShape<ProfileRow, never, Partial<ProfileRow>>;
      batches: TableShape<BatchRow, BatchInsert, BatchUpdate>;
      students: TableShape<StudentRow, StudentInsert, StudentUpdate>;
      student_notes: TableShape<StudentNoteRow, StudentNoteInsert, never>;
      placement_document_requirements: TableShape<
        DocumentRequirementRow,
        DocumentRequirementInsert,
        DocumentRequirementUpdate
      >;
      student_placement_documents: TableShape<
        StudentDocumentRow,
        StudentDocumentInsert,
        StudentDocumentUpdate
      >;
      student_placement_packages: TableShape<
        StudentPackageRow,
        StudentPackageInsert,
        StudentPackageUpdate
      >;
      placement_areas: TableShape<
        PlacementAreaRow,
        PlacementAreaInsert,
        PlacementAreaUpdate
      >;
      placement_partners: TableShape<
        PlacementPartnerRow,
        PlacementPartnerInsert,
        PlacementPartnerUpdate
      >;
      placement_partner_contacts: TableShape<
        PartnerContactRow,
        PartnerContactInsert,
        PartnerContactUpdate
      >;
      placement_partner_notes: TableShape<
        PartnerNoteRow,
        PartnerNoteInsert,
        never
      >;
      placement_area_cities: TableShape<
        PlacementAreaCityRow,
        PlacementAreaCityInsert,
        PlacementAreaCityUpdate
      >;
      student_placements: TableShape<
        StudentPlacementRow,
        StudentPlacementInsert,
        StudentPlacementUpdate
      >;
      student_email_log: TableShape<
        StudentEmailLogRow,
        StudentEmailLogInsert,
        StudentEmailLogUpdate
      >;
      placement_email_settings: TableShape<
        PlacementEmailSettingsRow,
        never,
        PlacementEmailSettingsUpdate
      >;
    };
    Views: {
      student_document_readiness: TableShape<
        DocumentReadinessRow,
        never,
        never
      >;
    };
    Functions: {
      initialize_student_placement_documents: {
        Args: { p_student_id: string };
        Returns: number;
      };
      initialize_all_placement_documents: {
        Args: Record<string, never>;
        Returns: number;
      };
      /**
       * Takes a student off hold and back to whatever the facts say: their
       * live placement record if they still have one, otherwise their current
       * document readiness. Never blindly "Ready".
       */
      release_student_placement_hold: {
        Args: { p_student_id: string };
        Returns: string | null;
      };
      /**
       * Ends ONE placement segment and moves the student to the right place:
       * placement_completed when this finishes their whole requirement,
       * otherwise back to their document-derived pre-placement status so
       * another placement can be assigned at another partner.
       */
      finish_student_placement: {
        Args: {
          p_placement_id: string;
          p_status: "completed" | "ended_early" | "cancelled";
          p_actual_end_date: string | null;
          p_credited_hours: number | null;
          p_completion_note: string | null;
          p_end_reason: string | null;
          p_completes_requirement: boolean;
        };
        Returns: string | null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
