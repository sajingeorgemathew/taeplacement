/**
 * Reads for the Placement Board, Find Placement, and the placement sections on
 * the student and partner pages.
 *
 * Document readiness is never recomputed here. It comes from the
 * student_document_readiness view through @/lib/documents/queries, which is the
 * one definition of "X of Y ready" the whole application shares.
 */

import { requireActiveStaff } from "@/lib/auth/session";
import {
  listStudentReadiness,
  type DocumentReadiness,
} from "@/lib/documents/queries";
import type {
  DocumentStatus,
  PlacementRecordStatus,
  PlacementStatus,
  Program,
} from "@/lib/placement/constants";
import { ACTIVE_PLACEMENT_RECORD_STATUSES } from "@/lib/placement/constants";
import {
  isTrackedStudent,
  isTrackedStudentRow,
  type OperationalBatchShape,
} from "@/lib/placement/operations";
import type {
  PartnerContactRow,
  PlacementAreaRow,
  PlacementPartnerRow,
  StudentPlacementRow,
} from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StudentListItem } from "@/lib/students/queries";

const AREA_SELECT =
  "id, name, description, sort_order, color_key, is_active, created_at, updated_at";

const PLACEMENT_SELECT = `*, partner:placement_partners(*, area:placement_areas(${AREA_SELECT}))`;

/** A partner as a placement record carries it: the record plus its area. */
export type PlacementPartnerSummary = PlacementPartnerRow & {
  area: PlacementAreaRow | null;
};

/** One placement record with the partner it points at. */
export type StudentPlacement = StudentPlacementRow & {
  partner: PlacementPartnerSummary | null;
  assignedByName: string | null;
};

/**
 * A student as the Placement Board and List View see them: the record, their
 * batch, their derived document readiness, their live placement if they have
 * one, and how many comments are already on them.
 */
export type PlacementBoardStudent = StudentListItem & {
  readiness: DocumentReadiness | undefined;
  currentPlacement: StudentPlacement | null;
  noteCount: number;
};

export type PlacementFilters = {
  /** Student name, student number, or partner name. */
  search?: string;
  /** Matches students.program exactly. */
  program?: Program;
  batchId?: string;
  placementStatus?: PlacementStatus;
  documentStatus?: DocumentStatus;
  /** An area id. Matches through the student's current placement partner. */
  areaId?: string;
  partnerId?: string;
  /**
   * Only students in CURRENT placement operations: active, in a batch, and
   * that batch active with tracking on. The same population the dashboard
   * counts, through the same rule (isTrackedStudentRow). The Placement page
   * sets this by default; Show All Students leaves it off and the list is
   * every active student.
   */
  currentOperations?: boolean;
};

const STUDENT_SELECT =
  "*, batch:batches(id, name, program, start_date, status, placement_tracking_enabled)";

/**
 * Supabase `or` filters are comma separated, so anything that would change the
 * shape of the filter string is removed before it is used.
 */
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();
}

function toStudentPlacement(
  row: StudentPlacementRow & { partner?: PlacementPartnerSummary | null },
  names: Map<string, string | null>,
): StudentPlacement {
  return {
    ...row,
    partner: row.partner ?? null,
    assignedByName: row.assigned_by
      ? (names.get(row.assigned_by) ?? null)
      : null,
  };
}

/** Staff display names for a set of profile ids, in one small query. */
async function readStaffNames(
  ids: (string | null)[],
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return names;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);

  if (error) throw new Error(error.message);
  for (const profile of data ?? []) names.set(profile.id, profile.full_name);
  return names;
}

