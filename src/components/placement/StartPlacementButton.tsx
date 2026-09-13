"use client";

import { PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { emptyFormState, type FormState } from "@/lib/forms/state";
import { startPlacementAction } from "@/lib/placement/actions";

/** Today as "YYYY-MM-DD" in the reader's own day, never shifted by a timezone. */
function today(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Start a placement.
 *
 * The one step between assigning a student and finishing their placement, and
 * the line the two endings are drawn on: an assigned placement can still be
 * cancelled, a started one can only be finished. Starting is therefore a real
 * statement - this student is actually at this partner - and it is made
 * deliberately, with the day it happened.
 *
 * It records that day and nothing else. This is not a check-in and it is not
 * attendance; what happens during a placement is PLACEMENT-05.
 */
export default function StartPlacementButton({
  placementId,
  studentName,
  partnerName,
  plannedStartDate,
}: {
  placementId: string;
  studentName: string;
  partnerName: string;
  plannedStartDate: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(emptyFormState);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await startPlacementAction(emptyFormState, formData);
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
        className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
      >
        <PlayCircle size={20} aria-hidden="true" />
        Start Placement
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-line bg-surface-muted p-6"
    >
      <input type="hidden" name="placement_id" value={placementId} />

      <h3 className="text-[19px] font-semibold text-ink">
        Start {studentName}&apos;s placement at {partnerName}?
      </h3>
      <p className="mt-2 text-[16px] text-ink-muted">
        Once a placement has started it is finished rather than cancelled, so
        the student&apos;s time at this partner is always recorded.
      </p>

      {state.error ? (
        <p
          role="alert"
          className="mt-4 rounded-2xl border border-attention-line bg-attention-soft px-5 py-4 text-[16px] text-attention-ink"
        >
          {state.error}
        </p>
      ) : null}

      <label
        htmlFor={`actual_start_date-${placementId}`}
        className="mt-5 block text-[16px] font-medium text-ink"
      >
        Actual Start Date
      </label>
      <input
        id={`actual_start_date-${placementId}`}
        name="actual_start_date"
        type="date"
        defaultValue={plannedStartDate?.slice(0, 10) ?? today()}
        className="mt-2 h-14 w-full rounded-2xl border border-line bg-surface px-5 text-[17px] text-ink outline-none focus:border-brand sm:max-w-xs"
      />
      <p className="mt-2 text-[15px] text-ink-muted">
        Optional. The day they actually began, which is often not the day it was
        planned for.
      </p>
      {state.fieldErrors.actual_start_date ? (
        <p role="alert" className="mt-2 text-[15px] text-attention-ink">
          {state.fieldErrors.actual_start_date}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Starting..." : "Start Placement"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setState(emptyFormState);
          }}
          className="rounded-2xl border border-line bg-surface px-6 py-4 text-[17px] font-medium text-ink transition-colors hover:bg-surface-muted"
        >
          Not yet
        </button>
      </div>
    </form>
  );
}
