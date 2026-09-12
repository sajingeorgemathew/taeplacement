import { requireActiveStaff } from "@/lib/auth/session";
import {
  NEEDS_PLACEMENT_STATUSES,
  PLACEMENT_READY_STATUS,
  type DocumentStatus,
  type PlacementStatus,
} from "@/lib/placement/constants";
import type {
  BatchRow,
  StudentNoteRow,
  StudentRow,
} from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type BatchSummary = Pick<
  BatchRow,
  "id" | "name" | "program" | "start_date"
>;

export type StudentListItem = StudentRow & {
  batch: BatchSummary | null;
};

export type StudentNote = StudentNoteRow & {
  author_name: string | null;
};

export type StudentFilters = {
  search?: string;
  batchId?: string;
  placementStatus?: PlacementStatus;
  documentStatus?: DocumentStatus;
  returning?: "yes" | "no";
};

const STUDENT_SELECT =
  "*, batch:batches(id, name, program, start_date)";

/**
 * Supabase `or` filters are comma separated, so anything that would change the
 * shape of the filter string is removed before it is used.
 */
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();
}

function buildSearchFilter(term: string): string | null {
  const clean = sanitizeSearchTerm(term);
  if (!clean) return null;

  const conditions = [
    `first_name.ilike.%${clean}%`,
    `last_name.ilike.%${clean}%`,
    `middle_name.ilike.%${clean}%`,
    `student_number.ilike.%${clean}%`,
    `email.ilike.%${clean}%`,
  ];

  // "first last" should also match across the two name columns.
  const tokens = clean.split(" ").filter(Boolean);
  if (tokens.length > 1) {
    for (const token of tokens) {
      conditions.push(`first_name.ilike.%${token}%`);
      conditions.push(`last_name.ilike.%${token}%`);
    }
  }

  return conditions.join(",");
}

/** All batches, newest intake first, archived batches included. */
export async function listBatches(): Promise<BatchRow[]> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("batches")
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("start_date", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getBatch(batchId: string): Promise<BatchRow | null> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? null;
}

/** Active students, optionally filtered, ordered by name. */
export async function listStudents(
  filters: StudentFilters = {},
): Promise<StudentListItem[]> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("students")
    .select(STUDENT_SELECT)
    .eq("is_active", true);

  if (filters.batchId) query = query.eq("batch_id", filters.batchId);
  if (filters.placementStatus) {
    query = query.eq("placement_status", filters.placementStatus);
  }
  if (filters.documentStatus) {
    query = query.eq("document_status", filters.documentStatus);
  }
  if (filters.returning) {
    query = query.eq("is_returning", filters.returning === "yes");
  }
  if (filters.search) {
    const searchFilter = buildSearchFilter(filters.search);
    if (searchFilter) query = query.or(searchFilter);
  }

  const { data, error } = await query
    .order("last_name", { ascending: true, nullsFirst: false })
    .order("first_name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StudentListItem[];
}

export async function getStudent(
  studentId: string,
): Promise<StudentListItem | null> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("students")
    .select(STUDENT_SELECT)
    .eq("id", studentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as unknown as StudentListItem | null;
}

type CountRow = Pick<
  StudentRow,
  "batch_id" | "placement_status" | "document_status" | "is_returning"
>;

export type StudentCounts = {
  total: number;
  needingPlacement: number;
  placementReady: number;
  returning: number;
  unassignedBatch: number;
  byBatch: Map<
    string,
    { total: number; needingPlacement: number; placementReady: number }
  >;
};

/**
 * One small read that powers every live count on the Students page. The roster
 * is a few hundred rows, so counting in one pass is cheaper than many separate
 * count queries.
 */
export async function getStudentCounts(): Promise<StudentCounts> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("students")
    .select("batch_id, placement_status, document_status, is_returning")
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as CountRow[];
  const counts: StudentCounts = {
    total: rows.length,
    needingPlacement: 0,
    placementReady: 0,
    returning: 0,
    unassignedBatch: 0,
    byBatch: new Map(),
  };

  for (const row of rows) {
    const needsPlacement = NEEDS_PLACEMENT_STATUSES.includes(
      row.placement_status,
    );
    const isReady = row.placement_status === PLACEMENT_READY_STATUS;

    if (needsPlacement) counts.needingPlacement += 1;
    if (isReady) counts.placementReady += 1;
    if (row.is_returning) counts.returning += 1;

    if (!row.batch_id) {
      counts.unassignedBatch += 1;
      continue;
    }

    const batch = counts.byBatch.get(row.batch_id) ?? {
      total: 0,
      needingPlacement: 0,
      placementReady: 0,
    };
    batch.total += 1;
    if (needsPlacement) batch.needingPlacement += 1;
    if (isReady) batch.placementReady += 1;
    counts.byBatch.set(row.batch_id, batch);
  }

  return counts;
}

/** Internal notes for one student, newest first, with the staff author name. */
export async function listStudentNotes(
  studentId: string,
): Promise<StudentNote[]> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("student_notes")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const notes = data ?? [];
  const authorIds = [
    ...new Set(notes.map((note) => note.created_by).filter((id): id is string => Boolean(id))),
  ];

  // created_by points at auth.users, so the display name is read from profiles
  // in a second small query rather than through a join.
  const names = new Map<string, string | null>();
  if (authorIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", authorIds);

    if (profileError) throw new Error(profileError.message);
    for (const profile of profiles ?? []) {
      names.set(profile.id, profile.full_name);
    }
  }

  return notes.map((note) => ({
    ...note,
    author_name: note.created_by ? (names.get(note.created_by) ?? null) : null,
  }));
}

export async function countStudentNotes(studentId: string): Promise<number> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { count, error } = await supabase
    .from("student_notes")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId);

  if (error) throw new Error(error.message);
  return count ?? 0;
}
