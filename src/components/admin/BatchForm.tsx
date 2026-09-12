"use client";

import { useActionState } from "react";

import { emptyFormState, type FormState } from "@/lib/forms/state";
import {
  BATCH_STATUSES,
  BATCH_STATUS_LABELS,
  DEFAULT_PROGRAM,
  PROGRAM_OPTIONS,
} from "@/lib/placement/constants";
import type { BatchRow } from "@/lib/supabase/database.types";

const INPUT_CLASSES =
  "h-14 w-full rounded-2xl border border-line bg-surface px-5 text-[17px] text-ink outline-none focus:border-brand";

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-[16px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[15px] text-attention-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type BatchFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  batch?: BatchRow;
  submitLabel: string;
  onDone?: () => void;
  /** Unique prefix so several forms on this page keep distinct field ids. */
  idPrefix: string;
};

/** Shared Create Batch and Edit Batch fields. */
export default function BatchForm({
  action,
  batch,
  submitLabel,
  onDone,
  idPrefix,
}: BatchFormProps) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const errors = state.fieldErrors;
  const id = (field: string) => `${idPrefix}-${field}`;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {batch ? <input type="hidden" name="batch_id" value={batch.id} /> : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Field label="Name" htmlFor={id("name")} error={errors.name}>
          <input
            id={id("name")}
            name="name"
            required
            defaultValue={batch?.name ?? ""}
            placeholder="April 27, 2026"
            className={INPUT_CLASSES}
          />
        </Field>

        <Field label="Program" htmlFor={id("program")} error={errors.program}>
          <select
            id={id("program")}
            name="program"
            defaultValue={batch?.program ?? DEFAULT_PROGRAM}
            className={INPUT_CLASSES}
          >
            {PROGRAM_OPTIONS.map((program) => (
              <option key={program} value={program}>
                {program}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Start Date"
          htmlFor={id("start_date")}
          error={errors.start_date}
        >
          <input
            id={id("start_date")}
            name="start_date"
            type="date"
            defaultValue={batch?.start_date ?? ""}
            className={INPUT_CLASSES}
          />
        </Field>

        <Field
          label="Schedule"
          htmlFor={id("schedule_label")}
          error={errors.schedule_label}
        >
          <input
            id={id("schedule_label")}
            name="schedule_label"
            defaultValue={batch?.schedule_label ?? ""}
            placeholder="Morning"
            className={INPUT_CLASSES}
          />
        </Field>

        <Field label="Status" htmlFor={id("status")} error={errors.status}>
          <select
            id={id("status")}
            name="status"
            defaultValue={batch?.status ?? "active"}
            className={INPUT_CLASSES}
          >
            {BATCH_STATUSES.map((status) => (
              <option key={status} value={status}>
                {BATCH_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Sort Order"
          htmlFor={id("sort_order")}
          error={errors.sort_order}
        >
          <input
            id={id("sort_order")}
            name="sort_order"
            type="number"
            step="1"
            defaultValue={batch?.sort_order ?? ""}
            className={INPUT_CLASSES}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-2xl bg-brand px-7 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Saving..." : submitLabel}
        </button>
        {onDone ? (
          <button
            type="button"
            onClick={onDone}
            className="rounded-2xl border border-line px-7 py-4 text-[17px] font-medium text-ink transition-colors hover:bg-surface-muted"
          >
            Close
          </button>
        ) : null}
      </div>
    </form>
  );
}
