/** Small display helpers shared by the Students and Placement Partners modules. */

import {
  AVAILABILITY_STATUS_LABELS,
  type AvailabilityStatus,
} from "@/lib/placement/constants";

const DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

/** "Oct 20". Used where a card has room for a date but not for a sentence. */
const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * The comment drawer's date separators and times.
 *
 * Unlike the date-only formats above these deliberately use the reader's own
 * timezone: a comment is a moment someone typed something, and "Today" has to
 * mean today where the staff member is sitting.
 */
const LOCAL_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-CA", {
  hour: "numeric",
  minute: "2-digit",
});

const MS_PER_DAY = 86_400_000;

/** "2026-04-27" becomes "April 27, 2026". Date only values stay in UTC. */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return DATE_FORMAT.format(date);
}

/** "2026-10-20" becomes "Oct 20". Date only values stay in UTC. */
export function formatShortDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return SHORT_DATE_FORMAT.format(date);
}

export function formatTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return DATE_TIME_FORMAT.format(date);
}

/**
 * A date-only value that is stored as a timestamptz at UTC midnight, shown as a
 * plain date.
 *
 * Partner follow-up dates are days, not moments, so they must not be shifted
 * into the local timezone: "2026-09-15T00:00:00Z" is September 15, never the
 * evening of September 14.
 */
export function formatDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatDate(date.toISOString().slice(0, 10));
}

/** Full name from the stored name parts, without extra spaces. */
export function studentFullName(student: {
  first_name: string;
  middle_name?: string | null;
  last_name?: string | null;
}): string {
  return [student.first_name, student.middle_name, student.last_name]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

/** Initials for the round avatar on the student page. */
export function studentInitials(student: {
  first_name: string;
  last_name?: string | null;
}): string {
  const first = student.first_name.trim().charAt(0);
  const last = student.last_name?.trim().charAt(0) ?? "";
  return `${first}${last}`.toUpperCase() || "?";
}

/** "1 student" / "24 students". */
export function studentCountLabel(count: number): string {
  return count === 1 ? "1 student" : `${count} students`;
}

/** "1 partner" / "12 partners". */
export function partnerCountLabel(count: number): string {
  return count === 1 ? "1 partner" : `${count} partners`;
}

/** "No contacts" / "1 contact" / "3 contacts". */
export function contactCountLabel(count: number): string {
  if (count === 0) return "No contacts";
  return count === 1 ? "1 contact" : `${count} contacts`;
}

/** Initials for the square avatar on a partner card. */
export function partnerInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word.charAt(0));
  return initials.join("").toUpperCase() || "?";
}

/**
 * The availability chip on a partner card, list row, or partner header.
 *
 * Always the plain status word: "Available Now", "Upcoming Intake", "Not
 * Available", "Unknown". The date is never folded into the chip, because
 * "Upcoming Oct 20" loses the one word that says what Oct 20 is. Where a card
 * has room for the date it sits beside the chip, from compactIntakeDate.
 */
export function availabilityChipLabel(partner: {
  availability_status: AvailabilityStatus;
}): string {
  return AVAILABILITY_STATUS_LABELS[partner.availability_status];
}

/**
 * "Oct 20", the compact next intake date shown beside an Upcoming Intake chip.
 *
 * Only an upcoming intake has one, and only when a date is actually recorded:
 * an upcoming intake with no date shows the chip alone rather than inventing
 * one. The full date, the availability note, and when staff last checked all
 * stay on the partner detail page.
 */
export function compactIntakeDate(partner: {
  availability_status: AvailabilityStatus;
  next_intake_date: string | null;
}): string | null {
  if (partner.availability_status !== "upcoming") return null;
  return formatShortDate(partner.next_intake_date);
}

/**
 * A date separator in the partner Comments drawer: "Today", "Yesterday", or
 * "September 11, 2026".
 *
 * Comments are moments, not days, so these are read in the staff member's own
 * timezone rather than pinned to UTC the way a follow-up date is.
 */
export function commentDayLabel(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const days = Math.round(
    (startOfLocalDay(new Date()).getTime() - startOfLocalDay(date).getTime()) /
      MS_PER_DAY,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return LOCAL_DATE_FORMAT.format(date);
}

/**
 * The key the drawer groups comments by. Two comments share a separator when
 * they fall on the same local calendar day, which is not the same question as
 * whether their labels happen to match.
 */
export function commentDayKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return startOfLocalDay(date).toDateString();
}

/** "2:45 p.m." The day above it comes from the separator, so this is time only. */
export function formatTimeOfDay(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return TIME_FORMAT.format(date);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * "2 hours ago", "just now", "3 days ago".
 *
 * Used where the age of something is the point rather than the moment it
 * happened: "A document status email was sent 2 hours ago" tells a staff member
 * whether to send again far better than a timestamp does. The exact time is
 * always shown beside it, never instead of it.
 */
export function timeAgoLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
