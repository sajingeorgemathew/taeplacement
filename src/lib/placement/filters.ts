/**
 * The Placement page state carried in the URL.
 *
 * Empty string means "no filter". The URL is the only place this lives, so a
 * filtered board can be shared, bookmarked, and reloaded with no client state
 * to keep in step, exactly like the Placement Partners toolbar.
 */

import {
  isAvailabilityStatus,
  isDocumentStatus,
  isPlacementStatus,
} from "@/lib/placement/constants";

import type { PartnerFilters } from "@/lib/partners/queries";

import type { PlacementFilters } from "./queries";

/** The two views of the placement workload. Board is the default. */
export const PLACEMENT_VIEWS = ["board", "list"] as const;
export type PlacementView = (typeof PLACEMENT_VIEWS)[number];

export type PlacementToolbarValues = {
  q: string;
  batch: string;
  /** The student's high-level placement status. */
  status: string;
  document: string;
  /** Area of the student's CURRENT placement partner. */
  area: string;
  partner: string;
  view: string;
};

export const emptyPlacementToolbarValues: PlacementToolbarValues = {
  q: "",
  batch: "",
  status: "",
  document: "",
  area: "",
  partner: "",
  view: "",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function placementToolbarValuesFrom(
  params: RawSearchParams,
): PlacementToolbarValues {
  return {
    q: single(params.q).slice(0, 120),
    batch: single(params.batch),
    status: single(params.status),
    document: single(params.document),
    area: single(params.area),
    partner: single(params.partner),
    view: single(params.view),
  };
}

/** Board unless the URL asks for the list. */
export function placementViewFrom(
  values: PlacementToolbarValues,
): PlacementView {
  return values.view === "list" ? "list" : "board";
}

/** Only values the database understands are passed through. */
export function placementFiltersFrom(
  values: PlacementToolbarValues,
): PlacementFilters {
  const filters: PlacementFilters = {};

  if (values.q.trim()) filters.search = values.q.trim();
  if (values.batch) filters.batchId = values.batch;
  if (isPlacementStatus(values.status)) filters.placementStatus = values.status;
  if (isDocumentStatus(values.document)) filters.documentStatus = values.document;
  if (values.area) filters.areaId = values.area;
  if (values.partner) filters.partnerId = values.partner;

  return filters;
}

export function hasActivePlacementFilters(
  values: PlacementToolbarValues,
): boolean {
  return Boolean(
    values.q ||
      values.batch ||
      values.status ||
      values.document ||
      values.area ||
      values.partner,
  );
}

/** Builds a Placement URL with one or more values changed. */
export function placementHref(
  basePath: string,
  values: PlacementToolbarValues,
  change: Partial<PlacementToolbarValues>,
): string {
  const next = { ...values, ...change };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

// ---------------------------------------------------------------------------
// Find Placement
// ---------------------------------------------------------------------------

/**
 * The partner search on Find Placement.
 *
 * Separate from the board toolbar because it filters PARTNERS, not students,
 * and because the chosen partner is carried in the same URL: picking a partner
 * is a link, not client state, so the confirmation step survives a reload.
 */
export type FindToolbarValues = {
  q: string;
  area: string;
  availability: string;
  /** The partner staff have chosen, which opens the confirmation form. */
  partner: string;
};

export const emptyFindToolbarValues: FindToolbarValues = {
  q: "",
  area: "",
  availability: "",
  partner: "",
};

export function findToolbarValuesFrom(
  params: RawSearchParams,
): FindToolbarValues {
  return {
    q: single(params.q).slice(0, 120),
    area: single(params.area),
    availability: single(params.availability),
    partner: single(params.partner),
  };
}

export function hasActiveFindFilters(values: FindToolbarValues): boolean {
  return Boolean(values.q || values.area || values.availability);
}

export function findHref(
  basePath: string,
  values: FindToolbarValues,
  change: Partial<FindToolbarValues>,
): string {
  const next = { ...values, ...change };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * Partner filters for Find Placement.
 *
 * Reuses the PLACEMENT-03 partner query, so matching searches exactly the same
 * partner network staff already know, archived partners excluded.
 */
export function findPartnerFiltersFrom(
  values: FindToolbarValues,
): PartnerFilters {
  const filters: PartnerFilters = {};

  if (values.q.trim()) filters.search = values.q.trim();
  if (values.area) filters.areaId = values.area;
  if (isAvailabilityStatus(values.availability)) {
    filters.availabilityStatus = values.availability;
  }

  return filters;
}
