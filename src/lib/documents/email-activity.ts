/**
 * The Activity page's filter state, date windows, and pagination arithmetic.
 *
 * PURE. No database, no session, no environment. It is imported by the server
 * page, by the server query layer, and by the client toolbar, which is exactly
 * why it has to stay that way: the same filter values have to mean the same
 * thing in the URL, in the query, and in the controls that write the URL back.
 *
 * Nothing here invents a status word. The three quick groups and the eight
 * individual statuses both come from src/lib/placement/constants.ts, so the
 * Activity page cannot drift into a second delivery vocabulary of its own.
 */

import {
  isStudentEmailStatus,
  isStudentEmailStatusGroup,
  isStudentEmailType,
  STUDENT_EMAIL_STATUS_GROUP_STATUSES,
  type StudentEmailStatus,
  type StudentEmailStatusGroup,
  type StudentEmailType,
} from "@/lib/placement/constants";

/**
 * How many emails one page shows.
 *
 * The log is permanent and only ever grows, so there is no "show everything"
 * view of it and there must not be one: a year of batch reminders is tens of
 * thousands of rows, each carrying a rendered body and a snapshot.
 */
export const EMAIL_ACTIVITY_PAGE_SIZE = 50;

/**
 * The only student ids one search may pull in.
 *
 * A search for a single letter matches most of the roster, and the roster is
 * the bound that matters here: this is a list of ids used to filter the log,
 * not a list of results. A few hundred students fit comfortably inside it, so
 * in practice the cap is never the reason a row is missing.
 */
export const EMAIL_ACTIVITY_STUDENT_MATCH_LIMIT = 1000;

// ---------------------------------------------------------------------------
// Date windows
// ---------------------------------------------------------------------------

export const EMAIL_ACTIVITY_DATE_RANGES = ["all", "today", "7d", "30d"] as const;

export type EmailActivityDateRange =
  (typeof EMAIL_ACTIVITY_DATE_RANGES)[number];

export const EMAIL_ACTIVITY_DATE_RANGE_LABELS: Record<
  EmailActivityDateRange,
  string
