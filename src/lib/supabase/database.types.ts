/**
 * Hand written database types for the PLACEMENT-01 and PLACEMENT-02 schema.
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
  DocumentStatus,
  PlacementDocumentStatus,
  PlacementStatus,
  StaffRole,
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
  note: string | null;
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

type TableShape<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type BatchInsert = Omit<BatchRow, "id" | "created_at" | "updated_at"> &
  Partial<Pick<BatchRow, "id">>;
export type BatchUpdate = Partial<BatchInsert>;

export type StudentInsert = Omit<StudentRow, "id" | "created_at" | "updated_at"> &
  Partial<Pick<StudentRow, "id">>;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
