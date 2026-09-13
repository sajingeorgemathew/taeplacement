"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  AVAILABILITY_STATUSES,
  AVAILABILITY_STATUS_LABELS,
  RELATIONSHIP_STATUSES,
  RELATIONSHIP_STATUS_LABELS,
  UNASSIGNED_AREA_ID,
  UNASSIGNED_AREA_LABEL,
} from "@/lib/placement/constants";
import {
  hasActivePartnerFilters,
  partnerHref,
  type PartnerToolbarValues,
} from "@/lib/partners/filters";
import type { PlacementAreaRow } from "@/lib/supabase/database.types";

type PartnerToolbarProps = {
  basePath: string;
  values: PartnerToolbarValues;
  /** Active areas only. Unassigned is added here, never read from the table. */
  areas: PlacementAreaRow[];
  /** Area, status, and contact filters belong to List View. */
  showFilters: boolean;
};

const SELECT_CLASSES =
  "h-12 min-w-[12rem] rounded-2xl border border-line bg-surface px-4 text-[16px] text-ink outline-none focus:border-brand";

/** Fast search, and the three simple List View filters. No filter builder. */
export default function PartnerToolbar({
  basePath,
  values,
  areas,
  showFilters,
}: PartnerToolbarProps) {
  const router = useRouter();

  function go(change: Partial<PartnerToolbarValues>) {
    router.push(partnerHref(basePath, values, change));
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const field = event.currentTarget.elements.namedItem("q");
          const term = field instanceof HTMLInputElement ? field.value.trim() : "";
          go({ q: term });
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search
            size={22}
            aria-hidden="true"
            className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <label htmlFor="partner-search" className="sr-only">
            Search placement partners
          </label>
          <input
            id="partner-search"
            // Remounts when the URL changes so the box always matches the query.
            key={values.q}
            name="q"
            type="search"
            defaultValue={values.q}
            placeholder="Search by partner, city, phone, or contact"
            className="h-14 w-full rounded-2xl border border-line bg-surface pl-14 pr-5 text-[17px] text-ink outline-none focus:border-brand"
          />
        </div>
        <button
          type="submit"
          className="h-14 rounded-2xl bg-brand px-7 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
        >
          Search
        </button>
      </form>

      {showFilters ? (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="filter-area" className="sr-only">
            Filter by area
          </label>
          <select
            id="filter-area"
            className={SELECT_CLASSES}
            value={values.area}
            onChange={(event) => go({ area: event.target.value })}
          >
            <option value="">All areas</option>
            <option value={UNASSIGNED_AREA_ID}>{UNASSIGNED_AREA_LABEL}</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>

          <label htmlFor="filter-status" className="sr-only">
            Filter by relationship status
          </label>
          <select
            id="filter-status"
            className={SELECT_CLASSES}
            value={values.status}
            onChange={(event) => go({ status: event.target.value })}
          >
            <option value="">All relationship statuses</option>
            {RELATIONSHIP_STATUSES.map((status) => (
              <option key={status} value={status}>
                {RELATIONSHIP_STATUS_LABELS[status]}
              </option>
            ))}
          </select>

          <label htmlFor="filter-availability" className="sr-only">
            Filter by placement availability
          </label>
          <select
            id="filter-availability"
            className={SELECT_CLASSES}
            value={values.availability}
            onChange={(event) => go({ availability: event.target.value })}
          >
            <option value="">All availability</option>
            {AVAILABILITY_STATUSES.map((status) => (
              <option key={status} value={status}>
                {AVAILABILITY_STATUS_LABELS[status]}
              </option>
            ))}
          </select>

          <label htmlFor="filter-contacts" className="sr-only">
            Filter by contacts
          </label>
          <select
            id="filter-contacts"
            className={SELECT_CLASSES}
            value={values.contacts}
            onChange={(event) => go({ contacts: event.target.value })}
          >
            <option value="">With and without contacts</option>
            <option value="with">Has contacts</option>
            <option value="without">No contacts</option>
          </select>

          {hasActivePartnerFilters(values) ? (
            <Link
              href={partnerHref(basePath, values, {
                q: "",
                area: "",
                status: "",
                availability: "",
                contacts: "",
                archived: "",
              })}
              className="flex items-center gap-2 rounded-2xl px-4 py-3 text-[16px] font-medium text-brand-strong transition-colors hover:bg-brand-soft"
            >
              <X size={18} aria-hidden="true" />
              Clear filters
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
