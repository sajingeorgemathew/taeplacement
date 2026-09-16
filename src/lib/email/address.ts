/**
 * Student email address handling.
 *
 * A pure module on purpose: no environment, no database, no provider. The
 * eligibility screens, the preview, and the send path all have to agree on what
 * "this student has a usable email address" means, and the only way to keep
 * three answers identical is to have one function.
 *
 * This module NEVER rewrites students.email. Normalization produces the address
 * an email is sent TO; the student record keeps whatever staff typed, and
 * correcting it stays an edit a person makes on the student form.
 */

/**
 * Deliberately permissive. This is a last check against blanks, stray spaces,
 * missing @, and obviously truncated domains, not an attempt to decide which
 * addresses the internet considers legal. Real delivery is decided by the
 * provider, and a bounce is recorded honestly rather than guessed at here.
 */
const BASIC_EMAIL = /^[^\s@,;:<>()[\]\\"]+@[^\s@.,;:<>()[\]\\"]+(\.[^\s@.,;:<>()[\]\\"]+)+$/;

/** Longer than any real address, and short enough to keep a log row sane. */
const MAX_EMAIL_LENGTH = 254;

/**
 * The address to send to: trimmed and lowercased, or null when there is not a
 * usable one.
 *
 * Lowercasing is what makes "Maria.Smith@Example.com" and
 * "maria.smith@example.com" one address rather than two, which matters for the
 * "already emailed in the last 24 hours" check as much as for delivery.
 */
export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > MAX_EMAIL_LENGTH) return null;
  if (!BASIC_EMAIL.test(trimmed)) return null;

  return trimmed;
}

/** True when this student can be emailed at all. */
export function hasUsableEmail(value: string | null | undefined): boolean {
  return normalizeEmail(value) !== null;
}

/** The one sentence the interface shows when a student cannot be emailed. */
export const NO_EMAIL_MESSAGE = "No student email address is available.";
