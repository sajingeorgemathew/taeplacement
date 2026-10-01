/**
 * What a batch still needs on its placement document checklist.
 *
 * Pure functions over checklist rows the page has already read. Nothing here
 * touches the database, and nothing here changes a document, a readiness
 * total, or a placement status: this is a summary of rows as they are stored.
 *
 * The one distinction this file exists to protect is WHO has to act:
 *
 *   requested       STUDENT ACTION. We asked; it has not arrived.
 *   needs_update    STUDENT ACTION. It arrived and something is wrong with it.
 *   not_reviewed    STAFF REVIEW. Nobody on staff has looked yet. This is our
 *                   state, not the student's, and it is never described as a
 *                   missing student document.
 *   received        complete. Never listed.
 *   not_applicable  exempt. Never listed.
 *
 * The split matches how the student email divides the checklist
 * (EMAIL_ACTION_NEEDED_STATUSES in @/lib/placement/constants), so a
 * requirement Batch Planning calls a student action is exactly one a reminder
 * email would ask the student for.
 *
 * Privacy: the row shape accepted here carries only student_id,
 * requirement_id, and status. The internal `note` and the student-facing
 * `student_message` on a checklist row are never read by this module and never
 * appear in anything it returns. Output is requirement names and counts.
 */

import {
  EMAIL_ACTION_NEEDED_STATUSES,
  type PlacementDocumentStatus,
} from "@/lib/placement/constants";
import type { DocumentRequirementRow } from "@/lib/supabase/database.types";

/** The two operational concepts, carried in the URL for a drill-down. */
export const NEED_KINDS = ["action", "review"] as const;
export type NeedKind = (typeof NEED_KINDS)[number];

export const NEED_KIND_LABELS: Record<NeedKind, string> = {
  action: "Student Action Needed",
  review: "Staff Review Needed",
};

export function isNeedKind(value: unknown): value is NeedKind {
  return typeof value === "string" && NEED_KINDS.includes(value as NeedKind);
}

/** requested and needs_update. The student has something to do. */
export const STUDENT_ACTION_STATUSES: readonly PlacementDocumentStatus[] =
  EMAIL_ACTION_NEEDED_STATUSES;

/** not_reviewed. Staff have something to do. */
export const STAFF_REVIEW_STATUSES: readonly PlacementDocumentStatus[] = [
  "not_reviewed",
];

export function isStudentActionStatus(status: PlacementDocumentStatus): boolean {
  return STUDENT_ACTION_STATUSES.includes(status);
}

export function isStaffReviewStatus(status: PlacementDocumentStatus): boolean {
  return STAFF_REVIEW_STATUSES.includes(status);
}

/** The kind of need one checklist status represents, or null for none. */
export function needKindForStatus(
  status: PlacementDocumentStatus,
): NeedKind | null {
  if (isStudentActionStatus(status)) return "action";
  if (isStaffReviewStatus(status)) return "review";
  return null;
}

/**
 * The only three columns this summary reads from a checklist row. The query
 * that feeds it selects exactly these, and the type stops a wider row from
 * being passed by accident.
 */
export type NeedChecklistRow = {
  student_id: string;
  requirement_id: string;
  status: PlacementDocumentStatus;
};

/** The requirement fields a need summary shows. Never the description. */
export type NeedRequirement = Pick<
  DocumentRequirementRow,
  "id" | "name" | "short_name" | "is_required" | "is_active" | "sort_order"
>;

/** One requirement and the students in the batch who need something on it. */
export type RequirementNeed = {
  requirement: NeedRequirement;
  studentCount: number;
  /** In the batch's own student order, for the drill-down. */
  studentIds: string[];
};

/** One side of the summary: student action, or staff review. */
export type NeedGroup = {
  kind: NeedKind;
  /** Distinct students with at least one item of this kind. */
  studentCount: number;
  studentIds: string[];
  /** Largest first. Requirements nobody needs are absent. */
  requirements: RequirementNeed[];
};

/** The per-student line an area drill-down row shows. Counts only. */
export type StudentNeedSummary = {
  studentActions: number;
  notReviewed: number;
};

export type BatchDocumentNeeds = {
  action: NeedGroup;
  review: NeedGroup;
  byStudent: Map<string, StudentNeedSummary>;
};

function emptyGroup(kind: NeedKind): NeedGroup {
  return { kind, studentCount: 0, studentIds: [], requirements: [] };
}

/**
 * Summarize the checklist rows of one batch.
 *
 * Only ACTIVE requirements count. An archived requirement still has a row on
 * every student who ever had it, and listing it here would ask a batch to chase
 * a document the academy has retired. This is the same rule the reminder email
 * applies, and it matches the readiness view, whose denominator is active
 * requirements only.
 *
 * Only students in `studentIds` count. Rows for anybody else are ignored, so a
 * wider read can never leak another batch into this one's numbers.
 *
 * Optional requirements are included when a student needs something on them:
 * a requested optional document is still a request. They never block
 * readiness, and this summary does not claim they do.
 */
