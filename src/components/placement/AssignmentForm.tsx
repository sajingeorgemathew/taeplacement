"use client";

import Link from "next/link";
import { useActionState } from "react";

import { emptyFormState } from "@/lib/forms/state";
import { assignPlacementAction } from "@/lib/placement/actions";

const INPUT_CLASSES =
  "h-14 w-full rounded-2xl border border-line bg-surface px-5 text-[17px] text-ink outline-none focus:border-brand";

type AssignmentFormProps = {
  studentId: string;
  studentName: string;
  partnerId: string;
  partnerName: string;
  /** Back to the partner search, keeping the current filters. */
  changePartnerHref: string;
};

function Field({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface-muted p-5">
      <p className="text-[15px] text-ink-muted">{label}</p>
      <p className="mt-1 break-words text-[19px] font-semibold text-ink">
        {value}
      </p>
    </div>
  );
}

/**
 * The assignment confirmation.
 *
 * Deliberately short: who, where, and the two dates and one note staff may
 * already know. Nothing here is required except the student and the partner,
 * which are both already decided by the time this form is on screen. A
 * placement that is real today should never wait on a start date nobody has
 * agreed yet.
 */
export default function AssignmentForm({
  studentId,
  studentName,
  partnerId,
  partnerName,
  changePartnerHref,
}: AssignmentFormProps) {
  const [state, formAction, pending] = useActionState(
    assignPlacementAction,
    emptyFormState,
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="partner_id" value={partnerId} />

      {state.error ? (
        <p
          role="alert"
          className="rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Student" value={studentName} />
        <Field label="Placement Partner" value={partnerName} />
      </div>

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
            className={INPUT_CLASSES}
          />
          <p className="text-[15px] text-ink-muted">
            Optional. Leave it empty until the partner confirms.
          </p>
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
            className={INPUT_CLASSES}
          />
          <p className="text-[15px] text-ink-muted">Optional.</p>
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
            placeholder="Confirmed with the placement coordinator by phone."
            className="w-full rounded-2xl border border-line bg-surface px-5 py-4 text-[17px] text-ink outline-none focus:border-brand"
          />
          <p className="text-[15px] text-ink-muted">
            Optional. One short line about this assignment. Ongoing notes about
            the student stay in the student&apos;s own comments.
          </p>
          {state.fieldErrors.assignment_note ? (
            <p role="alert" className="text-[15px] text-attention-ink">
              {state.fieldErrors.assignment_note}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-2xl bg-brand px-7 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Assigning..." : "Assign Placement"}
        </button>
        <Link
          href={changePartnerHref}
          className="rounded-2xl border border-line px-7 py-4 text-[17px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
        >
          Choose a different partner
        </Link>
      </div>
    </form>
  );
}
