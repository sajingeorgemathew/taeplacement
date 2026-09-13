"use client";

import { useActionState } from "react";

import { emptyFormState } from "@/lib/forms/state";
import { updatePlacementDatesAction } from "@/lib/placement/actions";
import { dateInputValue } from "@/lib/placement/schema";

const INPUT_CLASSES =
  "h-14 w-full rounded-2xl border border-line bg-surface px-5 text-[17px] text-ink outline-none focus:border-brand";

/**
 * The planning fields on a live placement.
 *
 * Only the dates and the note. The PARTNER is never edited here: moving a
 * student somewhere else is a cancellation and a new assignment, so the history
 * keeps saying what actually happened.
 */
export default function PlacementDatesForm({
  placementId,
  plannedStartDate,
  plannedEndDate,
  assignmentNote,
}: {
  placementId: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  assignmentNote: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    updatePlacementDatesAction,
    emptyFormState,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-6 border-t border-line pt-7"
    >
      <input type="hidden" name="placement_id" value={placementId} />

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
            htmlFor="planned_start_date"
            className="text-[16px] font-medium text-ink"
          >
            Planned Start Date
          </label>
          <input
            id="planned_start_date"
            name="planned_start_date"
            type="date"
            // Remounts when the stored value changes so the form keeps up.
            key={`start-${plannedStartDate ?? "none"}`}
            defaultValue={dateInputValue(plannedStartDate)}
            className={INPUT_CLASSES}
          />
          {state.fieldErrors.planned_start_date ? (
            <p role="alert" className="text-[15px] text-attention-ink">
              {state.fieldErrors.planned_start_date}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="planned_end_date"
            className="text-[16px] font-medium text-ink"
          >
            Planned End Date
          </label>
          <input
            id="planned_end_date"
            name="planned_end_date"
            type="date"
            key={`end-${plannedEndDate ?? "none"}`}
            defaultValue={dateInputValue(plannedEndDate)}
            className={INPUT_CLASSES}
          />
          {state.fieldErrors.planned_end_date ? (
            <p role="alert" className="text-[15px] text-attention-ink">
              {state.fieldErrors.planned_end_date}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <label
            htmlFor="assignment_note"
            className="text-[16px] font-medium text-ink"
          >
            Assignment Note
          </label>
          <textarea
            id="assignment_note"
            name="assignment_note"
            rows={3}
            maxLength={500}
            key={`note-${assignmentNote ?? "none"}`}
            defaultValue={assignmentNote ?? ""}
            className="w-full rounded-2xl border border-line bg-surface px-5 py-4 text-[17px] text-ink outline-none focus:border-brand"
          />
          <p className="text-[15px] text-ink-muted">
            One short line about this assignment, not a running log.
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-2xl border border-line px-7 py-4 text-[17px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60"
      >
        {pending ? "Saving..." : "Save Placement Details"}
      </button>
    </form>
  );
}
