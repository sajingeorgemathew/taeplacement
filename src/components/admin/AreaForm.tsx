"use client";

import { useActionState, useEffect, useRef } from "react";

import { emptyFormState, type FormState } from "@/lib/forms/state";
import { AREA_COLOR_STYLES } from "@/lib/partners/area-colors";
import {
  AREA_COLOR_KEYS,
  AREA_COLOR_LABELS,
  DEFAULT_AREA_COLOR_KEY,
} from "@/lib/placement/constants";
import type { PlacementAreaRow } from "@/lib/supabase/database.types";

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

type AreaFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  area?: PlacementAreaRow;
  submitLabel: string;
  onDone?: () => void;
  /** Unique prefix so several forms on this page keep distinct field ids. */
  idPrefix: string;
  /** Suggested display order for a new area, ten past the current last one. */
  defaultSortOrder?: number;
};

/** Shared Add Area and Rename / Edit Area fields. */
export default function AreaForm({
  action,
  area,
  submitLabel,
  onDone,
  idPrefix,
  defaultSortOrder,
}: AreaFormProps) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const errors = state.fieldErrors;
  const id = (field: string) => `${idPrefix}-${field}`;
  const wasPending = useRef(false);
  const hasErrors = Boolean(state.error) || Object.keys(errors).length > 0;

  // Close the form once the area has been saved.
  useEffect(() => {
    if (wasPending.current && !pending && !hasErrors) onDone?.();
    wasPending.current = pending;
  }, [pending, hasErrors, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {area ? <input type="hidden" name="area_id" value={area.id} /> : null}

      {state.error ? (
        <p
          role="alert"
          className="rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Field label="Area Name" htmlFor={id("name")} error={errors.name}>
          <input
            id={id("name")}
            name="name"
            required
            defaultValue={area?.name ?? ""}
            placeholder="Peel / Mississauga"
            className={INPUT_CLASSES}
          />
        </Field>

        <Field
          label="Display Order"
          htmlFor={id("sort_order")}
          hint="Lower numbers sit further left on the Area Board."
          error={errors.sort_order}
        >
          <input
            id={id("sort_order")}
            name="sort_order"
            type="number"
            step="10"
            defaultValue={area?.sort_order ?? defaultSortOrder ?? 10}
            className={INPUT_CLASSES}
          />
        </Field>

        <div className="md:col-span-2">
          <Field
            label="Description"
            htmlFor={id("description")}
            hint="Optional. A short note about what this area covers."
            error={errors.description}
          >
            <input
              id={id("description")}
              name="description"
              defaultValue={area?.description ?? ""}
              className={INPUT_CLASSES}
            />
          </Field>
        </div>

        {/* A fixed palette, not a colour picker. Every option is already known
            to read well behind white partner cards and dark text. */}
        <div className="md:col-span-2">
          <fieldset className="flex flex-col gap-3">
            <legend className="text-[16px] font-medium text-ink">
              Area Colour
            </legend>
            <p className="text-[15px] text-ink-muted">
              Tints this area&apos;s column on the Area Board. Partner cards
              stay white.
            </p>
            <div className="flex flex-wrap gap-3">
              {AREA_COLOR_KEYS.map((key) => (
                <label
                  key={key}
                  // The radio itself is visually hidden, so the label carries
                  // both the selected state and the keyboard focus ring.
                  className="inline-flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-[16px] text-ink transition-colors hover:border-brand hover:bg-brand-soft has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand"
                >
                  <input
                    type="radio"
                    name="color_key"
                    value={key}
                    defaultChecked={
                      (area?.color_key ?? DEFAULT_AREA_COLOR_KEY) === key
                    }
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`h-6 w-6 rounded-full ${AREA_COLOR_STYLES[key].swatch}`}
                  />
                  {AREA_COLOR_LABELS[key]}
                </label>
              ))}
            </div>
            {errors.color_key ? (
              <p role="alert" className="text-[15px] text-attention-ink">
                {errors.color_key}
              </p>
            ) : null}
          </fieldset>
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
