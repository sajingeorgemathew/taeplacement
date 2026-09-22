"use client";

import { useActionState, useState } from "react";

import {
  OPENING_MESSAGE_HELPER_TEXT,
  OPENING_MESSAGE_MAX_LENGTH,
  type PlacementEmailSettings,
} from "@/lib/documents/email-settings";
import { updatePlacementEmailSettingsAction } from "@/lib/documents/email-settings-actions";
import { emptyFormState, type FormState } from "@/lib/forms/state";
import { formatTimestamp } from "@/lib/format";

/**
 * The Admin page for the placement emails' common opening message.
 *
 * Two fields, one row, one Save. Saving changes a setting and nothing else:
 * no email is sent, no student is touched, and the next email a staff member
 * previews simply opens with the new wording (or with none).
 *
 * Non-admins can read the current setting here, because they are the people
 * whose emails carry it, but the form is read only for them and the server
 * action and Row Level Security both refuse a save regardless.
 */
export default function EmailSettingsAdmin({
  settings,
  canManage,
}: {
  settings: PlacementEmailSettings;
  canManage: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (previous: FormState, formData: FormData) => {
      const next = await updatePlacementEmailSettingsAction(previous, formData);
      setSaved(
        next.error === null && Object.keys(next.fieldErrors).length === 0,
      );
      return next;
    },
    emptyFormState,
  );
  const [message, setMessage] = useState(settings.openingMessage);
  const [enabled, setEnabled] = useState(settings.openingMessageEnabled);

  const length = message.length;
  const tooLong = length > OPENING_MESSAGE_MAX_LENGTH;
  const errors = state.fieldErrors;

  return (
    <div className="flex flex-col gap-8">
      {!canManage ? (
        <p className="rounded-2xl border border-info-line bg-info-soft px-6 py-4 text-[16px] text-info-ink">
          You can view the email settings here. Only an admin can change them.
          You can still edit or clear the opening message for any single email
          you send, from its preview.
        </p>
      ) : null}

      <section className="rounded-3xl border border-line bg-surface p-7 sm:p-8">
        <h2 className="text-[24px] font-semibold tracking-tight text-ink">
          Common opening message
        </h2>
        <p className="mt-2 max-w-3xl text-[16px] text-ink-muted">
          When enabled, this appears directly after &ldquo;Hi FirstName,&rdquo;
          in every new placement document email, before the usual introduction.
          Staff can keep it, edit it, or remove it for any one email before
          sending. Saving here does not send anything.
        </p>

        <form action={formAction} className="mt-7 flex flex-col gap-6">
          {state.error ? (
            <p
              role="alert"
              className="rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink"
            >
              {state.error}
            </p>
          ) : null}

          {saved && !state.error ? (
            <p
              role="status"
              className="rounded-2xl border border-ready-line bg-ready-soft px-6 py-4 text-[16px] text-ready-ink"
            >
              Email settings saved. No email was sent.
            </p>
          ) : null}

          <label
            htmlFor="opening_message_enabled"
            className="flex items-start gap-4 rounded-2xl border border-line bg-surface-muted p-6"
          >
            <input
              id="opening_message_enabled"
              name="opening_message_enabled"
              type="checkbox"
              checked={enabled}
              disabled={!canManage || pending}
              onChange={(event) => setEnabled(event.target.checked)}
              className="mt-1 h-6 w-6 shrink-0 rounded border-line accent-[var(--brand)]"
            />
            <span>
              <span className="block text-[17px] font-medium text-ink">
                Enable common opening message
              </span>
              <span className="mt-1 block text-[16px] text-ink-muted">
                Off means new emails carry no opening message, even if one is
                saved below. The text is kept so it can be turned back on later.
              </span>
            </span>
          </label>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="opening_message"
              className="text-[16px] font-medium text-ink"
            >
              Common opening message
            </label>
            <textarea
              id="opening_message"
              name="opening_message"
              rows={5}
              value={message}
              disabled={!canManage || pending}
              readOnly={!canManage}
              onChange={(event) => setMessage(event.target.value)}
              aria-describedby="opening_message_help opening_message_count"
              aria-invalid={tooLong || Boolean(errors.opening_message)}
              className="w-full rounded-2xl border border-line bg-surface px-5 py-4 text-[17px] leading-relaxed text-ink outline-none focus:border-brand disabled:opacity-70"
            />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p id="opening_message_help" className="max-w-2xl text-[15px] text-ink-muted">
                {OPENING_MESSAGE_HELPER_TEXT}
              </p>
              <p
                id="opening_message_count"
                className={`shrink-0 text-[15px] tabular-nums ${
                  tooLong ? "text-attention-ink" : "text-ink-muted"
                }`}
              >
                {length} / {OPENING_MESSAGE_MAX_LENGTH}
              </p>
            </div>
            {errors.opening_message ? (
              <p role="alert" className="text-[15px] text-attention-ink">
                {errors.opening_message}
              </p>
            ) : tooLong ? (
              <p role="alert" className="text-[15px] text-attention-ink">
                Keep the opening message under {OPENING_MESSAGE_MAX_LENGTH}{" "}
                characters.
              </p>
            ) : null}
          </div>

          {canManage ? (
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                disabled={pending || tooLong}
                className="rounded-2xl bg-brand px-7 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
              >
                {pending ? "Saving..." : "Save Email Settings"}
              </button>
              {settings.updatedAt ? (
                <p className="text-[15px] text-ink-muted">
                  Last saved {formatTimestamp(settings.updatedAt)}
                </p>
              ) : null}
            </div>
          ) : null}
        </form>
      </section>

      <section className="rounded-3xl border border-line bg-surface-muted p-7">
        <h3 className="text-[18px] font-semibold text-ink">
          Where it appears
        </h3>
        <p className="mt-2 max-w-3xl text-[16px] text-ink-muted">
          The message is placed near the top of both the plain text and the HTML
          email. The exact wording used for each email is stored with that email
          and shown in Email History and Activity, so changing it here never
          changes what an already-sent email says.
        </p>
      </section>
    </div>
  );
}
