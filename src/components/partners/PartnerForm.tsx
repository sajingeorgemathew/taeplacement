"use client";

import Link from "next/link";
import { useActionState } from "react";

import { emptyFormState, type FormState } from "@/lib/forms/state";
import { dateInputValue } from "@/lib/partners/schema";
import {
  AVAILABILITY_STATUSES,
  AVAILABILITY_STATUS_LABELS,
  DEFAULT_AVAILABILITY_STATUS,
  DEFAULT_PROVINCE,
  DEFAULT_RELATIONSHIP_STATUS,
  PARTNER_TYPE_OPTIONS,
  PROVINCE_OPTIONS,
  RELATIONSHIP_STATUSES,
  RELATIONSHIP_STATUS_LABELS,
  UNASSIGNED_AREA_LABEL,
} from "@/lib/placement/constants";
import type {
  PlacementAreaRow,
  PlacementPartnerRow,
} from "@/lib/supabase/database.types";

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

type PartnerFormProps = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  partner?: PlacementPartnerRow;
  /** Active areas, plus the partner's own area when it has been archived. */
  areas: PlacementAreaRow[];
  submitLabel: string;
  cancelHref: string;
};

/**
 * One form used by both Add Partner and Edit Partner so the field architecture
 * stays identical. Location is never required: imported partners arrive with
 * none of it and staff fill it in over time. The database id is never editable.
 */
