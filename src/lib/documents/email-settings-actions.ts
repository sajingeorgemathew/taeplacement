"use server";

import { revalidatePath } from "next/cache";

import { isAdmin, requireActiveStaff } from "@/lib/auth/session";
import {
  emptyFormState,
  fieldErrorsFrom,
  type FormState,
} from "@/lib/forms/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  EmailSettingsFormSchema,
  emailSettingsFormDataToObject,
} from "./email-settings";
import { PLACEMENT_EMAIL_SETTINGS_ID } from "./email-settings-queries";

/**
 * Saving the Academy-wide placement email settings.
 *
 * ADMIN ONLY, by the same pattern as batches, document requirements, and
 * placement areas: isAdmin() is checked here, and the "admin update placement
 * email settings" policy in 0009 checks public.is_admin() again in the
 * database. A placement manager may send emails and may customize the opening
 * message for one send, but changing what every other staff member's emails
 * say is a settings change, and settings are admin only.
 *
 * The write goes through the signed in admin's OWN token and Row Level
 * Security. The service role is not involved: nothing about a settings row
 * needs a path around the policies.
 *
 * Saving here NEVER sends an email. There is no call into email-actions.ts
 * from this file, no trigger on the table, and no schedule. The next email a
 * staff member previews will open with the new message; nothing goes out
 * because the message changed.
 */

const ADMIN_ONLY =
  "Only an admin can change the email settings. Ask an admin to make this change.";

export async function updatePlacementEmailSettingsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!isAdmin(session)) return { error: ADMIN_ONLY, fieldErrors: {} };

  const parsed = EmailSettingsFormSchema.safeParse(
    emailSettingsFormDataToObject(formData),
  );
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("placement_email_settings")
    .update({
      opening_message_enabled: parsed.data.opening_message_enabled,
      opening_message: parsed.data.opening_message,
      updated_by: session.userId,
    })
    .eq("id", PLACEMENT_EMAIL_SETTINGS_ID)
    .select("id");

  // Row Level Security refuses silently: an update the policy does not allow
  // touches zero rows and returns no error. Zero rows back means it was not
  // saved, and the interface must say so rather than show a success.
  if (error || !data || data.length === 0) {
    return {
      error: error
        ? "The email settings could not be saved. Try again."
        : ADMIN_ONLY,
      fieldErrors: {},
    };
  }

  revalidatePath("/admin/email-settings");
  return emptyFormState;
}
