/**
 * The Academy-wide opening message for placement document emails.
 *
 * This module is PURE, like email-content.ts and email-template.ts: no
 * database, no session, no environment. It holds the one rule for turning a
 * stored setting into "the sentence this email opens with, or nothing", the
 * validation every opening message goes through, and the form schema the Admin
 * page saves with. The script behind `npm run check:email` exercises all three
 * without touching a database.
 *
 * ---------------------------------------------------------------------------
 * Two levels, one rule
 * ---------------------------------------------------------------------------
 *
 *   COMMON       one Academy-wide message, saved by an admin, with an on/off
 *                switch. It is the DEFAULT for every placement email.
 *
 *   PER SEND     a staff member previewing one email may keep the common
 *                message, edit it for that email, or clear it. That decision
 *                is submitted with the send, validated again on the server,
 *                and frozen onto that email's permanent log row. It changes
 *                nothing else: not the common setting, not the student.
 *
 * Whatever the level, the same normalization applies: surrounding whitespace
 * is trimmed and a blank message means NO message. Nothing renders an empty
 * paragraph.
 *
 * ---------------------------------------------------------------------------
 * The privacy line
 * ---------------------------------------------------------------------------
 *
 * The opening message is STUDENT FACING and every word of it reaches an inbox.
 * It is Academy-wide wording, typed on purpose by staff who know that. It is
 * not, and must never become, a path for an internal note to reach a student:
 * nothing in this module, or in the code that calls it, can see
 * student_placement_documents.note, and the message is stored on the email log
 * row rather than the student so it cannot quietly become a profile field.
 */

import { z } from "zod";

import type { PlacementEmailSettingsRow } from "@/lib/supabase/database.types";

/**
 * The most an opening message may hold.
 *
 * Long enough for a real operational notice with a reason in it, and short
 * enough that this box is the wrong shape for anything that belongs in an
 * internal note. Also a database CHECK constraint in
 * supabase/migrations/0009_placement_email_settings.sql. Change one and change
 * the other.
 */
export const OPENING_MESSAGE_MAX_LENGTH = 600;

/** The words the Admin page shows under the message box. */
export const OPENING_MESSAGE_HELPER_TEXT =
  "This message appears near the top of placement document emails. Keep it student-facing and do not include confidential or medical information.";

/** The Admin setting, in the application's own shape. */
export type PlacementEmailSettings = {
  openingMessageEnabled: boolean;
  /** Trimmed. May be blank, which means no message even when enabled. */
  openingMessage: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

/**
 * What a database with no settings row behaves like: the message is off.
 *
 * Also what every reader falls back to if the row cannot be read, so a settings
 * table problem degrades to "the emails carry no opening message", which is
 * exactly what they did before this feature existed.
 */
export const DEFAULT_PLACEMENT_EMAIL_SETTINGS: PlacementEmailSettings = {
  openingMessageEnabled: false,
  openingMessage: "",
  updatedAt: null,
  updatedBy: null,
};

export function settingsFromRow(
  row: PlacementEmailSettingsRow,
): PlacementEmailSettings {
  return {
    openingMessageEnabled: row.opening_message_enabled,
    openingMessage: normalizeOpeningMessage(row.opening_message) ?? "",
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

/**
 * Trim, and treat blank as absent.
 *
 * This is the ONE normalization every opening message goes through, whether it
 * came from the Admin setting, from a staff member's edit in a preview, or from
 * a batch customization. Undefined, null, "", and "   " all mean "no message".
 */
export function normalizeOpeningMessage(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The message a NEW email opens with by default, or null for none.
 *
 * Both conditions must hold: the switch is on AND the message is not blank. A
 * saved message with the switch off is kept but not used, so an admin can turn
 * a notice off for a week without retyping it afterwards.
 */
export function effectiveOpeningMessage(
  settings: Pick<
    PlacementEmailSettings,
    "openingMessageEnabled" | "openingMessage"
  >,
): string | null {
  if (!settings.openingMessageEnabled) return null;
  return normalizeOpeningMessage(settings.openingMessage);
}

/** The message shown when a submitted opening message is too long. */
export const OPENING_MESSAGE_TOO_LONG = `Keep the opening message under ${OPENING_MESSAGE_MAX_LENGTH} characters.`;

/**
 * One opening message as SUBMITTED with a send.
 *
 * Used by the individual send, by every customized message in a batch send,
 * and by the preview. A string is trimmed and bounded; blank becomes null; null
 * means the staff member cleared it on purpose. Anything else is rejected, so a
 * malformed request cannot smuggle an object or an array into the email body.
 *
 * `.max()` is checked AFTER `.trim()`, so a message that is only over the limit
 * because of surrounding whitespace is accepted at its real length.
 */
export const OpeningMessageSchema = z
  .string()
  .trim()
  .max(OPENING_MESSAGE_MAX_LENGTH, OPENING_MESSAGE_TOO_LONG)
  .transform((value) => (value.length > 0 ? value : null))
  .nullable();

/**
 * Validate one submitted opening message.
 *
 * Returns the normalized message (or null for none) when it is acceptable, and
 * a plain error sentence otherwise. Kept as a function rather than only a
 * schema so the server actions read as "validate, then send".
 */
export function validateOpeningMessage(
  value: unknown,
): { ok: true; message: string | null } | { ok: false; error: string } {
  const parsed = OpeningMessageSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? OPENING_MESSAGE_TOO_LONG,
    };
  }
  return { ok: true, message: parsed.data };
}

/**
 * The Admin form.
 *
 * The message is stored trimmed, and may be saved blank: that is how an admin
 * removes a notice. Saving this form changes a setting and nothing else. It
 * sends no email and touches no student.
 */
export const EmailSettingsFormSchema = z.object({
  opening_message_enabled: z.boolean(),
  opening_message: z
    .string()
    .trim()
    .max(OPENING_MESSAGE_MAX_LENGTH, OPENING_MESSAGE_TOO_LONG),
});

export type EmailSettingsFormValues = z.infer<typeof EmailSettingsFormSchema>;

export function emailSettingsFormDataToObject(formData: FormData) {
  return {
    opening_message_enabled: formData.get("opening_message_enabled") === "on",
    opening_message: String(formData.get("opening_message") ?? ""),
  };
}
