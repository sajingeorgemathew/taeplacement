import {
  UNASSIGNED_AREA_ID,
  isAvailabilityStatus,
  isRelationshipStatus,
} from "@/lib/placement/constants";

import type { PartnerFilters } from "./queries";

/** The two views of the partner network. Area Board is the default. */
export const PARTNER_VIEWS = ["board", "list"] as const;
export type PartnerView = (typeof PARTNER_VIEWS)[number];

/**
 * The Placement Partners state carried in the URL. Empty string means "no
 * filter". The URL is the only place this lives, so a filtered board can be
 * shared, bookmarked, and reloaded without any client state to keep in step.
 */
export type PartnerToolbarValues = {
  q: string;
  area: string;
  status: string;
  /** Placement availability. Empty string is every availability. */
  availability: string;
  contacts: string;
  archived: string;
  view: string;
};

export const emptyPartnerToolbarValues: PartnerToolbarValues = {
  q: "",
  area: "",
  status: "",
  availability: "",
  contacts: "",
  archived: "",
  view: "",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function partnerToolbarValuesFrom(
  params: RawSearchParams,
): PartnerToolbarValues {
  return {
    q: single(params.q).slice(0, 120),
    area: single(params.area),
    status: single(params.status),
    availability: single(params.availability),
    contacts: single(params.contacts),
    archived: single(params.archived),
    view: single(params.view),
  };
}

/** Area Board unless the URL asks for the list. */
export function partnerViewFrom(values: PartnerToolbarValues): PartnerView {
  return values.view === "list" ? "list" : "board";
}

/** Only values the database understands are passed through. */
export function partnerFiltersFrom(
  values: PartnerToolbarValues,
): PartnerFilters {
  const filters: PartnerFilters = {};

  if (values.q.trim()) filters.search = values.q.trim();
  if (values.area === UNASSIGNED_AREA_ID) {
    filters.areaId = UNASSIGNED_AREA_ID;
  } else if (values.area) {
    filters.areaId = values.area;
  }
  if (isRelationshipStatus(values.status)) {
    filters.relationshipStatus = values.status;
  }
  if (isAvailabilityStatus(values.availability)) {
    filters.availabilityStatus = values.availability;
  }
  if (values.contacts === "with" || values.contacts === "without") {
    filters.contacts = values.contacts;
  }
  if (values.archived === "1") filters.archived = true;

  return filters;
}

export function hasActivePartnerFilters(
  values: PartnerToolbarValues,
): boolean {
  return Boolean(
    values.q ||
      values.area ||
      values.status ||
      values.availability ||
      values.contacts ||
      values.archived,
  );
}

/** Builds a Placement Partners URL with one or more values changed. */
export function partnerHref(
  basePath: string,
  values: PartnerToolbarValues,
  change: Partial<PartnerToolbarValues>,
): string {
  const next = { ...values, ...change };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
