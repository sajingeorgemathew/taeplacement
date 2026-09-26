/**
 * The "Track in Placement Operations" setting on a batch.
 *
 * Pure helpers shared by the Batch Management action and the checks. Nothing
 * here touches the database; the action applies the update this module
 * produces, and the update is deliberately one column wide.
 */

import type { BatchUpdate } from "@/lib/supabase/database.types";

export const PLACEMENT_TRACKING_LABEL = "Track in Placement Operations";

export const PLACEMENT_TRACKING_HELPER_TEXT =
  "When enabled, active students in this batch appear in current placement dashboards and operational program counts. Turning this off does not delete, archive, or change any student records.";

export const PLACEMENT_TRACKING_ON_LABEL = "Tracking";
export const PLACEMENT_TRACKING_OFF_LABEL = "Not Tracking";

export type PlacementTrackingChange = {
  batchId: string;
  enabled: boolean;
};

/**
 * Reads the toggle form. A checkbox that is off is simply absent from the
 * submission, so "not present" means false rather than "no change".
 */
export function placementTrackingChangeFrom(
  formData: FormData,
): PlacementTrackingChange | null {
  const batchId = String(formData.get("batch_id") ?? "").trim();
  if (!batchId) return null;

  return {
    batchId,
    enabled: formData.get("placement_tracking_enabled") === "on",
  };
}

/**
 * The exact row update the action sends. It is the ONLY thing the action
 * writes: no status, no student field, no placement, no document. The type is
 * narrowed to that one key so a second column cannot slip in.
 */
export function placementTrackingUpdate(
  enabled: boolean,
): Pick<Required<BatchUpdate>, "placement_tracking_enabled"> {
  return { placement_tracking_enabled: enabled };
}
