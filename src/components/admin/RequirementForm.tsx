"use client";

import { useActionState } from "react";

import { emptyFormState, type FormState } from "@/lib/forms/state";
import type { DocumentRequirementRow } from "@/lib/supabase/database.types";

const INPUT_CLASSES =
  "h-14 w-full rounded-2xl border border-line bg-surface px-5 text-[17px] text-ink outline-none focus:border-brand";

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

type RequirementFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  requirement?: DocumentRequirementRow;
  submitLabel: string;
  onDone?: () => void;
  /** Unique prefix so several forms on this page keep distinct field ids. */
  idPrefix: string;
  /** Default order for a brand new requirement, placed after the current last. */
  defaultSortOrder?: number;
};

/** Shared Add Document and Edit Document fields. */
export default function RequirementForm({
  action,
  requirement,
  submitLabel,
  onDone,
  idPrefix,
  defaultSortOrder = 0,
}: RequirementFormProps) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const errors = state.fieldErrors;
  const id = (field: string) => `${idPrefix}-${field}`;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {requirement ? (
        <input type="hidden" name="requirement_id" value={requirement.id} />
      ) : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <Field
            label="Document Name"
            htmlFor={id("name")}
            hint="The full name staff will see on the checklist."
            error={errors.name}
          >
            <input
              id={id("name")}
              name="name"
              required
              defaultValue={requirement?.name ?? ""}
              placeholder="N95 Mask Fit Certificate"
              className={INPUT_CLASSES}
            />
          </Field>
        </div>

        <Field
          label="Short Name"
          htmlFor={id("short_name")}
          hint="Used in compact places such as the student summary."
          error={errors.short_name}
        >
          <input
            id={id("short_name")}
            name="short_name"
            defaultValue={requirement?.short_name ?? ""}
            placeholder="Mask Fit"
            className={INPUT_CLASSES}
          />
        </Field>

        <Field
          label="Order"
          htmlFor={id("sort_order")}
          hint="Lower numbers appear first."
          error={errors.sort_order}
        >
          <input
            id={id("sort_order")}
            name="sort_order"
            type="number"
            step="1"
            defaultValue={requirement?.sort_order ?? defaultSortOrder}
            className={INPUT_CLASSES}
          />
        </Field>

        <div className="md:col-span-2">
          <Field
            label="Description"
            htmlFor={id("description")}
            hint="Optional. One short line of guidance for staff."
            error={errors.description}
          >
            <textarea
              id={id("description")}
              name="description"
              rows={2}
              defaultValue={requirement?.description ?? ""}
              className="w-full rounded-2xl border border-line bg-surface px-5 py-4 text-[17px] text-ink outline-none focus:border-brand"
            />
          </Field>
        </div>

        <div className="md:col-span-2">
          <label
            htmlFor={id("is_required")}
            className="flex items-start gap-4 rounded-2xl border border-line bg-surface-muted p-6"
          >
            <input
              id={id("is_required")}
              name="is_required"
              type="checkbox"
              defaultChecked={requirement?.is_required ?? true}
              className="mt-1 h-6 w-6 shrink-0 rounded border-line accent-[var(--brand)]"
            />
            <span>
              <span className="block text-[17px] font-medium text-ink">
                Required for placement readiness
              </span>
              <span className="mt-1 block text-[16px] text-ink-muted">
                Required documents count towards X of Y ready. Optional
                documents appear on the checklist but never hold a student back.
              </span>
            </span>
          </label>
        </div>
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