/** Comment count per student id, read in one pass for a whole board. */
async function readStudentNoteCounts(): Promise<Map<string, number>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("student_notes")
    .select("student_id");

  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.student_id, (counts.get(row.student_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Every live placement record, keyed by student id.
 *
 * At most one per student: the partial unique index in 0006 is what guarantees
 * that, so this map never has to choose between two.
 */
async function readActivePlacements(): Promise<Map<string, StudentPlacement>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("student_placements")
    .select(PLACEMENT_SELECT)
    .in("status", [...ACTIVE_PLACEMENT_RECORD_STATUSES]);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as (StudentPlacementRow & {
    partner: PlacementPartnerSummary | null;
  })[];
  const names = await readStaffNames(rows.map((row) => row.assigned_by));

  const byStudent = new Map<string, StudentPlacement>();
  for (const row of rows) {
    byStudent.set(row.student_id, toStudentPlacement(row, names));
  }
  return byStudent;
}

/**
 * The working set behind both Placement views.
 *
 * The roster is a few hundred active students, so everything is read in a
 * handful of queries and grouped in memory rather than running one query per
 * board column.
 */
export async function listPlacementStudents(
  filters: PlacementFilters = {},
): Promise<PlacementBoardStudent[]> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const [placements, readiness, noteCounts] = await Promise.all([
    readActivePlacements(),
    listStudentReadiness(),
    readStudentNoteCounts(),
  ]);

  let query = supabase
    .from("students")
    .select(STUDENT_SELECT)
    .eq("is_active", true);

  if (filters.program) query = query.eq("program", filters.program);
  if (filters.batchId) query = query.eq("batch_id", filters.batchId);
  if (filters.placementStatus) {
    query = query.eq("placement_status", filters.placementStatus);
  }
  if (filters.documentStatus) {
    query = query.eq("document_status", filters.documentStatus);
  }

  const term = filters.search ? sanitizeSearchTerm(filters.search) : "";
  if (term) {
    // A partner name is a legitimate way to look for a student, so the ids of
    // students placed at a matching partner join the student's own columns in
    // one `or`.
    const studentIdsAtPartner = [...placements.values()]
      .filter((placement) =>
        placement.partner?.name.toLowerCase().includes(term.toLowerCase()),
      )
      .map((placement) => placement.student_id);

    const conditions = [
      `first_name.ilike.%${term}%`,
      `last_name.ilike.%${term}%`,
      `middle_name.ilike.%${term}%`,
      `student_number.ilike.%${term}%`,
    ];
    const tokens = term.split(" ").filter(Boolean);
    if (tokens.length > 1) {
      for (const token of tokens) {
        conditions.push(`first_name.ilike.%${token}%`);
        conditions.push(`last_name.ilike.%${token}%`);
      }
    }
    if (studentIdsAtPartner.length > 0) {
      conditions.push(`id.in.(${studentIdsAtPartner.join(",")})`);
    }
    query = query.or(conditions.join(","));
  }

  const { data, error } = await query
    .order("last_name", { ascending: true, nullsFirst: false })
    .order("first_name", { ascending: true });

  if (error) throw new Error(error.message);

  const students = (data ?? []) as unknown as StudentListItem[];

  let rows: PlacementBoardStudent[] = students.map((student) => ({
    ...student,
    readiness: readiness.get(student.id),
    currentPlacement: placements.get(student.id) ?? null,
    noteCount: noteCounts.get(student.id) ?? 0,
  }));

  // Current operations is a property of the student's BATCH, which arrives on
  // the joined row, so it is applied here through the one shared rule rather
  // than restated as a query condition.
  if (filters.currentOperations) {
    rows = rows.filter((row) => isTrackedStudentRow(row));
  }

  // Partner and area both describe the student's CURRENT placement, so they are
  // applied to the joined rows rather than to the students query.
  if (filters.partnerId) {
    rows = rows.filter(
      (row) => row.currentPlacement?.partner_id === filters.partnerId,
    );
  }
  if (filters.areaId) {
    rows = rows.filter(
      (row) => row.currentPlacement?.partner?.area_id === filters.areaId,
    );
  }

  return rows;
}

/** The student's live placement, or null when they have none. */
export async function getCurrentPlacement(
  studentId: string,
): Promise<StudentPlacement | null> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("student_placements")
    .select(PLACEMENT_SELECT)
    .eq("student_id", studentId)
    .in("status", [...ACTIVE_PLACEMENT_RECORD_STATUSES])
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as StudentPlacementRow & {
    partner: PlacementPartnerSummary | null;
  };
  const names = await readStaffNames([row.assigned_by]);
  return toStudentPlacement(row, names);
}

/**
 * Every placement this student has ever had, newest first.
 *
 * Completed, ended early, and cancelled rows are history and are always
 * included. Nothing is ever removed from this list: a student who did 120 hours
 * at one partner and finished the rest at another has two real records, and
 * both of them matter.
 */
export async function listStudentPlacements(
  studentId: string,
): Promise<StudentPlacement[]> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("student_placements")
    .select(PLACEMENT_SELECT)
    .eq("student_id", studentId)
    .order("assigned_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as (StudentPlacementRow & {
    partner: PlacementPartnerSummary | null;
  })[];
  const names = await readStaffNames(rows.map((row) => row.assigned_by));
  return rows.map((row) => toStudentPlacement(row, names));
}

/** A placement record as the partner page sees it: who the student is. */
export type PartnerPlacement = StudentPlacementRow & {
  student: (StudentListItem & { readiness?: DocumentReadiness }) | null;
  assignedByName: string | null;
};

