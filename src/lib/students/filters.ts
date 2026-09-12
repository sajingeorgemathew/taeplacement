import {
  isDocumentStatus,
  isPlacementStatus,
} from "@/lib/placement/constants";

import type { StudentFilters } from "./queries";

/** The filter state carried in the URL. Empty string means "no filter". */
export type ToolbarValues = {
  q: string;
  batch: string;
  placement: string;
  document: string;
  returning: string;
};

export const emptyToolbarValues: ToolbarValues = {
  q: "",
  batch: "",
  placement: "",
  document: "",
  returning: "",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function toolbarValuesFrom(params: RawSearchParams): ToolbarValues {
  return {
    q: single(params.q).slice(0, 120),
    batch: single(params.batch),
    placement: single(params.placement),
    document: single(params.document),
    returning: single(params.returning),
  };
}

/** Only values the database understands are passed through. */
export function studentFiltersFrom(values: ToolbarValues): StudentFilters {
  const filters: StudentFilters = {};

  if (values.q.trim()) filters.search = values.q.trim();
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

export function hasActiveFilters(values: ToolbarValues): boolean {
  return Boolean(
    values.q || values.batch || values.placement || values.document || values.returning,
  );
}
