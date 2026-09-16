import { NextResponse } from "next/server";

import {
  canAdvanceStatus,
  parseProviderEvent,
  providerStatusChange,
} from "@/lib/documents/email-status";
import { verifyResendWebhook } from "@/lib/email/resend";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

/**
 * Resend delivery events.
 *
 * NOT REGISTERED YET. This endpoint exists and works; nothing in the Resend
 * dashboard points at it, and RESEND_WEBHOOK_SECRET is not set anywhere. Until
 * both of those are done, every request here is refused rather than trusted,
 * which is also exactly the right behaviour for the request that eventually
 * arrives from somebody who found the URL.
 *
 * This is the ONLY way an email reaches "Delivered" in TAE Placement. The send
 * path stops at "accepted", because a 200 from an API means the provider took
 * the message, not that a student received it.
 *
 * ---------------------------------------------------------------------------
 * Trust
 * ---------------------------------------------------------------------------
 *
 * The request body is read RAW, as text, before anything looks at it. The
 * signature covers the exact bytes Resend sent, so parsing first and
 * re-serializing would invalidate every genuine event. Verification happens
 * against that raw string, through the official Resend webhook verification
 * API, using the svix-id, svix-timestamp, and svix-signature headers.
 *
 * An unsigned request is refused. A request with a bad signature is refused. A
 * request that arrives while no secret is configured is refused. In all three
 * cases the body is never parsed, nothing is written, and nothing is logged
 * from the payload.
 *
 * ---------------------------------------------------------------------------
 * Why the service role
 * ---------------------------------------------------------------------------
 *
 * There is no signed in staff member behind a provider callback, so there is no
 * Row Level Security context to work in. The service role key is used here and
 * NOWHERE else in the application, it never leaves the server, and this route
 * only ever UPDATES a log row it can already find by provider id. 0008 has a
 * delete trigger that refuses this credential too, so bypassing policies cannot
 * become erasing history.
 */

// Never cached, never prerendered: every request carries a different signature.
export const dynamic = "force-dynamic";

/** A 200 with no body. Anything a provider retries forever is worse. */
function ok(): NextResponse {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: Request): Promise<NextResponse> {
  // Raw first. Nothing below may read request.json().
  const rawBody = await request.text();

  const verification = verifyResendWebhook(rawBody, {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  });

  if (!verification.ok) {
    if (verification.reason === "not_configured") {
      // Not an error in the caller: this server simply cannot verify anything
      // yet. 503 is honest and tells a provider to try again later.
      return new NextResponse("Webhook is not configured.", { status: 503 });
    }
    return new NextResponse("Invalid signature.", { status: 401 });
  }

  const event = parseProviderEvent(verification.event);
  // A verified event this ticket does not act on: an open, a click, a contact
  // change, or a payload with no email id. Acknowledged and ignored, because a
  // provider that never gets a 2xx retries the same uninteresting event for
  // days.
  if (!event) return ok();

  const supabase = createSupabaseServiceRoleClient();
  if (!supabase) {
    return new NextResponse("Webhook is not configured.", { status: 503 });
  }

  const { data: logRow, error } = await supabase
    .from("student_email_log")
    .select("id, status")
    .eq("resend_email_id", event.emailId)
    .maybeSingle();

  // An email id this application has no row for. That is ordinary: an email
  // sent from the Resend dashboard, from another environment pointed at the
  // same endpoint, or a row whose provider id failed to store. Acknowledged and
  // dropped, never inserted, so a webhook can never create history.
  if (error || !logRow) return ok();

  const change = providerStatusChange(event);

  // Out of order and repeated events are both normal. A status only ever moves
  // forward, so a late email.sent cannot demote a row that already knows it was
  // delivered, and a repeated event simply writes the same values again.
  if (!canAdvanceStatus(logRow.status, change.status)) {
    await supabase
      .from("student_email_log")
      .update({ last_provider_event_at: change.last_provider_event_at })
      .eq("id", logRow.id);
    return ok();
  }

  await supabase
    .from("student_email_log")
    .update(change)
    .eq("id", logRow.id);

  return ok();
}