export type PartnerPlacements = {
  /** status assigned or started. */
  current: PartnerPlacement[];
  /** status completed, ended_early, or cancelled. */
  history: PartnerPlacement[];
};

/**
 * Students placed at one partner.
 *
 * This is what replaces the Current Placements placeholder from PLACEMENT-03.
 * It is a list of real relationships, not a check-in log: PLACEMENT-05 owns
 * anything that happens during a placement.
 */
export async function listPartnerPlacements(
  partnerId: string,
): Promise<PartnerPlacements> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("student_placements")
    .select(`*, student:students(${STUDENT_SELECT})`)
    .eq("partner_id", partnerId)
    .order("assigned_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as (StudentPlacementRow & {
    student: StudentListItem | null;
  })[];
  const names = await readStaffNames(rows.map((row) => row.assigned_by));

  const placements: PartnerPlacement[] = rows.map((row) => ({
    ...row,
    student: row.student,
    assignedByName: row.assigned_by
      ? (names.get(row.assigned_by) ?? null)
      : null,
  }));

  return {
    current: placements.filter((row) => isActiveRecord(row.status)),
    history: placements.filter((row) => !isActiveRecord(row.status)),
  };
}

export function isActiveRecord(status: PlacementRecordStatus): boolean {
  return ACTIVE_PLACEMENT_RECORD_STATUSES.includes(status);
}

export type PlacementCounts = {
  /** Active students per high-level placement status. */
  byStatus: Record<PlacementStatus, number>;
  /** Students on the five working board columns. */
  onBoard: number;
  readyForPlacement: number;
  assigned: number;
  started: number;
  onHold: number;
};

/**
 * The reads behind the summary blocks at the top of /placement.
 *
 * Scoped the same way the page is, through the one shared rule, so each block
 * equals the length of the list its link opens. Two small reads and a tally in
 * memory; no per-status query.
 */
export async function getPlacementCounts(
  filters: Pick<PlacementFilters, "currentOperations"> = {},
): Promise<PlacementCounts> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const [studentsRead, batchesRead] = await Promise.all([
    supabase
      .from("students")
      .select("placement_status, batch_id, is_active")
      .eq("is_active", true),
    supabase.from("batches").select("id, status, placement_tracking_enabled"),
  ]);

  if (studentsRead.error) throw new Error(studentsRead.error.message);
  if (batchesRead.error) throw new Error(batchesRead.error.message);

  const batchesById = new Map<string, OperationalBatchShape>();
  for (const batch of batchesRead.data ?? []) batchesById.set(batch.id, batch);

  const data = filters.currentOperations
    ? (studentsRead.data ?? []).filter((row) =>
        isTrackedStudent(row, batchesById),
      )
    : (studentsRead.data ?? []);

  const byStatus = {
    needs_review: 0,
    documents_pending: 0,
    ready_for_placement: 0,
    placement_assigned: 0,
    placement_started: 0,
    placement_completed: 0,
    on_hold: 0,
  } satisfies Record<PlacementStatus, number>;

  for (const row of data ?? []) byStatus[row.placement_status] += 1;

  return {
    byStatus,
    onBoard:
      byStatus.needs_review +
      byStatus.documents_pending +
      byStatus.ready_for_placement +
      byStatus.placement_assigned +
      byStatus.on_hold,
    readyForPlacement: byStatus.ready_for_placement,
    assigned: byStatus.placement_assigned,
    started: byStatus.placement_started,
    onHold: byStatus.on_hold,
  };
}

/** Current student count per partner id, for the Find Placement partner cards. */
export async function getPlacementCountsByPartner(): Promise<
  Map<string, number>
> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("student_placements")
    .select("partner_id")
    .in("status", [...ACTIVE_PLACEMENT_RECORD_STATUSES]);

  if (error) throw new Error(error.message);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    counts.set(row.partner_id, (counts.get(row.partner_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * The primary contact at each partner, where one has been marked.
 *
 * Find Placement shows it so staff know who to phone about the placement they
 * are about to make. Partners with no primary contact are simply absent from
 * this map; nothing is guessed from the contact list.
 */
export async function getPrimaryContacts(): Promise<
  Map<string, PartnerContactRow>
> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("placement_partner_contacts")
    .select("*")
    .eq("is_active", true)
    .eq("is_primary", true);

  if (error) throw new Error(error.message);

  const byPartner = new Map<string, PartnerContactRow>();
  for (const contact of data ?? []) byPartner.set(contact.partner_id, contact);
  return byPartner;
}
