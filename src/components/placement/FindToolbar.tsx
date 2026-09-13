"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  findHref,
  hasActiveFindFilters,
  type FindToolbarValues,
} from "@/lib/placement/filters";
import {
  AVAILABILITY_STATUSES,
  AVAILABILITY_STATUS_LABELS,
  UNASSIGNED_AREA_ID,
  UNASSIGNED_AREA_LABEL,
} from "@/lib/placement/constants";
import type { PlacementAreaRow } from "@/lib/supabase/database.types";

const SELECT_CLASSES =
  "h-12 min-w-[12rem] rounded-2xl border border-line bg-surface px-4 text-[16px] text-ink outline-none focus:border-brand";

/**
 * Searching the partner network while matching one student.
 *
 * Area and Availability are the two questions staff actually ask when placing
 * somebody. Choosing a partner clears nothing: the filters stay in the URL, so
 * backing out of the confirmation lands on the same shortlist.
 */
export default function FindToolbar({
  basePath,
  values,
  areas,
}: {
  basePath: string;
  values: FindToolbarValues;
  areas: PlacementAreaRow[];
}) {
  const router = useRouter();

  function go(change: Partial<FindToolbarValues>) {
    router.push(findHref(basePath, values, change));
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const field = event.currentTarget.elements.namedItem("q");
          const term =
            field instanceof HTMLInputElement ? field.value.trim() : "";
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
          <label htmlFor="find-partner-search" className="sr-only">
            Search placement partners
          </label>
          <input
            id="find-partner-search"
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

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="find-area" className="sr-only">
          Filter partners by area
        </label>
        <select
          id="find-area"
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

        <label htmlFor="find-availability" className="sr-only">
          Filter partners by placement availability
        </label>
        <select
          id="find-availability"
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

        {hasActiveFindFilters(values) ? (
          <Link
            href={findHref(basePath, values, {
              q: "",
              area: "",
              availability: "",
            })}
            className="flex items-center gap-2 rounded-2xl px-4 py-3 text-[16px] font-medium text-brand-strong transition-colors hover:bg-brand-soft"
          >
            <X size={18} aria-hidden="true" />
            Clear filters
          </Link>
        ) : null}
      </div>
    </div>
  );
}