export function buildBatchDocumentNeeds(input: {
  studentIds: readonly string[];
  requirements: readonly NeedRequirement[];
  rows: readonly NeedChecklistRow[];
}): BatchDocumentNeeds {
  const order = new Map<string, number>();
  input.studentIds.forEach((id, index) => {
    if (!order.has(id)) order.set(id, index);
  });

  const requirementsById = new Map<string, NeedRequirement>();
  for (const requirement of input.requirements) {
    if (requirement.is_active) requirementsById.set(requirement.id, requirement);
  }

  type Bucket = Map<string, Set<string>>; // requirement id -> student ids
  const buckets: Record<NeedKind, Bucket> = {
    action: new Map(),
    review: new Map(),
  };
  const byStudent = new Map<string, StudentNeedSummary>();

  for (const row of input.rows) {
    if (!order.has(row.student_id)) continue;
    if (!requirementsById.has(row.requirement_id)) continue;

    const kind = needKindForStatus(row.status);
    if (!kind) continue;

    const students = buckets[kind].get(row.requirement_id) ?? new Set();
    students.add(row.student_id);
    buckets[kind].set(row.requirement_id, students);

    const summary = byStudent.get(row.student_id) ?? {
      studentActions: 0,
      notReviewed: 0,
    };
    if (kind === "action") summary.studentActions += 1;
    else summary.notReviewed += 1;
    byStudent.set(row.student_id, summary);
  }

  const sortStudents = (ids: Iterable<string>) =>
    [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));

  const toGroup = (kind: NeedKind): NeedGroup => {
    const group = emptyGroup(kind);
    const distinct = new Set<string>();

    for (const [requirementId, students] of buckets[kind]) {
      const requirement = requirementsById.get(requirementId);
      if (!requirement) continue;
      for (const id of students) distinct.add(id);
      group.requirements.push({
        requirement,
        studentCount: students.size,
        studentIds: sortStudents(students),
      });
    }

    group.requirements.sort(
      (a, b) =>
        b.studentCount - a.studentCount ||
        a.requirement.sort_order - b.requirement.sort_order ||
        a.requirement.name.localeCompare(b.requirement.name),
    );
    group.studentIds = sortStudents(distinct);
    group.studentCount = group.studentIds.length;
    return group;
  };

  return {
    action: toGroup("action"),
    review: toGroup("review"),
    byStudent,
  };
}

/**
 * PostgREST turns `.in()` into a URL, so a very large batch is read in fixed
 * slices rather than one unbounded request. Each slice is one query; a batch
 * of forty students is exactly one. Pure, so the slicing can be checked
 * without a database.
 */
export const CHECKLIST_READ_CHUNK = 200;

export function chunkIds(
  ids: readonly string[],
  size = CHECKLIST_READ_CHUNK,
): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

/**
 * The students a need drill-down shows.
 *
 * With a requirement: the students who need something of this kind on that
 * requirement. Without one: every student with at least one item of this
 * kind. An unknown requirement id returns nobody rather than everybody.
 */
export function needStudentIds(
  needs: BatchDocumentNeeds,
  kind: NeedKind,
  requirementId: string | null,
): string[] {
  const group = needs[kind];
  if (!requirementId) return group.studentIds;
  const match = group.requirements.find(
    (need) => need.requirement.id === requirementId,
  );
  return match ? match.studentIds : [];
}

/** The requirement a need drill-down is about, if the batch has it. */
export function needRequirement(
  needs: BatchDocumentNeeds,
  kind: NeedKind,
  requirementId: string,
): NeedRequirement | null {
  return (
    needs[kind].requirements.find((need) => need.requirement.id === requirementId)
      ?.requirement ?? null
  );
}

/**
 * "2 student actions", "3 items not reviewed", or both joined. Null when the
 * student has nothing outstanding of either kind.
 */
export function studentNeedLabel(
  summary: StudentNeedSummary | undefined,
): string | null {
  if (!summary) return null;
  const parts: string[] = [];
  if (summary.studentActions > 0) {
    parts.push(
      summary.studentActions === 1
        ? "1 student action"
        : `${summary.studentActions} student actions`,
    );
  }
  if (summary.notReviewed > 0) {
    parts.push(
      summary.notReviewed === 1
        ? "1 item not reviewed"
        : `${summary.notReviewed} items not reviewed`,
    );
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

/** "4 students have checklist items not yet reviewed." */
export function staffReviewHeadline(count: number): string {
  if (count === 0) return "No checklist items are waiting for staff review.";
  if (count === 1) return "1 student has checklist items not yet reviewed.";
  return `${count} students have checklist items not yet reviewed.`;
}

/** "5 students need to act on a placement document." */
export function studentActionHeadline(count: number): string {
  if (count === 0) return "No student in this batch has a document to act on.";
  if (count === 1) return "1 student needs to act on a placement document.";
  return `${count} students need to act on a placement document.`;
}
