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
import { ALL_STUDENTS_VALUE } from "@/lib/placement/operations";
import type { BatchRow } from "@/lib/supabase/database.types";
import {
  batchOptionsForProgram,
  clearedToolbarValues,
  hasActiveFilters,
  studentHref,
  studentScopeFrom,
  type ToolbarValues,
} from "@/lib/students/filters";

type StudentToolbarProps = {
  /** Route the filters write back to, for example /students. */
  basePath: string;
  values: ToolbarValues;
  /** Omit to hide the batch filter, for example on a batch page. */
  batches?: BatchRow[];
  /**
   * Show the Current Operations / Show All Students switch. Only the main
   * roster has a scope; a batch page or Previous / Returning shows what it
   * shows.
   */
  showScopeSwitch?: boolean;
  showReturningFilter?: boolean;
  searchPlaceholder?: string;
};

const SELECT_CLASSES =
  "h-12 min-w-[11rem] rounded-2xl border border-line bg-surface px-4 text-[16px] text-ink outline-none focus:border-brand";

/** Comfortable search and light filters. No filter builder, no dense controls. */
export default function StudentToolbar({
  basePath,
  values,
  batches,
  showScopeSwitch = false,
  showReturningFilter = true,
  searchPlaceholder = "Search by name, student number, or email",
}: StudentToolbarProps) {
  const router = useRouter();

  const hasFilters = hasActiveFilters(values);
  const batchOptions = batches
    ? batchOptionsForProgram(batches, values.program, values.batch)
    : null;

  function go(change: Partial<ToolbarValues>) {
    router.push(studentHref(basePath, values, change));
  }

  return (
    <div className="flex flex-col gap-4">
      {showScopeSwitch ? (
        <OperationsScopeSwitch
          scope={studentScopeFrom(values)}
          currentHref={studentHref(basePath, values, { operations: "" })}
          allHref={studentHref(basePath, values, {
            operations: ALL_STUDENTS_VALUE,
          })}
        />
      ) : null}

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
          <label htmlFor="student-search" className="sr-only">
            Search students
          </label>
          <input
            id="student-search"
            // Remounts when the URL changes so the box always matches the query.
            key={values.q}
            name="q"
            type="search"
            defaultValue={values.q}
            placeholder={searchPlaceholder}
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
        {batchOptions ? (
          <>
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
          </>
        ) : null}

        <label htmlFor="filter-placement" className="sr-only">
          Filter by placement status
        </label>
        <select
          id="filter-placement"
          className={SELECT_CLASSES}
          value={values.placement}
          onChange={(event) => go({ placement: event.target.value })}
        >
          <option value="">All placement statuses</option>
          {PLACEMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {PLACEMENT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>

        <label htmlFor="filter-document" className="sr-only">
          Filter by document status
        </label>
        <select
          id="filter-document"
          className={SELECT_CLASSES}
          value={values.document}
          onChange={(event) => go({ document: event.target.value })}
        >
          <option value="">All document statuses</option>
          {DOCUMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {DOCUMENT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>

        {showReturningFilter ? (
          <>
            <label htmlFor="filter-returning" className="sr-only">
              Filter by returning student
            </label>
            <select
              id="filter-returning"
              className={SELECT_CLASSES}
              value={values.returning}
              onChange={(event) => go({ returning: event.target.value })}
            >
              <option value="">Returning and current</option>
              <option value="yes">Returning only</option>
              <option value="no">Current only</option>
            </select>
          </>
        ) : null}

        {hasFilters ? (
          <Link
            href={studentHref(basePath, values, clearedToolbarValues())}
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
