/**
 * Reading the Academy-wide placement email settings.
 *
 * One row, read with the signed in staff member's OWN token through Row Level
 * Security, exactly like the other admin configuration tables. Every active
 * staff member may read it; only an admin may change it, and the change lives
 * in email-settings-actions.ts.
 *
 * Nothing here is cached across requests. The setting is small and it is read
 * at the moment an email is composed, so a notice an admin turns off at 9:00
 * is not in the preview a colleague opens at 9:01.
 */

import { requireActiveStaff } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  DEFAULT_PLACEMENT_EMAIL_SETTINGS,
  effectiveOpeningMessage,
  settingsFromRow,
  type PlacementEmailSettings,
} from "./email-settings";

/** The singleton's one and only id. See 0009_placement_email_settings.sql. */
export const PLACEMENT_EMAIL_SETTINGS_ID = 1;

/**
 * The current settings, as saved.
 *
 * Returns the disabled default when the row is missing or cannot be read. That
 * degrades to "emails carry no opening message", which is what they did before
 * this feature, rather than blocking a send because a settings table is
 * unreachable.
 */
export async function getPlacementEmailSettings(): Promise<PlacementEmailSettings> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("placement_email_settings")
    .select("*")
    .eq("id", PLACEMENT_EMAIL_SETTINGS_ID)
    .maybeSingle();

  if (error || !data) return DEFAULT_PLACEMENT_EMAIL_SETTINGS;
  return settingsFromRow(data);
}

/**
 * The message a NEW email opens with by default, or null for none.
 *
 * The one call the compose path makes. It is the common message only when the
 * switch is on and the text is not blank.
 */
export async function getCommonOpeningMessage(): Promise<string | null> {
  return effectiveOpeningMessage(await getPlacementEmailSettings());
}
