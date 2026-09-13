"use client";

import { useActionState } from "react";

import StatusPill from "@/components/ui/StatusPill";
import { emptyFormState } from "@/lib/forms/state";
import { formatDate, formatTimestamp } from "@/lib/format";
import { updateAvailabilityAction } from "@/lib/partners/actions";
import { dateInputValue } from "@/lib/partners/schema";
import {
  AVAILABILITY_STATUSES,
  AVAILABILITY_STATUS_LABELS,
  AVAILABILITY_STATUS_TONES,
  DEFAULT_AVAILABILITY_STATUS,
  type AvailabilityStatus,
} from "@/lib/placement/constants";

const INPUT_CLASSES =
  "h-14 w-full rounded-2xl border border-line bg-surface px-5 text-[17px] text-ink outline-none focus:border-brand";

type AvailabilitySectionProps = {
  partnerId: string;
  availabilityStatus: AvailabilityStatus;
  nextIntakeDate: string | null;
  availabilityNote: string | null;
  availabilityCheckedAt: string | null;
  canManage: boolean;
};

function Summary({
  availabilityStatus,
  nextIntakeDate,
  availabilityNote,
  availabilityCheckedAt,
}: Omit<AvailabilitySectionProps, "partnerId" | "canManage">) {
  const intake = formatDate(nextIntakeDate);
  const checked = formatTimestamp(availabilityCheckedAt);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill
          label={AVAILABILITY_STATUS_LABELS[availabilityStatus]}
          tone={AVAILABILITY_STATUS_TONES[availabilityStatus]}
          size="large"
        />
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface-muted p-5">
          <dt className="text-[15px] text-ink-muted">Next Intake Date</dt>
          <dd className="mt-1 text-[18px] text-ink">{intake ?? "Not set"}</dd>
        </div>
        <div className="rounded-2xl border border-line bg-surface-muted p-5">
          <dt className="text-[15px] text-ink-muted">Last Checked</dt>
          <dd className="mt-1 text-[18px] text-ink">
            {checked ?? "Never checked"}
          </dd>
        </div>
        <div className="rounded-2xl border border-line bg-surface-muted p-5 sm:col-span-2">
          <dt className="text-[15px] text-ink-muted">Availability Note</dt>
          <dd className="mt-1 whitespace-pre-line break-words text-[17px] text-ink">
            {availabilityNote ?? "No note"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Placement Availability on the partner detail page.
 *
 * Four operational facts about the organization: are they taking students, when
 * is their next intake, when did staff last verify that, and is there a short
 * note about it. Nothing here is a student assignment, a reserved slot, or a
 * capacity number.
 *
 * Last Checked only moves when staff tick the box, so an edit to the note never
 * makes a year-old answer look freshly confirmed.
 */
export default function AvailabilitySection({
  partnerId,
  availabilityStatus,
  nextIntakeDate,
  availabilityNote,
  availabilityCheckedAt,
  canManage,
}: AvailabilitySectionProps) {
  const [state, formAction, pending] = useActionState(
    updateAvailabilityAction,
    emptyFormState,
  );

  const summary = (
    <Summary
      availabilityStatus={availabilityStatus}
      nextIntakeDate={nextIntakeDate}
      availabilityNote={availabilityNote}
      availabilityCheckedAt={availabilityCheckedAt}
    />
  );

  if (!canManage) return summary;

  return (
    <div className="flex flex-col gap-7">
      {summary}

      <form
        action={formAction}
        className="flex flex-col gap-6 border-t border-line pt-7"
      >
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
              htmlFor="availability_status"
              className="text-[16px] font-medium text-ink"
            >
              Availability Status
            </label>
            <select
              id="availability_status"
              name="availability_status"
              // Remounts when the stored value changes so the form keeps up.
              key={`status-${availabilityStatus}`}
              defaultValue={availabilityStatus ?? DEFAULT_AVAILABILITY_STATUS}
              className={INPUT_CLASSES}
            >
              {AVAILABILITY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {AVAILABILITY_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            {state.fieldErrors.availability_status ? (
              <p role="alert" className="text-[15px] text-attention-ink">
                {state.fieldErrors.availability_status}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="next_intake_date"
              className="text-[16px] font-medium text-ink"
            >
              Next Intake Date
            </label>
            <input
              id="next_intake_date"
              name="next_intake_date"
              type="date"
              key={`intake-${nextIntakeDate ?? "none"}`}
              defaultValue={dateInputValue(nextIntakeDate)}
              className={INPUT_CLASSES}
            />
            <p className="text-[15px] text-ink-muted">
              Optional. Only useful when an intake is still ahead.
            </p>
            {state.fieldErrors.next_intake_date ? (
              <p role="alert" className="text-[15px] text-attention-ink">
                {state.fieldErrors.next_intake_date}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <label
              htmlFor="availability_note"
              className="text-[16px] font-medium text-ink"
            >
              Availability Note
            </label>
            <textarea
              id="availability_note"
              name="availability_note"
              rows={3}
              key={`note-${availabilityNote ?? "none"}`}
              defaultValue={availabilityNote ?? ""}
              placeholder="Current cohort is full. Check again in January."
              className="w-full rounded-2xl border border-line bg-surface px-5 py-4 text-[17px] text-ink outline-none focus:border-brand"
            />
            <p className="text-[15px] text-ink-muted">
              Optional. One short operational line, not a running log.
            </p>
            {state.fieldErrors.availability_note ? (
              <p role="alert" className="text-[15px] text-attention-ink">
                {state.fieldErrors.availability_note}
              </p>
            ) : null}
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-2xl border border-line bg-surface-muted p-5">
          <input
            id="availability_checked"
            name="availability_checked"
            type="checkbox"
            defaultChecked
            className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]"
          />
          <span className="text-[16px] text-ink">
            I checked this with the partner
            <span className="mt-1 block text-[15px] text-ink-muted">
              Sets Last Checked to now. Clear it if you are only fixing a typo.
            </span>
          </span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-2xl border border-line px-7 py-4 text-[17px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save Availability"}
        </button>
      </form>
    </div>
  );
}
