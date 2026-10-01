/**
 * The Batch Document Grid matrix. PLACEMENT-07B.1.
 *
 * Pure functions over rows the page has already read in bulk. Nothing here
 * touches the database, and nothing here changes a document, a readiness
 * total, a placement status, or a student. Viewing the grid mutates nothing.
 *
 * The matrix is
 *
 *   row      one student in the batch
 *   column   one ACTIVE placement document requirement, in Admin's sort_order
 *   cell     that student's student_placement_documents row for that
 *            requirement, or "Not Initialized" when no row exists yet
 *
 * ---------------------------------------------------------------------------
 * Three different pieces of text, and they are never mixed
 * ---------------------------------------------------------------------------
 *
 *   A. student_placement_documents.note
 *      INTERNAL staff note about ONE requirement for ONE student. Carried on
 *      the cell, shown and edited through the cell's note button.
 *
 *   B. student_placement_documents.student_message
 *      STUDENT FACING. Not read by this module, not carried on any cell, not
 *      shown anywhere on the grid, not editable from the grid. The cell type
 *      below has no field for it, so a wider row cannot leak it by accident.
 *
 *   C. student_notes
 *      General internal student history. The grid carries the LATEST note per
 *      student as a preview, and Add Note appends a new row. Nothing is ever
 *      overwritten.
 *
 * Readiness is the existing derived student_document_readiness view, passed
 * in as it was read. It is never recalculated from the cells.
 */

import type { DocumentReadiness } from "@/lib/documents/queries";
import {
  PLACEMENT_DOCUMENT_STATUS_LABELS,
  type ClassSession,
  type PlacementDocumentStatus,
  type PlacementStatus,
} from "@/lib/placement/constants";
import type { DocumentRequirementRow } from "@/lib/supabase/database.types";

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

/** The requirement columns. No description: the grid header has no room. */
export type GridRequirement = Pick<
  DocumentRequirementRow,
  "id" | "name" | "short_name" | "is_required" | "sort_order"
>;

/**
 * The five columns the grid reads from a checklist row, and the only five.
 * student_message is deliberately absent from this type.
 */
export type GridChecklistRow = {
  id: string;
  student_id: string;
  requirement_id: string;
  status: PlacementDocumentStatus;
  /** INTERNAL. Staff only. */
  note: string | null;
};

/** What the grid needs of a student. No contact or address fields. */
export type GridStudent = {
  id: string;
  student_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  is_returning: boolean;
  placement_status: PlacementStatus;
  class_session: ClassSession | null;
};

/** One student_notes row as the grid reads it. */
export type GridStudentNote = {
  id: string;
  student_id: string;
  body: string;
  created_at: string;
  created_by: string | null;
};

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

/**
 * One cell. A student either has a checklist row for the requirement or they
 * do not; the grid never pretends a missing row is Received, or anything else.
 */
export type GridDocumentCell =
  | {
      kind: "document";
      documentId: string;
      status: PlacementDocumentStatus;
      /** INTERNAL note. Null when none. */
      note: string | null;
    }
  | { kind: "missing" };

export const MISSING_CELL: GridDocumentCell = { kind: "missing" };

export const NOT_INITIALIZED_LABEL = "Not Initialized";

/** The latest general note for a student, for the General Notes preview. */
export type GridLatestNote = {
  id: string;
  body: string;
  created_at: string;
  author_name: string | null;
};

export type GridRow = {
  student: GridStudent;
  /** The existing derived readiness, or undefined when the view had no row. */
  readiness: DocumentReadiness | undefined;
  /** Keyed by requirement id. Every active requirement has an entry. */
  cells: Record<string, GridDocumentCell>;
  /** How many active requirements this student has no checklist row for. */
  missingCount: number;
  latestNote: GridLatestNote | null;
  noteCount: number;
};

export type BatchDocumentGrid = {
  /** Active requirements in display order. */
  columns: GridRequirement[];
  rows: GridRow[];
  /** Missing checklist rows across the whole grid, for the page notice. */
  missingCellCount: number;
  /** Students with at least one missing checklist row. */
  studentsMissingRows: number;
};

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/** Admin's configured order: sort_order, then name, the same as the checklist. */
export function sortGridRequirements<T extends GridRequirement>(
  requirements: readonly T[],
): T[] {
  return [...requirements].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  );
}

/** The column header. The short name where Admin set one, else the full name. */
export function requirementColumnLabel(requirement: GridRequirement): string {
  const short = requirement.short_name?.trim();
  return short && short.length > 0 ? short : requirement.name;
}

/**
 * The newest student_notes row per student.
 *
 * Decided by created_at, never by array order, so it does not matter whether
 * the read came back ascending, descending, or chunked.
 */
export function latestNotesByStudent(
  notes: readonly GridStudentNote[],
): Map<string, GridStudentNote> {
  const latest = new Map<string, GridStudentNote>();
  for (const note of notes) {
    const current = latest.get(note.student_id);
    if (!current || isNewer(note, current)) latest.set(note.student_id, note);
  }
  return latest;
}

function isNewer(candidate: GridStudentNote, current: GridStudentNote): boolean {
  const a = Date.parse(candidate.created_at);
  const b = Date.parse(current.created_at);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return candidate.created_at > current.created_at;
  }
  return a > b;
}

