"use server";

import { revalidatePath } from "next/cache";

import { isAdmin, requireActiveStaff } from "@/lib/auth/session";
import {
  placementTrackingChangeFrom,
  placementTrackingUpdate,
} from "@/lib/batches/tracking";
import {
  emptyFormState,
  fieldErrorsFrom,
  type FormState,
} from "@/lib/forms/state";
import type { BatchStatus } from "@/lib/placement/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  BatchFormSchema,
  batchFormDataToObject,
} from "@/lib/students/schema";

const ADMIN_ONLY =
  "Only an admin can change batches. Ask an admin to make this change.";

function isDuplicateName(code: string | undefined): boolean {
  return code === "23505";
}

export async function createBatchAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!isAdmin(session)) return { error: ADMIN_ONLY, fieldErrors: {} };

  const parsed = BatchFormSchema.safeParse(batchFormDataToObject(formData));
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("batches").insert(parsed.data);

  if (error) {
    if (isDuplicateName(error.code)) {
      return {
        error: null,
        fieldErrors: { name: "A batch with that name already exists." },
      };
    }
    return { error: "The batch could not be created. Try again.", fieldErrors: {} };
  }

  revalidatePath("/admin/batches");
  revalidatePath("/students");
  return emptyFormState;
}

export async function updateBatchAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!isAdmin(session)) return { error: ADMIN_ONLY, fieldErrors: {} };

  const batchId = String(formData.get("batch_id") ?? "");
  if (!batchId) return { error: "Missing batch.", fieldErrors: {} };

  const parsed = BatchFormSchema.safeParse(batchFormDataToObject(formData));
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("batches")
    .update(parsed.data)
    .eq("id", batchId);

  if (error) {
    if (isDuplicateName(error.code)) {
      return {
        error: null,
        fieldErrors: { name: "A batch with that name already exists." },
      };
    }
    return { error: "The changes could not be saved. Try again.", fieldErrors: {} };
  }

  revalidatePath("/admin/batches");
  revalidatePath("/students");
  return emptyFormState;
}

/**
 * Archive or reactivate a batch. Batches are never deleted, so historical
 * records and the students attached to them stay intact.
 */
export async function setBatchStatusAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!isAdmin(session)) return { error: ADMIN_ONLY, fieldErrors: {} };

  const batchId = String(formData.get("batch_id") ?? "");
  const status = String(formData.get("status") ?? "") as BatchStatus;

  if (!batchId || (status !== "active" && status !== "archived")) {
    return { error: "That batch change is not allowed.", fieldErrors: {} };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("batches")
    .update({ status })
    .eq("id", batchId);

  if (error) {
    return { error: "The batch status could not be changed.", fieldErrors: {} };
  }

  revalidatePath("/admin/batches");
  revalidatePath("/students");
  return emptyFormState;
}

/**
 * Switch a batch in or out of CURRENT placement operations.
 *
 * This writes exactly one column, placement_tracking_enabled, on exactly one
 * batch row. It never changes the batch status, any student's is_active or
 * placement_status, any placement record, or any document record, and it
 * sends nothing. Same permission as every other batch change: admin only,
 * which the "admin update batches" policy from 0001 enforces in the database.
 */
export async function setBatchPlacementTrackingAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!isAdmin(session)) return { error: ADMIN_ONLY, fieldErrors: {} };

  const change = placementTrackingChangeFrom(formData);
  if (!change) return { error: "Missing batch.", fieldErrors: {} };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("batches")
    .update(placementTrackingUpdate(change.enabled))
    .eq("id", change.batchId);

  if (error) {
    return {
      error: "The placement operations setting could not be saved. Try again.",
      fieldErrors: {},
    };
  }

  revalidatePath("/admin/batches");
  revalidatePath("/students");
  revalidatePath("/dashboard");
  return emptyFormState;
}
