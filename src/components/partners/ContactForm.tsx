"use client";

import { useActionState, useEffect, useRef } from "react";

import { emptyFormState, type FormState } from "@/lib/forms/state";
import type { PartnerContact } from "@/lib/partners/queries";

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

type ContactFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  partnerId: string;
  contact?: PartnerContact;
  submitLabel: string;
  onDone: () => void;
  /** Unique prefix so several contact forms keep distinct field ids. */
  idPrefix: string;
};

/**
 * Add Contact and Edit Contact.
 *
 * Only the name is required. Email and phone are often missing on an imported
 * record and that is a normal state, not an error.
 */
export default function ContactForm({
  action,
  partnerId,
  contact,
  submitLabel,
  onDone,
  idPrefix,
}: ContactFormProps) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const errors = state.fieldErrors;
  const id = (field: string) => `${idPrefix}-${field}`;
  const wasPending = useRef(false);
  const hasErrors = Boolean(state.error) || Object.keys(errors).length > 0;

  // Close the form once the contact has been saved.
  useEffect(() => {
    if (wasPending.current && !pending && !hasErrors) onDone();
    wasPending.current = pending;
  }, [pending, hasErrors, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="partner_id" value={partnerId} />
      {contact ? (
        <input type="hidden" name="contact_id" value={contact.id} />
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
        <Field
          label="Full Name"
          htmlFor={id("full_name")}
          error={errors.full_name}
        >
          <input
            id={id("full_name")}
            name="full_name"
            required
            defaultValue={contact?.full_name ?? ""}
            className={INPUT_CLASSES}
          />
        </Field>

        <Field
          label="Job Title"
          htmlFor={id("job_title")}
          error={errors.job_title}
        >
          <input
            id={id("job_title")}
            name="job_title"
            defaultValue={contact?.job_title ?? ""}
            className={INPUT_CLASSES}
          />
        </Field>

        <Field
          label="Email"
          htmlFor={id("email")}
          hint="Optional."
          error={errors.email}
        >
          <input
            id={id("email")}
            name="email"
            type="email"
            defaultValue={contact?.email ?? ""}
            className={INPUT_CLASSES}
          />
        </Field>

        <Field
          label="Phone"
          htmlFor={id("phone")}
          hint="Optional."
          error={errors.phone}
        >
          <input
            id={id("phone")}
            name="phone"
            defaultValue={contact?.phone ?? ""}
            className={INPUT_CLASSES}
          />
        </Field>
      </div>

      <label className="flex items-center gap-3 text-[16px] text-ink">
        <input
          type="checkbox"
          name="is_primary"
          defaultChecked={contact?.is_primary ?? false}
          className="h-5 w-5 rounded border-line"
        />
        Primary contact for this partner
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-2xl bg-brand px-7 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Saving..." : submitLabel}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-2xl border border-line px-7 py-4 text-[17px] font-medium text-ink transition-colors hover:bg-surface-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