export function countNotesByStudent(
  notes: readonly GridStudentNote[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const note of notes) {
    counts.set(note.student_id, (counts.get(note.student_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Build the matrix in memory from the bulk reads.
 *
 *   students      the batch's students, already filtered and ordered
 *   requirements  active requirements (any order; sorted here)
 *   rows          checklist rows for those students. Rows for any other
 *                 student, or for an inactive requirement, are ignored.
 *   readiness     the derived readiness view, keyed by student id
 *   notes         student_notes rows for those students
 *   authorNames   profile names for note authors, keyed by user id
 */
export function buildBatchDocumentGrid(input: {
  students: readonly GridStudent[];
  requirements: readonly GridRequirement[];
  rows: readonly GridChecklistRow[];
  readiness: ReadonlyMap<string, DocumentReadiness>;
  notes: readonly GridStudentNote[];
  authorNames?: ReadonlyMap<string, string | null>;
}): BatchDocumentGrid {
  const columns = sortGridRequirements(input.requirements);
  const columnIds = new Set(columns.map((requirement) => requirement.id));
  const studentIds = new Set(input.students.map((student) => student.id));

  // studentId -> requirementId -> row
  const byStudent = new Map<string, Map<string, GridChecklistRow>>();
  for (const row of input.rows) {
    if (!studentIds.has(row.student_id)) continue;
    if (!columnIds.has(row.requirement_id)) continue;
    let perStudent = byStudent.get(row.student_id);
    if (!perStudent) {
      perStudent = new Map();
      byStudent.set(row.student_id, perStudent);
    }
    perStudent.set(row.requirement_id, row);
  }

  const latestNotes = latestNotesByStudent(
    input.notes.filter((note) => studentIds.has(note.student_id)),
  );
  const noteCounts = countNotesByStudent(
    input.notes.filter((note) => studentIds.has(note.student_id)),
  );

  let missingCellCount = 0;
  let studentsMissingRows = 0;

  const rows: GridRow[] = input.students.map((student) => {
    const perStudent = byStudent.get(student.id);
    const cells: Record<string, GridDocumentCell> = {};
    let missingCount = 0;

    for (const requirement of columns) {
      const row = perStudent?.get(requirement.id);
      if (!row) {
        cells[requirement.id] = MISSING_CELL;
        missingCount += 1;
        continue;
      }
      cells[requirement.id] = {
        kind: "document",
        documentId: row.id,
        status: row.status,
        note: row.note,
      };
    }

    missingCellCount += missingCount;
    if (missingCount > 0) studentsMissingRows += 1;

    const latest = latestNotes.get(student.id) ?? null;

    return {
      student,
      readiness: input.readiness.get(student.id),
      cells,
      missingCount,
      latestNote: latest
        ? {
            id: latest.id,
            body: latest.body,
            created_at: latest.created_at,
            author_name: latest.created_by
              ? (input.authorNames?.get(latest.created_by) ?? null)
              : null,
          }
        : null,
      noteCount: noteCounts.get(student.id) ?? 0,
    };
  });

  return { columns, rows, missingCellCount, studentsMissingRows };
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/** "Received", "Requested", ..., or "Not Initialized" for a missing row. */
export function documentCellLabel(cell: GridDocumentCell): string {
  if (cell.kind === "missing") return NOT_INITIALIZED_LABEL;
  return PLACEMENT_DOCUMENT_STATUS_LABELS[cell.status];
}

/**
 * The grid's own compact colour scale.
 *
 *   received      green
 *   requested     amber. Asked for, not here yet: attention, not alarm.
 *   needs_update  red. It arrived and something is wrong: strong attention.
 *   not_reviewed  neutral grey
 *   not_applicable  muted. Out of the way.
 *   missing       muted, dashed: not a status at all
 *
 * Requested and Needs Update are deliberately DIFFERENT colours here even
 * though the full checklist pill shows both in coral. Across fifty rows and
 * thirteen columns the difference between "we asked" and "it is wrong" is
 * exactly what a staff member is scanning for.
 */
export type GridCellTone =
  | "ready"
  | "warning"
  | "attention"
  | "neutral"
  | "muted"
  | "missing";

export const GRID_STATUS_TONES: Record<PlacementDocumentStatus, GridCellTone> = {
  received: "ready",
  requested: "warning",
  needs_update: "attention",
  not_reviewed: "neutral",
  not_applicable: "muted",
};

export function documentCellTone(cell: GridDocumentCell): GridCellTone {
  if (cell.kind === "missing") return "missing";
  return GRID_STATUS_TONES[cell.status];
}

/** A short preview of a general note for the cell. */
export const NOTE_PREVIEW_LENGTH = 90;

export function notePreview(body: string, max = NOTE_PREVIEW_LENGTH): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// The batch page view
// ---------------------------------------------------------------------------

/**
 * ?view=grid | ?view=cards. The Document Grid is the default: a missing,
 * empty, or unknown value opens it.
 */
export const BATCH_VIEWS = ["grid", "cards"] as const;
export type BatchView = (typeof BATCH_VIEWS)[number];

export const DEFAULT_BATCH_VIEW: BatchView = "grid";

export function batchViewFrom(value: string | string[] | undefined): BatchView {
  const single = Array.isArray(value) ? value[0] : value;
  return single === "cards" ? "cards" : DEFAULT_BATCH_VIEW;
}