export default function PartnerForm({
  action,
  partner,
  areas,
  submitLabel,
  cancelHref,
}: PartnerFormProps) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const errors = state.fieldErrors;

  const selectableAreas = areas.filter(
    (area) => area.is_active || area.id === partner?.area_id,
  );

  return (
    <form action={formAction} className="flex flex-col gap-10">
      {partner ? (
        <input type="hidden" name="partner_id" value={partner.id} />
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
          Partner
        </legend>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Field label="Partner Name" htmlFor="name" error={errors.name}>
            <input
              id="name"
              name="name"
              required
              defaultValue={partner?.name ?? ""}
              placeholder="Extendicare Oshawa"
              className={INPUT_CLASSES}
            />
          </Field>

          <Field
            label="Partner Type"
            htmlFor="partner_type"
            hint="Optional. Leave it empty if you are not sure yet."
            error={errors.partner_type}
          >
            <select
              id="partner_type"
              name="partner_type"
              defaultValue={partner?.partner_type ?? ""}
              className={INPUT_CLASSES}
            >
              <option value="">Not set</option>
              {PARTNER_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Main Phone"
            htmlFor="main_phone"
            error={errors.main_phone}
          >
            <input
              id="main_phone"
              name="main_phone"
              defaultValue={partner?.main_phone ?? ""}
              className={INPUT_CLASSES}
            />
          </Field>

          <Field label="Website" htmlFor="website" error={errors.website}>
            <input
              id="website"
              name="website"
              defaultValue={partner?.website ?? ""}
              className={INPUT_CLASSES}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-3xl border border-line bg-surface p-7 sm:p-8">
        <legend className="px-2 text-[22px] font-semibold tracking-tight text-ink">
          Location
        </legend>
        <p className="mt-2 px-2 text-[16px] text-ink-muted">
          None of this is required. Imported partners start with no address.
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field
              label="Address"
              htmlFor="address_line"
              error={errors.address_line}
            >
              <input
                id="address_line"
                name="address_line"
                defaultValue={partner?.address_line ?? ""}
                className={INPUT_CLASSES}
              />
            </Field>
          </div>

          <Field label="City" htmlFor="city" error={errors.city}>
            <input
              id="city"
              name="city"
              defaultValue={partner?.city ?? ""}
              className={INPUT_CLASSES}
            />
          </Field>

          <Field label="Province" htmlFor="province" error={errors.province}>
            <select
              id="province"
              name="province"
              defaultValue={partner?.province ?? DEFAULT_PROVINCE}
              className={INPUT_CLASSES}
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
              defaultValue={partner?.postal_code ?? ""}
              className={INPUT_CLASSES}
            />
          </Field>

          <Field
            label="Placement Area"
            htmlFor="area_id"
            hint="Unassigned is fine. Areas can also be changed on the Area Board."
            error={errors.area_id}
          >
            <select
              id="area_id"
              name="area_id"
              defaultValue={partner?.area_id ?? ""}
              className={INPUT_CLASSES}
            >
              <option value="">{UNASSIGNED_AREA_LABEL}</option>
              {selectableAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.is_active ? area.name : `${area.name} (archived)`}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-3xl border border-line bg-surface p-7 sm:p-8">
        <legend className="px-2 text-[22px] font-semibold tracking-tight text-ink">
          Relationship
        </legend>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Field
            label="Relationship Status"
            htmlFor="relationship_status"
            error={errors.relationship_status}
          >
            <select
              id="relationship_status"
              name="relationship_status"
              defaultValue={
                partner?.relationship_status ?? DEFAULT_RELATIONSHIP_STATUS
              }
              className={INPUT_CLASSES}
            >
              {RELATIONSHIP_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {RELATIONSHIP_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Last Contacted"
            htmlFor="last_contacted_at"
            error={errors.last_contacted_at}
          >
            <input
              id="last_contacted_at"
              name="last_contacted_at"
              type="date"
              defaultValue={dateInputValue(partner?.last_contacted_at ?? null)}
              className={INPUT_CLASSES}
            />
          </Field>

          <Field
            label="Next Follow-up"
            htmlFor="next_follow_up_at"
            error={errors.next_follow_up_at}
          >
            <input
              id="next_follow_up_at"
              name="next_follow_up_at"
              type="date"
              defaultValue={dateInputValue(partner?.next_follow_up_at ?? null)}
              className={INPUT_CLASSES}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-3xl border border-line bg-surface p-7 sm:p-8">
        <legend className="px-2 text-[22px] font-semibold tracking-tight text-ink">
          Placement Availability
        </legend>
        <p className="mt-2 px-2 text-[16px] text-ink-muted">
          Whether this organization is accepting placements. A new partner starts
          at Unknown, which is the honest answer until somebody asks them.
        </p>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Field
            label="Availability"
            htmlFor="availability_status"
            error={errors.availability_status}
          >
            <select
              id="availability_status"
              name="availability_status"
              defaultValue={
                partner?.availability_status ?? DEFAULT_AVAILABILITY_STATUS
              }
              className={INPUT_CLASSES}
            >
              {AVAILABILITY_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {AVAILABILITY_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Next Intake Date"
            htmlFor="next_intake_date"
            hint="Optional. Never required, even for an upcoming intake."
            error={errors.next_intake_date}
          >
            <input
              id="next_intake_date"
              name="next_intake_date"
              type="date"
              defaultValue={dateInputValue(partner?.next_intake_date ?? null)}
              className={INPUT_CLASSES}
            />
          </Field>

          <div className="md:col-span-2">
            <Field
              label="Availability Note"
              htmlFor="availability_note"
              hint="Optional. One short operational line."
              error={errors.availability_note}
            >
              <input
                id="availability_note"
                name="availability_note"
                defaultValue={partner?.availability_note ?? ""}
                placeholder="Current cohort is full. Check again in January."
                className={INPUT_CLASSES}
              />
            </Field>
          </div>

          <div className="md:col-span-2">
            <label className="flex items-start gap-3 rounded-2xl border border-line bg-surface-muted p-5">
              <input
                id="availability_checked"
                name="availability_checked"
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]"
              />
              <span className="text-[16px] text-ink">
                I checked this with the partner
                <span className="mt-1 block text-[15px] text-ink-muted">
                  Sets Last Checked to now. Leave it clear when you are editing
                  something else about this partner.
                </span>
              </span>
            </label>
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-3">
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
