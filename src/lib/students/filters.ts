import {
  isDocumentStatus,
  isPlacementStatus,
  isProgram,
} from "@/lib/placement/constants";
import {
  isCurrentOperationsScope,
  operationsScopeFrom,
  type OperationsScope,
} from "@/lib/placement/operations";

import type { StudentFilters } from "./queries";

/** The filter state carried in the URL. Empty string means "no filter". */
export type ToolbarValues = {
  q: string;
  /** PSW or ECEA. Anything else is treated as "All Programs". */
  program: string;
  batch: string;
  placement: string;
  document: string;
  returning: string;
  /**
   * The working scope of the main roster. Empty or "current" is CURRENT
   * placement operations, the default. "all" is the broader active roster.
   * Read only by /students; the batch and returning pages ignore it.
   */
  operations: string;
};

export const emptyToolbarValues: ToolbarValues = {
  q: "",
  program: "",
  batch: "",
  placement: "",
  document: "",
  returning: "",
  operations: "",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function toolbarValuesFrom(params: RawSearchParams): ToolbarValues {
  return {
    q: single(params.q).slice(0, 120),
    program: single(params.program),
    batch: single(params.batch),
    placement: single(params.placement),
    document: single(params.document),
    returning: single(params.returning),
    operations: single(params.operations),
  };
}

/**
 * The scope the URL resolves to: current placement operations unless staff
 * explicitly chose Show All Students (operations=all). The same resolution the
 * Placement page uses.
 */
export function studentScopeFrom(values: ToolbarValues): OperationsScope {
  return operationsScopeFrom(values.operations);
}

/**
 * Only values the database understands are passed through.
 *
 * Scope-free on purpose: this is what the batch page and Previous / Returning
 * read, and neither of them is narrowed to current operations. A direct link
 * to an old or archived batch must keep showing that batch's students.
 */
export function studentFiltersFrom(values: ToolbarValues): StudentFilters {
  const filters: StudentFilters = {};

  if (values.q.trim()) filters.search = values.q.trim();
  // An unknown program is ignored rather than rejected, the same way an
  // unknown status is: the list falls back to All Programs.
  if (isProgram(values.program)) filters.program = values.program;
  if (values.batch) filters.batchId = values.batch;
  if (isPlacementStatus(values.placement)) {
    filters.placementStatus = values.placement;
  }
  if (isDocumentStatus(values.document)) {
    filters.documentStatus = values.document;
  }
  if (values.returning === "yes" || values.returning === "no") {
    filters.returning = values.returning;
  }

  return filters;
}

/**
 * The main /students roster: the ordinary filters, run over the chosen scope.
 * Current placement operations is the default; only operations=all widens it.
 */
export function studentRosterFiltersFrom(values: ToolbarValues): StudentFilters {
  const filters = studentFiltersFrom(values);
  if (isCurrentOperationsScope(studentScopeFrom(values))) {
    filters.currentOperations = true;
  }
  return filters;
}

/**
 * Whether any FILTER is on. The scope is not a filter: it is which population
 * the filters run over, so Clear filters leaves it where staff put it.
 */
export function hasActiveFilters(values: ToolbarValues): boolean {
  return Boolean(
    values.q ||
      values.program ||
      values.batch ||
      values.placement ||
      values.document ||
      values.returning,
  );
}

/** Builds a Students URL with one or more values changed. */
export function studentHref(
  basePath: string,
  values: ToolbarValues,
  change: Partial<ToolbarValues>,
): string {
  const next = { ...values, ...change };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Every filter cleared. Applied as a change, so the scope is kept. */
export function clearedToolbarValues(): Partial<ToolbarValues> {
  return {
    q: "",
    program: "",
    batch: "",
    placement: "",
    document: "",
    returning: "",
  };
}

/**
 * The batches a toolbar should offer once a program is chosen.
 *
 * Purely a convenience for the select: only batches of that program, plus
 * whichever batch is already in the URL so an existing choice never turns into
 * an option the select cannot show. With no program chosen, every batch.
 */
export function batchOptionsForProgram<
  T extends { id: string; program: string },
>(batches: readonly T[], program: string, selectedBatchId: string): T[] {
  if (!isProgram(program)) return [...batches];
  return batches.filter(
    (batch) => batch.program === program || batch.id === selectedBatchId,
  );
}
