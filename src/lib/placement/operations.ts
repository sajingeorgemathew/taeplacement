/**
 * Current placement operations: which batches are being worked TODAY, which
 * students that makes operationally visible, and how they roll up per program.
 *
 * This module is pure. It reads no database and imports nothing server-side,
 * so the rule can be exercised by a plain script and reused by any query. The
 * one condition below is the single source of truth for "in current placement
 * operations"; nothing else in the application is allowed to spell it out
 * again.
 *
 *   batch is operational   status = active AND placement_tracking_enabled
 *   student is tracked     is_active AND attached to an operational batch
 *
 * Old PSW batches whose students are still in the database are simply not
 * tracked. Nothing here archives, deactivates, or deletes anything, and none
 * of these counts derive a placement status: students.placement_status is
 * taken exactly as stored.
 */

import {
  PROGRAM_FULL_NAMES,
  PROGRAM_LABELS,
  PROGRAM_OPTIONS,
  isProgram,
  type PlacementStatus,
  type Program,
} from "./constants";

// ---------------------------------------------------------------------------
// The inclusion rule
// ---------------------------------------------------------------------------

/** The only two batch fields the rule needs. */
export type OperationalBatchShape = {
  status: "active" | "archived";
  placement_tracking_enabled: boolean;
};

/**
 * True when a batch belongs to CURRENT placement operations.
 *
 * Both halves are required. An archived batch is never tracked no matter what
 * its flag says, and an active batch that nobody has switched on is browsable
 * but not counted.
 */
export function isOperationalBatch(
  batch: OperationalBatchShape | null | undefined,
): boolean {
  if (!batch) return false;
  return batch.status === "active" && batch.placement_tracking_enabled === true;
}

/** The only student fields the rule needs. */
export type TrackedStudentShape = {
  is_active: boolean;
  batch_id: string | null;
};

/**
 * True when a student is counted in current placement operations: an active
 * record, attached to a batch, and that batch is operational. A student with
 * no batch has nowhere to be tracked from and is excluded.
 */
export function isTrackedStudent(
  student: TrackedStudentShape,
  batchesById: ReadonlyMap<string, OperationalBatchShape>,
): boolean {
  if (!student.is_active) return false;
  if (!student.batch_id) return false;
  return isOperationalBatch(batchesById.get(student.batch_id));
}

/**
 * The same rule for a student row that already carries its batch joined in,
 * as the Placement List reads them. One rule, two shapes: this and
 * isTrackedStudent() must never disagree, which is why both end in
 * isOperationalBatch().
 */
export function isTrackedStudentRow(student: {
  is_active: boolean;
  batch: OperationalBatchShape | null | undefined;
}): boolean {
  if (!student.is_active) return false;
  return isOperationalBatch(student.batch);
}

// ---------------------------------------------------------------------------
// The URL form of the working scope
// ---------------------------------------------------------------------------

/**
 * The `operations` parameter that every operational screen reads:
 *
 *   /placement                          current placement operations (default)
 *   /placement?operations=current       the same, spelled out (dashboard links)
 *   /placement?operations=all           every active student, historical and
 *                                       untracked batches included
 *
 * "current" is the DEFAULT working scope on the Dashboard, Placement,
 * Students, and Batch Planning. The broader population is never removed; it is
 * one explicit choice away, and the choice travels in the URL so it survives
 * the ordinary filters, a reload, and a shared link.
 *
 * Only the exact word "all" widens the scope. Anything else, including an
 * empty or mistyped value, is the default, so a broken link never surfaces
 * students by accident and never hides them either: it simply shows today's
 * work.
 */
export const OPERATIONS_PARAM = "operations";
export const CURRENT_OPERATIONS_VALUE = "current";
export const ALL_STUDENTS_VALUE = "all";

export type OperationsScope = "current" | "all";

export function isCurrentOperationsValue(value: unknown): boolean {
  return value === CURRENT_OPERATIONS_VALUE;
}

export function isAllStudentsValue(value: unknown): boolean {
  return value === ALL_STUDENTS_VALUE;
}

/** The scope a URL value resolves to. Absent, "current", or unknown: current. */
export function operationsScopeFrom(value: unknown): OperationsScope {
  return isAllStudentsValue(value) ? "all" : "current";
}

/** Whether a scope narrows a roster to current placement operations. */
export function isCurrentOperationsScope(scope: OperationsScope): boolean {
  return scope === "current";
}

