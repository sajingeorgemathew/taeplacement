/**
 * Turning a Resend webhook event into a local status change.
 *
 * PURE, and separate from the route that receives the event, so the rules about
 * which events matter and which of them may overwrite which can be read without
 * any HTTP around them.
 *
 * Two things make this harder than a switch statement, and both are ordinary
 * webhook behaviour rather than edge cases:
 *
 *   Events REPEAT.        A provider retries until it gets a 2xx, so the same
 *                         delivered event can arrive three times.
 *   Events ARRIVE OUT OF  email.sent and email.delivered are moments apart and
 *   ORDER.                nothing guarantees they land in that order.
 *
 * Both are handled the same way: every event is applied as an idempotent write,
 * and a status only ever moves FORWARD along the ranking below. A late
 * email.sent therefore cannot demote a row that already knows it was delivered,
 * and a repeated event rewrites the same values it wrote the first time.
 */

import { safeProviderError } from "@/lib/email/errors";
import type { StudentEmailStatus } from "@/lib/placement/constants";

/** The events this ticket acts on. Opens and clicks are deliberately absent. */
const HANDLED_EVENTS = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.failed",
  "email.complained",
] as const;

type HandledEvent = (typeof HANDLED_EVENTS)[number];

function isHandledEvent(value: unknown): value is HandledEvent {
  return (
    typeof value === "string" &&
    HANDLED_EVENTS.includes(value as HandledEvent)
  );
}

/**
 * How far along a status is.
 *
 * pending and accepted are OUR words for it. Everything above them came from
 * the provider. The three bad outcomes outrank delivered on purpose: a message
 * that was delivered and then complained about is a complaint, and a hard
 * bounce reported after a delivery event is still a bounce.
 */
const STATUS_RANK: Record<StudentEmailStatus, number> = {
  pending: 0,
  accepted: 10,
  sent: 20,
  delivery_delayed: 30,
  delivered: 40,
  bounced: 50,
  failed: 50,
  complained: 60,
};

export function statusRank(status: StudentEmailStatus): number {
  return STATUS_RANK[status];
}

/**
 * Whether an event's status may replace what the row already holds.
 *
 * Equal ranks are allowed through, which is what makes a duplicate delivery
 * harmless: it rewrites the values it already wrote.
 */
export function canAdvanceStatus(
  current: StudentEmailStatus,
  next: StudentEmailStatus,
): boolean {
  return statusRank(next) >= statusRank(current);
}

export type ParsedProviderEvent = {
  type: HandledEvent;
  /** The Resend email id, matched against student_email_log.resend_email_id. */
  emailId: string;
  /** When the provider says it happened. Falls back to now if absent. */
  occurredAt: string;
  /** A short, safe failure reason for bounced and failed. */
  reason: string | null;
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Read a verified payload, or null when there is nothing to do with it.
 *
 * Null covers three different harmless situations and treats them alike:
 * an event type this ticket does not act on (an open, a contact change), a
 * payload shaped differently from what the types describe, and an event with no
 * email id to match on. All three end the request with a 200, because a
 * provider that cannot get a 2xx retries forever, and retrying will not make an
 * email.opened event any more interesting.
 */
export function parseProviderEvent(
  payload: unknown,
  now: Date = new Date(),
): ParsedProviderEvent | null {
  if (!payload || typeof payload !== "object") return null;

  const event = payload as { type?: unknown; created_at?: unknown; data?: unknown };
  if (!isHandledEvent(event.type)) return null;

  const data = (event.data ?? {}) as Record<string, unknown>;
  const emailId = readString(data.email_id);
  if (!emailId) return null;

  const occurredAt =
    readString(event.created_at) ?? readString(data.created_at) ?? now.toISOString();

  return {
    type: event.type,
    emailId,
    occurredAt: normalizeTimestamp(occurredAt, now),
    reason: reasonFrom(event.type, data),
  };
}

/** A provider timestamp Postgres will accept, or now when it is unreadable. */
function normalizeTimestamp(value: string, now: Date): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? now.toISOString() : parsed.toISOString();
}

function reasonFrom(
  type: HandledEvent,
  data: Record<string, unknown>,
): string | null {
  if (type === "email.bounced") {
    const bounce = (data.bounce ?? {}) as Record<string, unknown>;
    const message = readString(bounce.message);
    return message ? safeProviderError(message) : null;
  }
  if (type === "email.failed") {
    const failed = (data.failed ?? {}) as Record<string, unknown>;
    const reason = readString(failed.reason);
    return reason ? safeProviderError(reason) : null;
  }
  return null;
}

/** The columns one event writes. */
export type ProviderStatusChange = {
  status: StudentEmailStatus;
  last_provider_event_at: string;
  delivered_at?: string;
  bounced_at?: string;
  failed_at?: string;
  complained_at?: string;
  error_message?: string;
};

/**
 * The update for one event.
 *
 * Only the outcome's OWN timestamp is written. A bounce does not clear
 * delivered_at and a delivery does not clear bounced_at, because both are
 * things that really happened and a support question three months later is
 * answered by having both.
 */
export function providerStatusChange(
  event: ParsedProviderEvent,
): ProviderStatusChange {
  const at = event.occurredAt;

  switch (event.type) {
    case "email.sent":
      return { status: "sent", last_provider_event_at: at };
    case "email.delivered":
      return { status: "delivered", last_provider_event_at: at, delivered_at: at };
    case "email.delivery_delayed":
      return { status: "delivery_delayed", last_provider_event_at: at };
    case "email.bounced":
      return {
        status: "bounced",
        last_provider_event_at: at,
        bounced_at: at,
        ...(event.reason ? { error_message: event.reason } : {}),
      };
    case "email.failed":
      return {
        status: "failed",
        last_provider_event_at: at,
        failed_at: at,
        ...(event.reason ? { error_message: event.reason } : {}),
      };
    case "email.complained":
      return {
        status: "complained",
        last_provider_event_at: at,
        complained_at: at,
      };
  }
}
