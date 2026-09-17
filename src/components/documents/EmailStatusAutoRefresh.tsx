"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  STUDENT_EMAIL_UNRESOLVED_STATUSES,
  STUDENT_EMAIL_STATUS_LABELS,
} from "@/lib/placement/constants";

/**
 * Keeps delivery statuses moving without anybody pressing reload.
 *
 * A placement email is written to student_email_log the moment it is sent and
 * then waits for Resend to say what happened to it. Those events arrive at the
 * webhook seconds or minutes later, which means the page a staff member is
 * looking at was accurate when it rendered and is quietly out of date by the
 * time they read it.
 *
 * So this asks the SERVER again, every ten seconds, while anything on screen
 * can still change:
 *
 *   router.refresh()   re-runs the server component that loaded the rows and
 *                      swaps in the new payload. Client state survives, so an
 *                      open email dialog stays open and the scroll position
 *                      stays where it was.
 *
 * It is deliberately not Supabase Realtime, not a websocket, and not an API
 * route of its own. The page already knows how to read the log; polling it is
 * one cheap indexed query on a screen a handful of staff have open, and it adds
 * no new surface to authenticate.
 *
 * ---------------------------------------------------------------------------
 * When it stops
 * ---------------------------------------------------------------------------
 *
 * `active` is true only while at least one visible email is UNRESOLVED, which
 * is to say the provider may still have something to tell us about it:
 * Preparing, Accepted by Resend, Sent, or Delivery Delayed. Once every visible
 * row is Delivered, Bounced, Failed, or Marked as Spam there is nothing left to
 * wait for and the timer is never created.
 *
 * Note what that rule does NOT do. It does not decide that an old row which has
 * been Sent for three weeks is finished. Sent means the provider passed the
 * message on and never reported the outcome, so the page keeps asking, because
 * the alternative is telling staff that delivery is confirmed when it is not.
 */

export const EMAIL_STATUS_POLL_MS = 10_000;

export default function EmailStatusAutoRefresh({
  active,
  /** Shown once everything on screen has reached a final status. */
  restingLabel = "Delivery statuses up to date.",
}: {
  active: boolean;
  restingLabel?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;

    // One interval per mount, cleared on unmount and whenever `active` flips,
    // so navigating away or the last row reaching a final status leaves no
    // timer behind and a re-render cannot stack a second one on top.
    const interval = window.setInterval(() => {
      // A background tab is not being read, and refreshing it would keep
      // querying for a staff member who walked away. The listener below catches
      // up the moment they come back.
      if (document.visibilityState === "hidden") return;
      router.refresh();
    }, EMAIL_STATUS_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, router]);

  return (
    <p
      // Announced politely rather than assertively: this is a background fact
      // about the list, not something that should interrupt what a staff member
      // is reading.
      aria-live="polite"
      className="flex items-center gap-2.5 text-[15px] text-ink-muted"
    >
      <span
        aria-hidden="true"
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          active ? "bg-info" : "bg-ready"
        }`}
      />
      {active ? "Checking delivery updates..." : restingLabel}
    </p>
  );
}

/**
 * The plain sentence the indicator's tooltip and the page description share.
 *
 * Built from the status list itself so it can never name a status the polling
 * rule does not actually wait on.
 */
export const UNRESOLVED_STATUS_SENTENCE = STUDENT_EMAIL_UNRESOLVED_STATUSES.map(
  (status) => STUDENT_EMAIL_STATUS_LABELS[status],
).join(", ");