// ---------------------------------------------------------------------------
// Per-program summary
// ---------------------------------------------------------------------------

/**
 * One program's current placement operations, as the dashboard shows it.
 *
 * Each status count is a plain tally of students.placement_status among the
 * tracked students of that program. The seven together always add up to
 * totalTrackedStudents.
 */
export type ProgramOperationsSummary = {
  program: Program;
  totalTrackedStudents: number;
  needsReview: number;
  documentsPending: number;
  readyForPlacement: number;
  placementAssigned: number;
  onPlacement: number;
  placementCompleted: number;
  onHold: number;
};

export type ProgramOperationsSummaries = Record<
  Program,
  ProgramOperationsSummary
>;

/** How each placement status maps onto a summary field. */
const STATUS_FIELD: Record<
  PlacementStatus,
  Exclude<keyof ProgramOperationsSummary, "program" | "totalTrackedStudents">
> = {
  needs_review: "needsReview",
  documents_pending: "documentsPending",
  ready_for_placement: "readyForPlacement",
  placement_assigned: "placementAssigned",
  placement_started: "onPlacement",
  placement_completed: "placementCompleted",
  on_hold: "onHold",
};

export function emptyProgramOperationsSummary(
  program: Program,
): ProgramOperationsSummary {
  return {
    program,
    totalTrackedStudents: 0,
    needsReview: 0,
    documentsPending: 0,
    readyForPlacement: 0,
    placementAssigned: 0,
    onPlacement: 0,
    placementCompleted: 0,
    onHold: 0,
  };
}

/** The student fields the summary reads. Nothing about documents or partners. */
export type SummaryStudentShape = TrackedStudentShape & {
  program: string;
  placement_status: PlacementStatus;
};

export type SummaryBatchShape = OperationalBatchShape & { id: string };

/**
 * Rolls a roster up into one summary per supported program.
 *
 * Every supported program is always present, with zeros when it has nobody
 * tracked, so the dashboard can render an ECEA card before the first ECEA
 * batch is switched on. A student whose program is not a supported one is
 * skipped: there is no card to put them on, and inventing one would hide the
 * data problem rather than surface it.
 *
 * Grouping is by the STUDENT's program, which is also what the program filter
 * on the Students and Placement pages matches, so a count here and the list it
 * links to agree on who is PSW and who is ECEA.
 */
export function buildProgramOperationsSummary(
  students: readonly SummaryStudentShape[],
  batches: readonly SummaryBatchShape[],
): ProgramOperationsSummaries {
  const batchesById = new Map<string, OperationalBatchShape>();
  for (const batch of batches) batchesById.set(batch.id, batch);

  const summaries = Object.fromEntries(
    PROGRAM_OPTIONS.map((program) => [
      program,
      emptyProgramOperationsSummary(program),
    ]),
  ) as ProgramOperationsSummaries;

  for (const student of students) {
    if (!isTrackedStudent(student, batchesById)) continue;
    if (!isProgram(student.program)) continue;
    const field = STATUS_FIELD[student.placement_status];
    if (!field) continue;

    const summary = summaries[student.program];
    summary.totalTrackedStudents += 1;
    summary[field] += 1;
  }

  return summaries;
}

// ---------------------------------------------------------------------------
// What the dashboard shows and where each count leads
// ---------------------------------------------------------------------------

/**
 * The five primary stages on a program card, in lifecycle order. Needs Review
 * and On Hold are real and shown, but as a secondary line: they are exceptions
 * to the flow rather than steps in it.
 */
export const PROGRAM_PRIMARY_STAGES: readonly {
  status: PlacementStatus;
  label: string;
  field: keyof Pick<
    ProgramOperationsSummary,
    | "documentsPending"
    | "readyForPlacement"
    | "placementAssigned"
    | "onPlacement"
    | "placementCompleted"
  >;
}[] = [
  { status: "documents_pending", label: "Documents Pending", field: "documentsPending" },
  { status: "ready_for_placement", label: "Ready", field: "readyForPlacement" },
  { status: "placement_assigned", label: "Assigned", field: "placementAssigned" },
  { status: "placement_started", label: "On Placement", field: "onPlacement" },
  { status: "placement_completed", label: "Completed", field: "placementCompleted" },
];

export const PROGRAM_SECONDARY_STAGES: readonly {
  status: PlacementStatus;
  label: string;
  field: keyof Pick<ProgramOperationsSummary, "needsReview" | "onHold">;
}[] = [
  { status: "needs_review", label: "Needs Review", field: "needsReview" },
  { status: "on_hold", label: "On Hold", field: "onHold" },
];

