"use client";

import { PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import ActionDialog from "@/components/ui/ActionDialog";
import { formatDate } from "@/lib/format";
import { emptyFormState, type FormState } from "@/lib/forms/state";
import { startPlacementAction } from "@/lib/placement/actions";
import { todayKey } from "@/lib/placement/attention";

/**
 * Start a placement.
 *
 * The one step between assigning a student and finishing their placement, and
 * the line the two endings are drawn on: an assigned placement can still be
 * cancelled, a started one can only be finished. Starting is therefore a real
 * statement - this student is actually at this partner - and it is made
 * deliberately, with the day it happened.
 *
 * NOTHING STARTS BY ITSELF. A planned start date arriving, or going by, is an
 * observation the board shows and never an event: only a staff member knows
 * whether the student actually turned up, so only a staff member starts a
 * placement. The planned date is shown beside the actual one here for exactly
 * that reason - so the difference between the two is visible while the decision
 * is being made.
 *
 * It records that day and nothing else. This is not a check-in and it is not
 * attendance: there is no attendance in this application.
 *
 * Two presentations, one action. Inline on the student's own placement page,
 * where there is room, and in a dialog from a board card, where there is not.
 */
export default function StartPlacementButton({
  placementId,
  studentName,
  studentNumber,
  partnerName,
  plannedStartDate,
  presentation = "inline",
  size = "large",
}: {
  placementId: string;
  studentName: string;
  studentNumber?: string | null;
  partnerName: string;
  plannedStartDate: string | null;
  /** Inline on a detail page, or in a dialog from a board card. */
  presentation?: "inline" | "dialog";
  size?: "large" | "compact";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>(emptyFormState);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setState(emptyFormState);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await startPlacementAction(emptyFormState, formData);
      setState(result);
      if (result.error || Object.keys(result.fieldErrors).length > 0) return;

      close();
      router.refresh();
    });
  }

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={
        size === "compact"
          ? "inline-flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-strong"
          : "inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
      }
    >
      <PlayCircle size={size === "compact" ? 18 : 20} aria-hidden="true" />
      Start Placement
    </button>
  );

  const plannedStart = formatDate(plannedStartDate);

  const body = (
    <form onSubmit={submit}>
      <input type="hidden" name="placement_id" value={placementId} />

      {presentation === "inline" ? (
        <h3 className="text-[19px] font-semibold text-ink">
          Start {studentName}&apos;s placement at {partnerName}?
        </h3>
      ) : null}

      {/* The three facts staff are confirming, spelled out rather than implied
          by whichever card the button was pressed on. */}
      <dl className="mt-3 grid gap-3 rounded-2xl border border-line bg-surface px-5 py-4 sm:grid-cols-2">
        <div>
          <dt className="text-[15px] text-ink-muted">Student</dt>
          <dd className="mt-0.5 break-words text-[17px] font-medium text-ink">
            {studentName}
            {studentNumber ? (
              <span className="font-normal text-ink-muted"> - {studentNumber}</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-[15px] text-ink-muted">Placement Partner</dt>
          <dd className="mt-0.5 break-words text-[17px] font-medium text-ink">
            {partnerName}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[15px] text-ink-muted">Planned Start Date</dt>
          <dd className="mt-0.5 text-[17px] text-ink">
            {plannedStart ?? "No planned start date was recorded"}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-[16px] text-ink-muted">
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
        defaultValue={todayKey()}
        className="mt-2 h-14 w-full rounded-2xl border border-line bg-surface px-5 text-[17px] text-ink outline-none focus:border-brand sm:max-w-xs"
      />
      <p className="mt-2 text-[15px] text-ink-muted">
        Defaults to today. Change it if they began on a different day, which is
        often not the day it was planned for.
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
          onClick={close}
          className="rounded-2xl border border-line bg-surface px-6 py-4 text-[17px] font-medium text-ink transition-colors hover:bg-surface-muted"
        >
          Not yet
        </button>
      </div>
    </form>
  );

  if (presentation === "inline") {
    if (!open) return trigger;
    return (
      <div className="rounded-2xl border border-line bg-surface-muted p-6">
        {body}
      </div>
    );
  }

  return (
    <>
      {trigger}
      <ActionDialog
        open={open}
        onClose={close}
        title="Start Placement"
        subtitle={`${studentName} at ${partnerName}`}
      >
        {body}
      </ActionDialog>
    </>
  );
}
