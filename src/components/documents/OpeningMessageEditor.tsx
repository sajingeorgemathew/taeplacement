"use client";

import { useId } from "react";

import {
  normalizeOpeningMessage,
  OPENING_MESSAGE_MAX_LENGTH,
} from "@/lib/documents/email-settings";

const SMALL_BUTTON =
  "inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-[15px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60";

/**
 * The editable opening message on an email preview.
 *
 * Used by the individual send dialog and by the per-student customization on
 * the batch reminder screen, so the two behave identically: the same limit,
 * the same count, the same Clear, the same Reset to common.
 *
 * What it edits is a DRAFT for one email. It never writes anywhere. The parent
 * keeps the value, feeds it back into the preview so the staff member sees the
 * final wording, and submits it with the send. Nothing typed here reaches the
 * Admin setting or the student record.
 */
export default function OpeningMessageEditor({
  value,
  commonMessage,
  onChange,
  disabled = false,
  label = "Opening Message",
}: {
  /** The draft as typed, untrimmed. */
  value: string;
  /** The Academy-wide default right now, or null when there is none. */
  commonMessage: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  const length = value.length;
  const tooLong = length > OPENING_MESSAGE_MAX_LENGTH;
  const normalized = normalizeOpeningMessage(value);
  const isCommon = normalized === commonMessage;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label htmlFor={id} className="text-[16px] font-medium text-ink">
          {label}
        </label>
        <p
          className={`text-[15px] tabular-nums ${
            tooLong ? "text-attention-ink" : "text-ink-muted"
          }`}
        >
          {length} / {OPENING_MESSAGE_MAX_LENGTH}
        </p>
      </div>

      <textarea
        id={id}
        rows={4}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={tooLong}
        aria-describedby={`${id}-help`}
        placeholder="No opening message. The email starts with the usual introduction."
        className="w-full rounded-2xl border border-line bg-surface px-5 py-4 text-[16px] leading-relaxed text-ink outline-none focus:border-brand disabled:opacity-70"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id={`${id}-help`} className="text-[15px] text-ink-muted">
          {isCommon
            ? commonMessage
              ? "This is the common opening message. Changing it here affects only this email."
              : "There is no common opening message. Anything typed here goes only into this email."
            : normalized
              ? "Customized for this email only. The common message is unchanged."
              : "Cleared for this email only. The common message is unchanged."}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || normalized === null}
            onClick={() => onChange("")}
            className={SMALL_BUTTON}
          >
            Clear
          </button>
          <button
            type="button"
            disabled={disabled || isCommon}
            onClick={() => onChange(commonMessage ?? "")}
            className={SMALL_BUTTON}
          >
            Reset to common
          </button>
        </div>
      </div>

      {tooLong ? (
        <p role="alert" className="text-[15px] text-attention-ink">
          Keep the opening message under {OPENING_MESSAGE_MAX_LENGTH} characters.
        </p>
      ) : null}
    </div>
  );
}