/**
 * Where a program count leads: the Placement List, narrowed to current
 * placement operations and filtered to that program and that status. The same
 * population the count was taken from, so the number and the list agree.
 *
 *   /placement?view=list&operations=current&program=ECEA&status=ready_for_placement
 */
export function programOperationsHref(
  program: Program,
  status?: PlacementStatus,
): string {
  const params = new URLSearchParams();
  params.set("view", "list");
  params.set(OPERATIONS_PARAM, CURRENT_OPERATIONS_VALUE);
  params.set("program", program);
  if (status) params.set("status", status);
  return `/placement?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Which batches are today's work
// ---------------------------------------------------------------------------

/**
 * The batches in current placement operations, in the order given (the admin
 * display order when the input is listBatches()). This is the default batch
 * list on the Students program overview and the Batch Planning selector.
 */
export function operationalBatches<T extends OperationalBatchShape>(
  batches: readonly T[],
): T[] {
  return batches.filter((batch) => isOperationalBatch(batch));
}

/**
 * The batches OUTSIDE current placement operations: active but not tracked,
 * or archived. Never hidden for good, only moved behind "Show all".
 */
export function historicalBatches<T extends OperationalBatchShape>(
  batches: readonly T[],
): T[] {
  return batches.filter((batch) => !isOperationalBatch(batch));
}

/**
 * The batches a selector offers under a scope.
 *
 * Current: the operational batches, plus whichever batch the URL already
 * names, so a direct link to an old batch keeps working and the select can
 * show what the page is showing. All: every batch, in the same order.
 */
export function batchChoicesForScope<
  T extends OperationalBatchShape & { id: string },
>(
  batches: readonly T[],
  scope: OperationsScope,
  selectedBatchId: string | null | undefined,
): T[] {
  if (scope === "all") return [...batches];
  return batches.filter(
    (batch) => isOperationalBatch(batch) || batch.id === selectedBatchId,
  );
}

// ---------------------------------------------------------------------------
// Program-first overview (Students page)
// ---------------------------------------------------------------------------

/** The batch fields the Students program overview shows. */
export type OverviewBatchShape = OperationalBatchShape & {
  id: string;
  name: string;
  program: string;
  schedule_label: string | null;
  start_date: string | null;
};

export type ProgramOverviewBatch<B extends OverviewBatchShape> = B & {
  /** Active students attached to this batch. All of them are tracked. */
  studentCount: number;
};

/**
 * One program section on the Students page: the program, how many students it
 * has in current placement operations, and the tracked batches under it.
 */
export type ProgramOverview<B extends OverviewBatchShape> = {
  program: Program;
  label: string;
  fullName: string;
  /** From the same per-program summary the dashboard shows. */
  trackedStudents: number;
  /** Tracked active batches of this program, in admin display order. */
  batches: ProgramOverviewBatch<B>[];
};

/**
 * The program-first overview, one section per supported program, always both.
 *
 * A program with nothing tracked still renders, with zero and no batches, so
 * ECEA is visible before its first batch is switched on. Only operational
 * batches (active AND tracked) appear under a program; an active batch nobody
 * has switched on, or an archived batch, is not today's work and stays out of
 * the operational overview. Both remain reachable through Show All Students,
 * the batch page, and Batch Management.
 *
 * The program's student count comes from the SAME summary the dashboard
 * renders, grouped by the student's program, so the Students page and the
 * Dashboard cannot disagree. The per-batch count is the active roster of that
 * batch; because the batch is operational, every one of them is tracked.
 */
export function buildProgramOverview<B extends OverviewBatchShape>(
  batches: readonly B[],
  summaries: ProgramOperationsSummaries,
  studentCountByBatch: ReadonlyMap<string, number>,
): ProgramOverview<B>[] {
  const operational = operationalBatches(batches);

  return PROGRAM_OPTIONS.map((program) => ({
    program,
    label: PROGRAM_LABELS[program],
    fullName: PROGRAM_FULL_NAMES[program],
    trackedStudents: summaries[program].totalTrackedStudents,
    batches: operational
      .filter((batch) => batch.program === program)
      .map((batch) => ({
        ...batch,
        studentCount: studentCountByBatch.get(batch.id) ?? 0,
      })),
  }));
}
