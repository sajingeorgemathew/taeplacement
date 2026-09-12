/** Small display helpers shared by the Students module. */

const DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "long",
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

/** "2026-04-27" becomes "April 27, 2026". Date only values stay in UTC. */
export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return DATE_FORMAT.format(date);
}

export function formatTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return DATE_TIME_FORMAT.format(date);
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
