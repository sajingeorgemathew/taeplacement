import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import {
  emailActivityHref,
  type EmailActivityPageInfo,
  type EmailActivityValues,
} from "@/lib/documents/email-activity";

/**
 * Moving through the email log, fifty rows at a time.
 *
 * Plain links, so a page is a URL like every other view here, and so the filter
 * values travel with it: emailActivityHref carries the whole filter state and
 * changes only the page number. A staff member who filtered to one batch and
 * walked to page three is still on that batch.
 *
 * Deliberately Previous and Next rather than a row of numbered pages. This list
 * is read from the top - the newest emails are the ones anybody is looking for
 * - and a permanent log will have hundreds of pages before long, which makes a
 * numbered strip a lot of controls for a journey nobody takes.
 */
export default function EmailActivityPagination({
  basePath,
  values,
  info,
}: {
  basePath: string;
  values: EmailActivityValues;
  info: EmailActivityPageInfo;
}) {
  if (info.pageCount <= 1) return null;

  const hasPrevious = info.page > 1;
  const hasNext = info.page < info.pageCount;

  const linkClasses =
    "inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong";
  const disabledClasses =
    "inline-flex cursor-not-allowed items-center gap-2 rounded-2xl border border-line bg-surface-muted px-5 py-3.5 text-[16px] font-medium text-ink-muted";

  return (
    <nav
      aria-label="Email activity pages"
      className="mt-7 flex flex-wrap items-center justify-between gap-4"
    >
      {hasPrevious ? (
        <Link
          href={emailActivityHref(basePath, values, {
            page: String(info.page - 1),
          })}
          rel="prev"
          className={linkClasses}
        >
          <ChevronLeft size={20} aria-hidden="true" />
          Previous
        </Link>
      ) : (
        <span className={disabledClasses} aria-disabled="true">
          <ChevronLeft size={20} aria-hidden="true" />
          Previous
        </span>
      )}

      <p className="text-[16px] text-ink-muted">
        Page {info.page} of {info.pageCount}
      </p>

      {hasNext ? (
        <Link
          href={emailActivityHref(basePath, values, {
            page: String(info.page + 1),
          })}
          rel="next"
          className={linkClasses}
        >
          Next
          <ChevronRight size={20} aria-hidden="true" />
        </Link>
      ) : (
        <span className={disabledClasses} aria-disabled="true">
          Next
          <ChevronRight size={20} aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
