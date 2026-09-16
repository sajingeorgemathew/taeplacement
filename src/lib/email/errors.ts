/**
 * Safe text for anything that came from the email provider.
 *
 * Pure and dependency-free so both the send path and the webhook can use it
 * without either of them pulling in the Resend client.
 *
 * Provider messages are useful to a staff member ("Invalid `to` field", "The
 * recipient's mailbox is full"), so they are kept rather than replaced by a
 * generic apology. They are also length-capped and never joined with anything
 * from the configuration, so no credential can ride out into the interface or
 * into student_email_log.error_message.
 */

const MAX_LENGTH = 300;

export function safeProviderError(message: string | undefined | null): string {
  const clean = message?.trim();
  if (!clean) return "The email could not be sent. Try again.";
  return clean.length > MAX_LENGTH
    ? `${clean.slice(0, MAX_LENGTH - 3)}...`
    : clean;
}
