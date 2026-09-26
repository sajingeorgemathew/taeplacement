"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  PLACEMENT_STATUSES,
  PLACEMENT_STATUS_LABELS,
  PROGRAM_LABELS,
  PROGRAM_OPTIONS,
} from "@/lib/placement/constants";
import OperationsScopeSwitch from "@/components/ui/OperationsScopeSwitch";
import {
  clearedPlacementValues,
  hasActivePlacementFilters,
  placementHref,
  placementScopeFrom,
  type PlacementToolbarValues,
} from "@/lib/placement/filters";
import { ALL_STUDENTS_VALUE } from "@/lib/placement/operations";
import { batchOptionsForProgram } from "@/lib/students/filters";
import type {
  BatchRow,
  PlacementAreaRow,
  PlacementPartnerRow,
} from "@/lib/supabase/database.types";

type PlacementToolbarProps = {
  basePath: string;
  values: PlacementToolbarValues;
  batches: BatchRow[];
  areas: PlacementAreaRow[];
  /** Partners that currently hold at least one student. */
  partners: Pick<PlacementPartnerRow, "id" | "name">[];
  /** The five filters belong to List View. Board keeps only the search. */
  showFilters: boolean;
};

const SELECT_CLASSES =
  "h-12 min-w-[12rem] rounded-2xl border border-line bg-surface px-4 text-[16px] text-ink outline-none focus:border-brand";

/**
 * Search and the List View filters.
 *
 * One search box covering student name, student number, and partner name, and
 * five plain selects. No filter builder, no saved views: this is a small desk,
 * not a reporting tool.
 */
export default function PlacementToolbar({
  basePath,
  values,
  batches,
  areas,
  partners,
  showFilters,
}: PlacementToolbarProps) {
  const router = useRouter();

  function go(change: Partial<PlacementToolbarValues>) {
    router.push(placementHref(basePath, values, change));
  }

  const batchOptions = batchOptionsForProgram(
    batches,
    values.program,
    values.batch,
  );
  const scope = placementScopeFrom(values);

  return (
    <div className="flex flex-col gap-4">
      {/*
        The working scope, shown on the board and the list alike because it
        applies to both. Current placement operations is the default; Show All
        Students opens the broader population and every other filter keeps
        working inside whichever one is chosen.
      */}
      <OperationsScopeSwitch
        scope={scope}
        currentHref={placementHref(basePath, values, { operations: "" })}
        allHref={placementHref(basePath, values, {
          operations: ALL_STUDENTS_VALUE,
        })}
      />

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
          <label htmlFor="placement-search" className="sr-only">
            Search students and placements
          </label>
          <input
            id="placement-search"
            // Remounts when the URL changes so the box always matches the query.
            key={values.q}
            name="q"
            type="search"
            defaultValue={values.q}
            placeholder="Search by student, student number, or partner"
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
          <label htmlFor="filter-program" className="sr-only">
            Filter by program
          </label>
          <select
            id="filter-program"
            className={SELECT_CLASSES}
            value={values.program}
            onChange={(event) => go({ program: event.target.value })}
          >
            <option value="">All Programs</option>
            {PROGRAM_OPTIONS.map((program) => (
              <option key={program} value={program}>
                {PROGRAM_LABELS[program]}
              </option>
            ))}
          </select>

          <label htmlFor="filter-batch" className="sr-only">
            Filter by batch
          </label>
          <select
            id="filter-batch"
            className={SELECT_CLASSES}
            value={values.batch}
            onChange={(event) => go({ batch: event.target.value })}
          >
            <option value="">All batches</option>
            {batchOptions.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.name}
              </option>
            ))}
          </select>

          <label htmlFor="filter-placement-status" className="sr-only">
            Filter by placement status
          </label>
          <select
            id="filter-placement-status"
            className={SELECT_CLASSES}
            value={values.status}
            onChange={(event) => go({ status: event.target.value })}
          >
            <option value="">All placement statuses</option>
            {PLACEMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PLACEMENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>

          <label htmlFor="filter-document-status" className="sr-only">
            Filter by document status
          </label>
          <select
            id="filter-document-status"
            className={SELECT_CLASSES}
            value={values.document}
            onChange={(event) => go({ document: event.target.value })}
          >
            <option value="">All document statuses</option>
            {DOCUMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                Documents {DOCUMENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>

          <label htmlFor="filter-placement-area" className="sr-only">
            Filter by the area of the current placement partner
          </label>
          <select
            id="filter-placement-area"
            className={SELECT_CLASSES}
            value={values.area}
            onChange={(event) => go({ area: event.target.value })}
          >
            <option value="">All areas</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>

          <label htmlFor="filter-placement-partner" className="sr-only">
            Filter by placement partner
          </label>
          <select
            id="filter-placement-partner"
            className={SELECT_CLASSES}
            value={values.partner}
            onChange={(event) => go({ partner: event.target.value })}
          >
            <option value="">All partners</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </select>

          {hasActivePlacementFilters(values) ? (
            <Link
              href={placementHref(basePath, values, clearedPlacementValues())}
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
