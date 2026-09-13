"use client";

import Link from "next/link";
import { useActionState } from "react";

import { emptyFormState, type FormState } from "@/lib/forms/state";
import {
  DEFAULT_PROGRAM,
  DEFAULT_PROVINCE,
  DOCUMENT_STATUS_LABELS,
  PLACEMENT_STATUSES,
  PLACEMENT_STATUS_LABELS,
  PROGRAM_OPTIONS,
  PROVINCE_OPTIONS,
} from "@/lib/placement/constants";
import type { BatchRow, StudentRow } from "@/lib/supabase/database.types";

const INPUT_CLASSES =
  "h-14 w-full rounded-2xl border border-line bg-surface px-5 text-[17px] text-ink outline-none focus:border-brand";
const SELECT_CLASSES = INPUT_CLASSES;

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-[16px] font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p className="text-[15px] text-ink-muted">{hint}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[15px] text-attention-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type StudentFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  student?: StudentRow;
  batches: BatchRow[];
  submitLabel: string;
  cancelHref: string;
};

/**
 * One form used by both Add Student and Edit Student so the field architecture
 * stays identical. The database id is never editable.
 */
export default function StudentForm({
  action,
  student,
  batches,
  submitLabel,
  cancelHref,
}: StudentFormProps) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const errors = state.fieldErrors;

  const selectableBatches = batches.filter(
    (batch) => batch.status === "active" || batch.id === student?.batch_id,
  );

  return (
    <form action={formAction} className="flex flex-col gap-10">
      {student ? (
        <input type="hidden" name="student_id" value={student.id} />
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink"
        >
          {state.error}
        </p>
      ) : null}

      <fieldset className="rounded-3xl border border-line bg-surface p-7 sm:p-8">
        <legend className="px-2 text-[22px] font-semibold tracking-tight text-ink">
          Student
        </legend>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Field
            label="Student Number"
            htmlFor="student_number"
            error={errors.student_number}
          >
            <input
              id="student_number"
              name="student_number"
              required
              defaultValue={student?.student_number ?? ""}
              className={INPUT_CLASSES}
            />
          </Field>

          <Field label="Program" htmlFor="program" error={errors.program}>
            <select
              id="program"
              name="program"
              defaultValue={student?.program ?? DEFAULT_PROGRAM}
              className={SELECT_CLASSES}
            >
              {PROGRAM_OPTIONS.map((program) => (
                <option key={program} value={program}>
                  {program}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="First Name"
            htmlFor="first_name"
            error={errors.first_name}
          >
            <input
              id="first_name"
              name="first_name"
              required
              defaultValue={student?.first_name ?? ""}
              className={INPUT_CLASSES}
            />
          </Field>

          <Field
            label="Middle Name"
            htmlFor="middle_name"
            error={errors.middle_name}
          >
            <input
              id="middle_name"
              name="middle_name"
              defaultValue={student?.middle_name ?? ""}
              className={INPUT_CLASSES}
            />
          </Field>

          <Field label="Last Name" htmlFor="last_name" error={errors.last_name}>
            <input
              id="last_name"
              name="last_name"
              defaultValue={student?.last_name ?? ""}
              className={INPUT_CLASSES}
            />
          </Field>

          <Field label="Batch" htmlFor="batch_id" error={errors.batch_id}>
            <select
              id="batch_id"
              name="batch_id"
              defaultValue={student?.batch_id ?? ""}
              className={SELECT_CLASSES}
            >
              <option value="">No batch assigned</option>
              {selectableBatches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.name}
                  {batch.status === "archived" ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-3xl border border-line bg-surface p-7 sm:p-8">
        <legend className="px-2 text-[22px] font-semibold tracking-tight text-ink">
          Contact
        </legend>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Field label="Phone" htmlFor="phone" error={errors.phone}>
            <input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={student?.phone ?? ""}
              className={INPUT_CLASSES}
            />
          </Field>

          <Field label="Email" htmlFor="email" error={errors.email}>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={student?.email ?? ""}
              className={INPUT_CLASSES}
            />
          </Field>

          <div className="md:col-span-2">
            <Field
              label="Address"
              htmlFor="address_line"
              hint="The full address as written. City, province, and postal code are separate fields below."
              error={errors.address_line}
            >
              <input
                id="address_line"
                name="address_line"
                defaultValue={student?.address_line ?? ""}
                className={INPUT_CLASSES}
              />
            </Field>
          </div>

          <Field label="City" htmlFor="city" error={errors.city}>
            <input
              id="city"
              name="city"
              defaultValue={student?.city ?? ""}
              className={INPUT_CLASSES}
            />
          </Field>

          <Field label="Province" htmlFor="province" error={errors.province}>
            <select
              id="province"
              name="province"
              defaultValue={student?.province ?? DEFAULT_PROVINCE}
              className={SELECT_CLASSES}
            >
              <option value="">Not set</option>
              {PROVINCE_OPTIONS.map((province) => (
                <option key={province} value={province}>
                  {province}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Postal Code"
            htmlFor="postal_code"
            error={errors.postal_code}
          >
            <input
              id="postal_code"
              name="postal_code"
              defaultValue={student?.postal_code ?? ""}
              className={INPUT_CLASSES}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-3xl border border-line bg-surface p-7 sm:p-8">
        <legend className="px-2 text-[22px] font-semibold tracking-tight text-ink">
          Placement
        </legend>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Field
            label="Placement Status"
            htmlFor="placement_status"
            hint="Normally looked after for you: the document checklist moves a student up to Ready, and assigning a placement moves them on from there. Change it here only to correct a historical record."
            error={errors.placement_status}
          >
            <select
              id="placement_status"
              name="placement_status"
              defaultValue={student?.placement_status ?? "needs_review"}
              className={SELECT_CLASSES}
            >
              {PLACEMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PLACEMENT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex flex-col gap-2">
            <span className="text-[16px] font-medium text-ink">
              Document Status
            </span>
            <p className="flex h-14 items-center rounded-2xl border border-line bg-surface-muted px-5 text-[17px] text-ink">
              {DOCUMENT_STATUS_LABELS[student?.document_status ?? "not_reviewed"]}
            </p>
            <p className="text-[15px] text-ink-muted">
              Worked out from the document checklist, so it is never edited here.
              {student ? (
                <>
                  {" "}
                  <Link
                    href={`/students/${student.id}/documents`}
                    className="font-medium text-brand-strong hover:underline"
                  >
                    Open Placement Documents
                  </Link>
                </>
              ) : null}
            </p>
          </div>

          <div className="md:col-span-2">
            <label
              htmlFor="is_returning"
              className="flex items-start gap-4 rounded-2xl border border-line bg-surface-muted p-6"
            >
              <input
                id="is_returning"
                name="is_returning"
                type="checkbox"
                defaultChecked={student?.is_returning ?? false}
                className="mt-1 h-6 w-6 shrink-0 rounded border-line accent-[var(--brand)]"
              />
              <span>
                <span className="block text-[17px] font-medium text-ink">
                  Returning Student
                </span>
                <span className="mt-1 block text-[16px] text-ink-muted">
                  Shows this student in Previous / Returning Students. Their
                  batch stays as it is.
                </span>
              </span>
            </label>
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-2xl bg-brand px-7 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Saving..." : submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="rounded-2xl border border-line px-7 py-4 text-[17px] font-medium text-ink transition-colors hover:bg-surface-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
