"use client";

import { CheckCircle2, Flag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import ActionDialog from "@/components/ui/ActionDialog";
import { formatDate } from "@/lib/format";
import { emptyFormState, type FormState } from "@/lib/forms/state";
import { finishPlacementAction } from "@/lib/placement/actions";
import { todayKey } from "@/lib/placement/attention";
import {
  PLACEMENT_OUTCOMES,
  PLACEMENT_OUTCOME_DESCRIPTIONS,
  PLACEMENT_OUTCOME_LABELS,
  type PlacementOutcome,
} from "@/lib/placement/constants";

const INPUT_CLASSES =
  "h-14 w-full rounded-2xl border border-line bg-surface px-5 text-[17px] text-ink outline-none focus:border-brand";

/**
 * Finish one placement the student actually started.
 *
 * Two questions, in the order staff actually think about them:
 *
 *   1. What happened AT THIS PARTNER? Completed, or ended early.
 *   2. Does that finish the student's WHOLE placement requirement?
 *
 * The second is never inferred from the first. A student may complete a
 * placement at one partner and still owe hours; a student may end one early and
 * have nothing left to do. Only staff know which, so the form asks, and
 * answering no puts the student back on the board to be placed somewhere else.
 *
 * Cancellation is not here. An assignment that never meaningfully started is
 * cancelled from the assignment itself, and none of these questions apply to
 * it: there are no hours, no outcome, and nothing to have completed.
 */
export default function FinishPlacementForm({
  placementId,
  studentName,
  studentNumber,
  partnerName,
  actualStartDate = null,
  plannedEndDate = null,
  presentation = "inline",
  size = "large",
}: {
  placementId: string;
  studentName: string;
  studentNumber?: string | null;
  partnerName: string;
  /** Shown as context. The day the placement being finished actually began. */
  actualStartDate?: string | null;
  plannedEndDate?: string | null;
  /** Inline on a detail page, or in a dialog from a board card. */
  presentation?: "inline" | "dialog";
  size?: "large" | "compact";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<PlacementOutcome>("completed");
  const [completes, setCompletes] = useState<"yes" | "no" | "">("");
  const [state, setState] = useState<FormState>(emptyFormState);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setState(emptyFormState);
  }

  /**
   * Submitted by hand rather than through useActionState, because finishing a
   * placement has an after: the panel closes and the page reloads the new
   * history, the new student status, and the board behind them.
   */
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await finishPlacementAction(emptyFormState, formData);
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
          ? "inline-flex items-center gap-1.5 rounded-xl border border-ready-line bg-ready-soft px-3.5 py-2.5 text-[15px] font-semibold text-ready-ink transition-colors hover:bg-white"
          : "inline-flex items-center gap-2 rounded-2xl border border-line px-6 py-4 text-[17px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
      }
    >
      <Flag size={size === "compact" ? 18 : 20} aria-hidden="true" />
      Finish Placement
    </button>
  );

  const body = (
    <form onSubmit={submit}>
      <input type="hidden" name="placement_id" value={placementId} />

      {presentation === "inline" ? (
        <h3 className="text-[20px] font-semibold text-ink">
          Finish {studentName}&apos;s placement at {partnerName}
        </h3>
      ) : null}

      {/* Which placement is being finished, said plainly. A student may have had
          more than one, and only one of them is running now. */}
      <dl className="mt-3 grid gap-3 rounded-2xl border border-line bg-surface px-5 py-4 sm:grid-cols-2">
        <div>
          <dt className="text-[15px] text-ink-muted">Student</dt>
          <dd className="mt-0.5 break-words text-[17px] font-medium text-ink">
            {studentName}
            {studentNumber ? (
              <span className="font-normal text-ink-muted">
                {" "}
                - {studentNumber}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-[15px] text-ink-muted">Placement Partner</dt>
          <dd className="mt-0.5 break-words text-[17px] font-medium text-ink">
            {partnerName}
          </dd>
        </div>
        <div>
          <dt className="text-[15px] text-ink-muted">Actual Start</dt>
          <dd className="mt-0.5 text-[17px] text-ink">
            {formatDate(actualStartDate) ?? "Not recorded"}
          </dd>
        </div>
        <div>
          <dt className="text-[15px] text-ink-muted">Planned End</dt>
          <dd className="mt-0.5 text-[17px] text-ink">
            {formatDate(plannedEndDate) ?? "Not recorded"}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-[16px] text-ink-muted">
        The record is kept as history, with its dates, its credited hours, and
        its note. Nothing is deleted.
      </p>

      {state.error ? (
        <p
          role="alert"
          className="mt-5 rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink"
        >
          {state.error}
        </p>
      ) : null}

      <fieldset className="mt-6">
        <legend className="text-[17px] font-semibold text-ink">
          What happened at this partner?
        </legend>
        <div className="mt-3 flex flex-col gap-3">
          {PLACEMENT_OUTCOMES.map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${
                outcome === value
                  ? "border-brand bg-brand-soft"
                  : "border-line bg-surface hover:border-brand"
              }`}
            >
              <input
                type="radio"
                name="outcome"
                value={value}
                checked={outcome === value}
                onChange={() => setOutcome(value)}
                className="mt-1.5 h-5 w-5 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-[17px] font-medium text-ink">
                  {PLACEMENT_OUTCOME_LABELS[value]}
                </span>
                <span className="mt-0.5 block text-[15px] text-ink-muted">
                  {PLACEMENT_OUTCOME_DESCRIPTIONS[value]}
                </span>
              </span>
            </label>
          ))}
        </div>

        {state.fieldErrors.outcome ? (
          <p role="alert" className="mt-2 text-[15px] text-attention-ink">
            {state.fieldErrors.outcome}
          </p>
        ) : null}
      </fieldset>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="actual_end_date"
            className="text-[16px] font-medium text-ink"
          >
            Actual End Date
          </label>
          <input
            id="actual_end_date"
            name="actual_end_date"
            type="date"
            defaultValue={todayKey()}
            className={INPUT_CLASSES}
          />
          {state.fieldErrors.actual_end_date ? (
            <p role="alert" className="text-[15px] text-attention-ink">
              {state.fieldErrors.actual_end_date}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="credited_hours"
            className="text-[16px] font-medium text-ink"
          >
            Credited Hours
          </label>
          <input
            id="credited_hours"
            name="credited_hours"
            type="number"
            min={0}
            max={9999}
            step="0.5"
            inputMode="decimal"
            placeholder="120"
            className={INPUT_CLASSES}
          />
          <p className="text-[15px] text-ink-muted">
            Optional. The hours you accept for this placement. Not a timesheet.
          </p>
          {state.fieldErrors.credited_hours ? (
            <p role="alert" className="text-[15px] text-attention-ink">
              {state.fieldErrors.credited_hours}
            </p>
          ) : null}
        </div>

        {outcome === "ended_early" ? (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label
              htmlFor="end_reason"
              className="text-[16px] font-medium text-ink"
            >
              Why did it end early? Optional.
            </label>
            <input
              id="end_reason"
              name="end_reason"
              type="text"
              maxLength={200}
              placeholder="Transferring to a partner closer to home"
              className={INPUT_CLASSES}
            />
            {state.fieldErrors.end_reason ? (
              <p role="alert" className="text-[15px] text-attention-ink">
                {state.fieldErrors.end_reason}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:col-span-2">
          <label
            htmlFor="completion_note"
            className="text-[16px] font-medium text-ink"
          >
            Completion / Transfer Note
          </label>
          <textarea
            id="completion_note"
            name="completion_note"
            rows={3}
            maxLength={500}
            className="w-full rounded-2xl border border-line bg-surface px-5 py-4 text-[17px] text-ink outline-none focus:border-brand"
          />
          <p className="text-[15px] text-ink-muted">
            Optional. One short note about how this placement finished, or where
            the student went next.
          </p>
          {state.fieldErrors.completion_note ? (
            <p role="alert" className="text-[15px] text-attention-ink">
              {state.fieldErrors.completion_note}
            </p>
          ) : null}
        </div>
      </div>

      <fieldset className="mt-7 rounded-2xl border border-line bg-surface p-5">
        <legend className="px-2 text-[17px] font-semibold text-ink">
          Does this complete {studentName}&apos;s full placement requirement?
        </legend>
        <p className="text-[16px] text-ink-muted">
          A different question from whether the placement here finished. A
          student may complete part of their placement at one partner and the
          rest at another.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="completes_requirement"
              value="no"
              required
              checked={completes === "no"}
              onChange={() => setCompletes("no")}
              className="mt-1.5 h-5 w-5 shrink-0"
            />
            <span className="min-w-0 text-[16px] text-ink">
              <span className="font-medium">No, there is placement left.</span>{" "}
              {studentName} returns to the board and can be assigned to another
              partner.
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="completes_requirement"
              value="yes"
              required
              checked={completes === "yes"}
              onChange={() => setCompletes("yes")}
              className="mt-1.5 h-5 w-5 shrink-0"
            />
            <span className="min-w-0 text-[16px] text-ink">
              <span className="font-medium">
                Yes, their placement is finished.
              </span>{" "}
              {studentName} becomes Placement Completed and leaves the working
              board.
            </span>
          </label>
        </div>

        {state.fieldErrors.completes_requirement ? (
          <p role="alert" className="mt-2 text-[15px] text-attention-ink">
            {state.fieldErrors.completes_requirement}
          </p>
        ) : null}
      </fieldset>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
        >
          <CheckCircle2 size={20} aria-hidden="true" />
          {pending ? "Finishing..." : "Finish Placement"}
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-2xl border border-line bg-surface px-6 py-4 text-[17px] font-medium text-ink transition-colors hover:bg-surface-muted"
        >
          Keep the placement
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
        title="Finish Placement"
        subtitle={`${studentName} at ${partnerName}`}
      >
        {body}
      </ActionDialog>
    </>
  );
}
