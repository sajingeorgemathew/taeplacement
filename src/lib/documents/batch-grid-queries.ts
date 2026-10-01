/**
 * The bulk reads behind the Batch Document Grid. PLACEMENT-07B.1.
 *
 * For a batch of N students and R active requirements this is a FIXED number
 * of reads, never one per student and never one per cell:
 *
 *   1. the active requirement definitions
 *   2. the checklist rows of the given students, in slices of 200 ids
 *   3. the general student_notes of the given students, in the same slices
 *   4. the profile names of the note authors (one small read, only if any)
 *
 * The caller already holds the batch, the filtered students, and the derived
 * readiness map, so those are not read again here.
 *
 * Privacy: the checklist read selects id, student_id, requirement_id, status,
 * and the INTERNAL note. It does NOT select student_message, the student
 * facing text, so nothing built from this read can show it. The requirement
 * read selects no description.
 *
 * This is a read. It creates no checklist row, changes no status, and never
 * touches readiness or placement status.
 */

import { requireActiveStaff } from "@/lib/auth/session";
import { chunkIds } from "@/lib/planning/needs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import type {
  GridChecklistRow,
  GridRequirement,
  GridStudentNote,
} from "./batch-grid";

export type BatchGridRead = {
  requirements: GridRequirement[];
  rows: GridChecklistRow[];
  notes: GridStudentNote[];
  /** Profile names for note authors, keyed by user id. */
  authorNames: Map<string, string | null>;
};

export async function readBatchGridData(
  studentIds: readonly string[],
): Promise<BatchGridRead> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const requirementsRead = supabase
    .from("placement_document_requirements")
    .select("id, name, short_name, is_required, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const chunks = chunkIds(studentIds);

  const rowReads = chunks.map((chunk) =>
    supabase
      .from("student_placement_documents")
      .select("id, student_id, requirement_id, status, note")
      .in("student_id", chunk),
  );

  const noteReads = chunks.map((chunk) =>
    supabase
      .from("student_notes")
      .select("id, student_id, body, created_at, created_by")
      .in("student_id", chunk)
      .order("created_at", { ascending: false }),
  );

  const [requirementsResult, rowResults, noteResults] = await Promise.all([
    requirementsRead,
    Promise.all(rowReads),
    Promise.all(noteReads),
  ]);

  if (requirementsResult.error) throw new Error(requirementsResult.error.message);

  const rows: GridChecklistRow[] = [];
  for (const result of rowResults) {
    if (result.error) throw new Error(result.error.message);
    for (const row of result.data ?? []) {
      rows.push({
        id: row.id,
        student_id: row.student_id,
        requirement_id: row.requirement_id,
        status: row.status,
        note: row.note,
      });
    }
  }

  const notes: GridStudentNote[] = [];
  for (const result of noteResults) {
    if (result.error) throw new Error(result.error.message);
    for (const note of result.data ?? []) {
      notes.push({
        id: note.id,
        student_id: note.student_id,
        body: note.body,
        created_at: note.created_at,
        created_by: note.created_by,
      });
    }
  }

  // created_by points at auth.users, so the display name comes from profiles
  // in one small read, the same way listStudentNotes does it.
  const authorIds = [
    ...new Set(
      notes
        .map((note) => note.created_by)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const authorNames = new Map<string, string | null>();
  if (authorIds.length > 0) {
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", authorIds);

    if (error) throw new Error(error.message);
    for (const profile of profiles ?? []) {
      authorNames.set(profile.id, profile.full_name);
    }
  }

  return {
    requirements: (requirementsResult.data ?? []) as GridRequirement[],
    rows,
    notes,
    authorNames,
  };
}