> = {
  all: "All time",
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

export function isEmailActivityDateRange(
  value: unknown,
): value is EmailActivityDateRange {
  return (
    typeof value === "string" &&
    EMAIL_ACTIVITY_DATE_RANGES.includes(value as EmailActivityDateRange)
  );
}

/**
 * The academy's timezone, and the reason "Today" needs one at all.
 *
 * Emails are stored as instants and the server runs in UTC. A staff member
 * filtering to Today at 8pm in Toronto is already on the next UTC day, so a
 * UTC-based "today" would hide every email they sent that afternoon. The day
 * boundary is therefore read in Toronto time, where the people using this
 * application are sitting.
 */
export const ACADEMY_TIME_ZONE = "America/Toronto";

const ACADEMY_CLOCK = new Intl.DateTimeFormat("en-CA", {
  timeZone: ACADEMY_TIME_ZONE,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const MS_PER_DAY = 86_400_000;

/**
 * The instant the current Toronto day started.
 *
 * Worked out by subtracting the time showing on a Toronto clock rather than by
 * assembling a date string, so it needs no offset table and no library.
 *
 * On the two days a year the clocks move, the clock has run one hour more or
 * less than the elapsed time, so this lands an hour either side of midnight.
 * Today is one hour wide at worst on those two days, which is a fair price for
 * not carrying a timezone database in order to draw a line on a list.
 */
export function startOfAcademyDay(now: Date = new Date()): Date {
  const parts = ACADEMY_CLOCK.formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number(part.value) : 0;
  };

  const elapsed =
    read("hour") * 3_600_000 +
    read("minute") * 60_000 +
    read("second") * 1_000 +
    now.getMilliseconds();

  return new Date(now.getTime() - elapsed);
}

/** The lower bound on created_at for one range, or null for All time. */
export function dateRangeStart(
  range: EmailActivityDateRange,
  now: Date = new Date(),
): string | null {
  switch (range) {
    case "all":
      return null;
    case "today":
      return startOfAcademyDay(now).toISOString();
    case "7d":
      return new Date(now.getTime() - 7 * MS_PER_DAY).toISOString();
    case "30d":
      return new Date(now.getTime() - 30 * MS_PER_DAY).toISOString();
  }
}

// ---------------------------------------------------------------------------
// Filter state carried in the URL
// ---------------------------------------------------------------------------

/**
 * The filter state as it appears in the query string. Empty string means "no
 * filter", the same convention the Students toolbar uses.
 *
 * `status` is one exact status and `group` is one of the three quick groups.
 * They are two ways of asking the same question, so the controls that write
 * them clear each other: picking a status clears the group chip and picking a
 * chip clears the status. A hand written URL carrying both is still answered
 * honestly, by intersecting them.
 */
export type EmailActivityValues = {
  q: string;
  batch: string;
  status: string;
  type: string;
  range: string;
  group: string;
  page: string;
};

export const emptyEmailActivityValues: EmailActivityValues = {
  q: "",
  batch: "",
  status: "",
  type: "",
  range: "",
  group: "",
  page: "",
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function emailActivityValuesFrom(
  params: RawSearchParams,
): EmailActivityValues {
  return {
    q: single(params.q).slice(0, 120),
    batch: single(params.batch),
    status: single(params.status),
    type: single(params.type),
    range: single(params.range),
    group: single(params.group),
    page: single(params.page),
  };
}

/** Page numbers are 1 based. Anything unreadable is page 1. */
export function pageNumberFrom(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 10_000);
}

/** What the database is asked for. Only values it understands get this far. */
export type EmailActivityFilters = {
  search?: string;
  batchId?: string;
  status?: StudentEmailStatus;
  group?: StudentEmailStatusGroup;
  emailType?: StudentEmailType;
  /** ISO lower bound on created_at. Absent for All time. */
  since?: string;
};

export function emailActivityFiltersFrom(
  values: EmailActivityValues,
  now: Date = new Date(),
): EmailActivityFilters {
  const filters: EmailActivityFilters = {};

  if (values.q.trim()) filters.search = values.q.trim();
  if (values.batch) filters.batchId = values.batch;
  if (isStudentEmailStatus(values.status)) filters.status = values.status;
  if (isStudentEmailStatusGroup(values.group)) filters.group = values.group;
  if (isStudentEmailType(values.type)) filters.emailType = values.type;
  if (isEmailActivityDateRange(values.range)) {
    const since = dateRangeStart(values.range, now);
    if (since) filters.since = since;
  }

  return filters;
}

/**
 * The statuses a filtered query may return.
 *
 * null means "every status", which is not the same as the empty array: an empty
 * array is a filter nothing can satisfy, and it happens only when a hand
 * written URL asks for a status that is not in the group beside it. The callers
 * answer that with an empty page rather than by quietly dropping one of the two
 * filters the URL asked for.
 */
export function resolveActivityStatuses(
  filters: EmailActivityFilters,
): readonly StudentEmailStatus[] | null {
  const groupStatuses = filters.group
    ? STUDENT_EMAIL_STATUS_GROUP_STATUSES[filters.group]
    : null;

  if (filters.status && groupStatuses) {
    return groupStatuses.includes(filters.status) ? [filters.status] : [];
  }
  if (filters.status) return [filters.status];
  return groupStatuses;
}

/** True when anything narrows the list, the page number aside. */
export function hasActiveEmailActivityFilters(
  values: EmailActivityValues,
): boolean {
  return Boolean(
    values.q ||
      values.batch ||
      values.status ||
      values.type ||
      values.group ||
      (values.range && values.range !== "all"),
  );
}

/**
 * A URL for a changed filter.
 *
 * Changing any filter returns to page 1, because page 7 of the old result set
 * is a meaningless place to land in the new one. A change that sets `page`
 * explicitly is the pagination itself and keeps everything else untouched,
 * which is how filters survive moving between pages.
 */
export function emailActivityHref(
  basePath: string,
  values: EmailActivityValues,
  change: Partial<EmailActivityValues>,
): string {
  const next: EmailActivityValues = {
    ...values,
    ...(change.page === undefined ? { page: "" } : {}),
    ...change,
  };

  const keys = Object.keys(
    emptyEmailActivityValues,
  ) as (keyof EmailActivityValues)[];

  const params = new URLSearchParams();
  for (const key of keys) {
    const value = next[key];
    if (!value) continue;
    // All time and page 1 are the defaults, so they stay out of the URL and it
    // reads as the short description of a view that it is.
    if (key === "range" && value === "all") continue;
    if (key === "page" && value === "1") continue;
    params.set(key, value);
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

// ---------------------------------------------------------------------------
// Pagination arithmetic
// ---------------------------------------------------------------------------

export type EmailActivityPageInfo = {
  /** The page actually shown, clamped into the range that exists. */
  page: number;
  pageCount: number;
  pageSize: number;
  /** Rows matching the filters, across every page. */
  total: number;
  /** 1 based position of the first and last row on this page. 0 when empty. */
  firstRow: number;
  lastRow: number;
};

export function pageInfoFor(
  total: number,
  requestedPage: number,
  pageSize: number = EMAIL_ACTIVITY_PAGE_SIZE,
): EmailActivityPageInfo {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(requestedPage, 1), pageCount);
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = total === 0 ? 0 : Math.min(page * pageSize, total);

  return { page, pageCount, pageSize, total, firstRow, lastRow };
}

/** The inclusive row window one page asks the database for. */
export function rangeForPage(
  page: number,
  pageSize: number = EMAIL_ACTIVITY_PAGE_SIZE,
): { from: number; to: number } {
  const from = (Math.max(page, 1) - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** "1 email" / "24 emails". */
export function emailCountLabel(count: number): string {
  return count === 1 ? "1 email" : `${count} emails`;
}

/**
 * How many items a stored snapshot asked the student to act on, in words.
 *
 * Read from the snapshot, never recounted from today's checklist, so a reminder
 * sent in April still says what April's email asked for.
 */
export function actionNeededLabel(count: number): string {
  if (count === 0) return "Nothing required attention";
  return count === 1
    ? "1 item required attention"
    : `${count} items required attention`;
}

export const PROVIDER_ERROR_PREVIEW_LENGTH = 120;

/**
 * A provider message cut to one line for a list row.
 *
 * The full message is never lost: it is shown whole in that email's own dialog.
 * This exists so a two hundred character SMTP refusal cannot push a row's
 * columns out of alignment or bury the twenty rows underneath it.
 */
export function providerErrorPreview(
  message: string | null | undefined,
  max: number = PROVIDER_ERROR_PREVIEW_LENGTH,
): string | null {
  const clean = message?.trim().replace(/\s+/g, " ");
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
