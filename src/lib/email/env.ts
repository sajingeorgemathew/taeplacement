import "server-only";

/**
 * Server-only email configuration.
 *
 * Every value here is read from the SERVER environment and none of them is a
 * NEXT_PUBLIC_ variable, so nothing in this file can reach the browser bundle.
 * The `server-only` import above is what makes that a build error rather than a
 * convention: a Client Component that imports this module, directly or through
 * anything else, fails the build instead of shipping an API key.
 *
 * Nothing is read at module load and nothing throws at import time. A build, a
 * page render, and every route in the application must all work on a machine
 * that has no Resend configuration at all, which is exactly the state this
 * repository is in before the production environment variables are set. The
 * only thing missing configuration may do is refuse a SEND, with a plain
 * message a staff member can act on.
 */

/** The sender the academy has verified in Resend. */
const FALLBACK_FROM =
  "Toronto Academy Placement <placement@mail.portal-torontoacademy.ca>";

/**
 * Where student replies go.
 *
 * Deliberately NOT the sending address. Receiving through Resend is off on
 * purpose, so a reply has to land in the real Google Workspace mailbox that
 * staff already read.
 */
const FALLBACK_REPLY_TO = "placement@torontoacademy.ca";

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export type EmailConfig = {
  apiKey: string;
  from: string;
  replyTo: string;
};

/**
 * The configuration a SEND needs, or null when Resend is not set up here.
 *
 * Only the API key is genuinely required. From and Reply-To fall back to the
 * academy's known production values, so a half-configured environment sends
 * from the right address rather than from a blank one.
 */
export function getEmailConfig(): EmailConfig | null {
  const apiKey = readEnv("RESEND_API_KEY");
  if (!apiKey) return null;

  return {
    apiKey,
    from: readEnv("RESEND_FROM_EMAIL") ?? FALLBACK_FROM,
    replyTo: readEnv("RESEND_REPLY_TO") ?? FALLBACK_REPLY_TO,
  };
}

export function isEmailConfigured(): boolean {
  return getEmailConfig() !== null;
}

/**
 * The webhook signing secret, or null while the webhook has not been registered.
 *
 * Absent is the normal state until someone creates the endpoint in Resend. The
 * webhook route treats null as "refuse the request", never as "trust it".
 */
export function getWebhookSecret(): string | null {
  return readEnv("RESEND_WEBHOOK_SECRET");
}
