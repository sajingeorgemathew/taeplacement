"use client";

import { XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { emptyFormState, type FormState } from "@/lib/forms/state";
import { cancelPlacementAction } from "@/lib/placement/actions";

/**
 * Cancel an assignment.
 *
 * Only ever offered on an ASSIGNED placement, because cancelling means the
 * placement never meaningfully started. A student who has already begun was not
 * cancelled, and that placement is finished as Ended Early instead.
 *
 * So this is deliberately much smaller than Finish Placement. No outcome to
 * choose, no hours to credit, and it never asks whether this completes the
 * student's placement requirement: nothing happened at this partner, so there
 * is nothing to have completed.
 *
 * Two steps, with the consequence spelled out before the button that does it.
 * Nothing is deleted: the row stays as history, and the student goes back to
 * whatever their documents say, not to a guess at another partner.
 */
export default function CancelAssignmentButton({
  placementId,
  studentName,
  partnerName,
}: {
  placementId: string;
  studentName: string;
  partnerName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(emptyFormState);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await cancelPlacementAction(emptyFormState, formData);
      setState(result);
      if (result.error || Object.keys(result.fieldErrors).length > 0) return;

      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-2xl border border-attention-line px-6 py-4 text-[17px] font-medium text-attention-ink transition-colors hover:bg-attention-soft"
      >
        <XCircle size={20} aria-hidden="true" />
        Cancel Assignment
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-attention-line bg-attention-soft p-6"
    >
      <input type="hidden" name="placement_id" value={placementId} />

      <h3 className="text-[19px] font-semibold text-attention-ink">
        Cancel {studentName}&apos;s assignment at {partnerName}?
      </h3>
      <p className="mt-2 text-[16px] text-attention-ink">
        Use this when the placement never meaningfully started. The record is
        kept as history, no hours are credited, and {studentName} goes back to
        the status their documents put them in. No other partner is chosen for
        them.
      </p>
      <p className="mt-2 text-[16px] text-attention-ink">
        If they have already been at this partner, go back and start the
        placement instead, then finish it as Ended Early so their hours count.
      </p>

      {state.error ? (
        <p
          role="alert"
          className="mt-4 text-[16px] font-medium text-attention-ink"
        >
          {state.error}
        </p>
      ) : null}

      <label
        htmlFor={`cancellation_reason-${placementId}`}
        className="mt-5 block text-[16px] font-medium text-attention-ink"
      >
        Why is it being cancelled? Optional.
      </label>
      <input
        id={`cancellation_reason-${placementId}`}
        name="cancellation_reason"
        type="text"
        maxLength={200}
        placeholder="The partner postponed their intake"
        className="mt-2 h-14 w-full rounded-2xl border border-line bg-surface px-5 text-[17px] text-ink outline-none focus:border-brand"
      />
      {state.fieldErrors.cancellation_reason ? (
        <p role="alert" className="mt-2 text-[15px] text-attention-ink">
          {state.fieldErrors.cancellation_reason}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-2xl bg-attention px-6 py-4 text-[17px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Cancelling..." : "Cancel Assignment"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setState(emptyFormState);
          }}
          className="rounded-2xl border border-line bg-surface px-6 py-4 text-[17px] font-medium text-ink transition-colors hover:bg-surface-muted"
        >
          Keep the assignment
        </button>
      </div>
    </form>
  );
}
