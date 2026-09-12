/**
 * Hand written database types for the PLACEMENT-01 schema.
 *
 * Keep this file in step with supabase/migrations/. It is deliberately small:
 * only the tables this application actually reads and writes.
 */

import type {
  DocumentStatus,
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

export type Database = {
  public: {
    Tables: {
      profiles: TableShape<ProfileRow, never, Partial<ProfileRow>>;
      batches: TableShape<BatchRow, BatchInsert, BatchUpdate>;
      students: TableShape<StudentRow, StudentInsert, StudentUpdate>;
      student_notes: TableShape<StudentNoteRow, StudentNoteInsert, never>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
