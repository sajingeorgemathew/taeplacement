"use client";

import { useActionState } from "react";

import { emptyFormState } from "@/lib/forms/state";
import { formatDateOnly } from "@/lib/format";
import { updateFollowUpAction } from "@/lib/partners/actions";
import { dateInputValue } from "@/lib/partners/schema";

const INPUT_CLASSES =
  "h-14 w-full rounded-2xl border border-line bg-surface px-5 text-[17px] text-ink outline-none focus:border-brand";

type FollowUpSectionProps = {
  partnerId: string;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  canManage: boolean;
};

/**
 * Last Contacted and Next Follow-up.
 *
 * Two dates and a save button. This is deliberately not a task or reminder
 * system: nothing is scheduled, notified, or assigned here.
 */
export default function FollowUpSection({
  partnerId,
  lastContactedAt,
  nextFollowUpAt,
  canManage,
}: FollowUpSectionProps) {
  const [state, formAction, pending] = useActionState(
    updateFollowUpAction,
    emptyFormState,
  );

  if (!canManage) {
    return (
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface-muted p-5">
          <dt className="text-[15px] text-ink-muted">Last Contacted</dt>
          <dd className="mt-1 text-[18px] text-ink">
            {formatDateOnly(lastContactedAt) ?? "Not recorded"}
          </dd>
        </div>
        <div className="rounded-2xl border border-line bg-surface-muted p-5">
          <dt className="text-[15px] text-ink-muted">Next Follow-up</dt>
          <dd className="mt-1 text-[18px] text-ink">
            {formatDateOnly(nextFollowUpAt) ?? "None set"}
          </dd>
        </div>
      </dl>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="partner_id" value={partnerId} />

      {state.error ? (
        <p
          role="alert"
          className="rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="last_contacted_at"
            className="text-[16px] font-medium text-ink"
          >
            Last Contacted
          </label>
          <input
            id="last_contacted_at"
            name="last_contacted_at"
            type="date"
            // Remounts when the stored value changes so the input keeps up.
            key={`last-${lastContactedAt ?? "none"}`}
            defaultValue={dateInputValue(lastContactedAt)}
            className={INPUT_CLASSES}
          />
          {state.fieldErrors.last_contacted_at ? (
            <p role="alert" className="text-[15px] text-attention-ink">
              {state.fieldErrors.last_contacted_at}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="next_follow_up_at"
            className="text-[16px] font-medium text-ink"
          >
            Next Follow-up
          </label>
          <input
            id="next_follow_up_at"
            name="next_follow_up_at"
            type="date"
            key={`next-${nextFollowUpAt ?? "none"}`}
            defaultValue={dateInputValue(nextFollowUpAt)}
            className={INPUT_CLASSES}
          />
          {state.fieldErrors.next_follow_up_at ? (
            <p role="alert" className="text-[15px] text-attention-ink">
              {state.fieldErrors.next_follow_up_at}
            </p>
          ) : null}
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-2xl border border-line px-7 py-4 text-[17px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save Follow-up"}
      </button>
    </form>
  );
}
