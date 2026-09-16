import "server-only";

import { Resend } from "resend";

import { getEmailConfig, getWebhookSecret } from "./env";
import { safeProviderError } from "./errors";

/**
 * The only place in the application that talks to Resend.
 *
 * Server only, through the `server-only` import: RESEND_API_KEY must never be
 * reachable from a Client Component, and this is the module that would be the
 * way in.
 *
 * The client is created lazily, per call, rather than at module load. `new
 * Resend()` throws when there is no API key, so a module-level instance would
 * turn "Resend is not configured yet" into a crash at import time and take the
 * whole build with it on a machine that has no production secrets. Sending a
 * handful of emails is not hot enough for a shared instance to be worth that.
 */

/** One outbound email. Deliberately the smallest surface that does the job. */
export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /**
   * Sent to Resend as Idempotency-Key. The same key never sends twice, so a
   * network retry of a request the provider already accepted returns the
   * original email id instead of a second message.
   */
  idempotencyKey: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Attachments, BCC, CC, tracking, and unsubscribe headers are all deliberately
 * absent. This is an operational placement email to one student: it carries no
 * health forms, no storage links, and no marketing apparatus, and every
 * recipient gets their own message rather than a shared BCC line.
 */
export async function sendPlacementEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const config = getEmailConfig();
  if (!config) {
    return {
      ok: false,
      error: "Email sending is not configured on this server.",
    };
  }

  try {
    const client = new Resend(config.apiKey);
    const { data, error } = await client.emails.send(
      {
        from: config.from,
        to: input.to,
        replyTo: config.replyTo,
        subject: input.subject,
        text: input.text,
        html: input.html,
      },
      { idempotencyKey: input.idempotencyKey },
    );

    if (error || !data?.id) {
      return { ok: false, error: safeProviderError(error?.message) };
    }

    return { ok: true, id: data.id };
  } catch {
    // A thrown error here is a transport failure, not a provider rejection. Its
    // message can carry a request URL and headers, so none of it is kept.
    return {
      ok: false,
      error: "The email service could not be reached. Try again.",
    };
  }
}

/** Signature headers, as Resend sends them. */
export type WebhookSignatureHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

export type WebhookVerification =
  | { ok: true; event: unknown }
  /** not_configured is a 503; the request is neither trusted nor processed. */
  | { ok: false; reason: "not_configured" | "missing_headers" | "invalid" };

/**
 * Verify a Resend webhook against the RAW request body.
 *
 * Raw, because the signature covers the exact bytes Resend sent. Re-serializing
 * a parsed object would change key order or whitespace and turn every genuine
 * delivery into an invalid signature.
 *
 * Verification goes through the official `resend` package, which checks the
 * Standard Webhooks signature the `svix-*` headers carry. An unsigned request,
 * a request with a signature that does not match, and a request that arrives
 * before the secret is configured are all refused the same way: nothing is
 * parsed and nothing is written.
 *
 * A Resend instance is needed to reach `webhooks.verify`, and its constructor
 * insists on an API key, so an unconfigured server reports not_configured
 * rather than trusting the payload.
 */
export function verifyResendWebhook(
  rawBody: string,
  headers: WebhookSignatureHeaders,
): WebhookVerification {
  const secret = getWebhookSecret();
  const config = getEmailConfig();
  if (!secret || !config) return { ok: false, reason: "not_configured" };

  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) {
    return { ok: false, reason: "missing_headers" };
  }

  try {
    const client = new Resend(config.apiKey);
    const event = client.webhooks.verify({
      payload: rawBody,
      headers: { id, timestamp, signature },
      webhookSecret: secret,
    });
    return { ok: true, event };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
