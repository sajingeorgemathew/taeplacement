"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  emailActivityHref,
  EMAIL_ACTIVITY_DATE_RANGES,
  EMAIL_ACTIVITY_DATE_RANGE_LABELS,
  hasActiveEmailActivityFilters,
  type EmailActivityValues,
} from "@/lib/documents/email-activity";
import {
  STUDENT_EMAIL_STATUSES,
  STUDENT_EMAIL_STATUS_LABELS,
  STUDENT_EMAIL_TYPES,
  STUDENT_EMAIL_TYPE_LABELS,
} from "@/lib/placement/constants";
import type { BatchRow } from "@/lib/supabase/database.types";

const SELECT_CLASSES =
  "h-12 min-w-[11rem] rounded-2xl border border-line bg-surface px-4 text-[16px] text-ink outline-none focus:border-brand";

/**
 * Search and filters for the Email Activity list.
 *
 * Every control writes the URL and nothing else, the same way the Students
 * toolbar does. The server reads those search params, so a filtered view is
 * shareable, survives a reload, and is what the ten second status refresh asks
 * for again - which is the practical reason the filters are not client state.
 *
 * The status select and the quick group chips above the list are two ways of
 * asking one question, so choosing a status clears the chip. They are never
 * both on, and the chip that is highlighted is always the one in effect.
 */
export default function EmailActivityToolbar({
  basePath,
  values,
  batches,
}: {
  basePath: string;
  values: EmailActivityValues;
  batches: BatchRow[];
}) {
  const router = useRouter();

  function go(change: Partial<EmailActivityValues>) {
    router.push(emailActivityHref(basePath, values, change));
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
          <label htmlFor="activity-search" className="sr-only">
            Search emails by student or recipient address
          </label>
          <input
            id="activity-search"
            // Remounts when the URL changes so the box always matches the query.
            key={values.q}
            name="q"
            type="search"
            defaultValue={values.q}
            placeholder="Search by student name or recipient email"
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
        <label htmlFor="activity-batch" className="sr-only">
          Filter by batch
        </label>
        <select
          id="activity-batch"
          className={SELECT_CLASSES}
          value={values.batch}
          onChange={(event) => go({ batch: event.target.value })}
        >
          <option value="">All batches</option>
          {batches.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.name}
            </option>
          ))}
        </select>

        <label htmlFor="activity-status" className="sr-only">
          Filter by delivery status
        </label>
        <select
          id="activity-status"
          className={SELECT_CLASSES}
          value={values.status}
          // Clearing the group here is what keeps the two controls honest: an
          // exact status and a quick group are never in effect at once.
          onChange={(event) => go({ status: event.target.value, group: "" })}
        >
          <option value="">All delivery statuses</option>
          {STUDENT_EMAIL_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STUDENT_EMAIL_STATUS_LABELS[status]}
            </option>
          ))}
        </select>

        <label htmlFor="activity-type" className="sr-only">
          Filter by email type
        </label>
        <select
          id="activity-type"
          className={SELECT_CLASSES}
          value={values.type}
          onChange={(event) => go({ type: event.target.value })}
        >
          <option value="">All email types</option>
          {STUDENT_EMAIL_TYPES.map((type) => (
            <option key={type} value={type}>
              {STUDENT_EMAIL_TYPE_LABELS[type]}
            </option>
          ))}
        </select>

        <label htmlFor="activity-range" className="sr-only">
          Filter by date sent
        </label>
        <select
          id="activity-range"
          className={SELECT_CLASSES}
          value={values.range || "all"}
          onChange={(event) => go({ range: event.target.value })}
        >
          {EMAIL_ACTIVITY_DATE_RANGES.map((range) => (
            <option key={range} value={range}>
              {EMAIL_ACTIVITY_DATE_RANGE_LABELS[range]}
            </option>
          ))}
        </select>

        {hasActiveEmailActivityFilters(values) ? (
          <Link
            href={basePath}
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
