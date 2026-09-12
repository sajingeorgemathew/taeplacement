/**
 * Shared shape for Server Action form results.
 *
 * Kept out of the "use server" modules because those may only export async
 * functions.
 */
export type FormState = {
  /** Message shown above the form. */
  error: string | null;
  /** Message shown beside a specific field. */
  fieldErrors: Record<string, string>;
};

export const emptyFormState: FormState = { error: null, fieldErrors: {} };

/** Turns Zod issues into one message per field. */
export function fieldErrorsFrom(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}
