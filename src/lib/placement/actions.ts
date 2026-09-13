"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canManagePlacements, requireActiveStaff } from "@/lib/auth/session";
import {
  emptyFormState,
  fieldErrorsFrom,
  type FormState,
} from "@/lib/forms/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  AssignPlacementSchema,
  CancelPlacementSchema,
  FinishPlacementSchema,
  HoldStudentSchema,
  PlacementDatesSchema,
  StartPlacementSchema,
  assignPlacementFormDataToObject,
  cancelPlacementFormDataToObject,
  finishPlacementFormDataToObject,
  placementDatesFormDataToObject,
  startPlacementFormDataToObject,
} from "./schema";

/** Result of a quick action taken straight from a card or a row. */
export type PlacementActionResult = { error: string | null };

const OK: PlacementActionResult = { error: null };

const NOT_ALLOWED_MESSAGE =
  "Your account can view placements but not change them. Ask a placement manager or an admin.";

const NOT_ALLOWED: PlacementActionResult = { error: NOT_ALLOWED_MESSAGE };

/**
 * The partial unique index in 0006 refusing a second active placement.
 *
 * Reaching this means the student was assigned somewhere else between the page
 * being rendered and this action running, which is exactly what the index is
 * there to catch.
 */
function isDoubleAssignment(code: string | undefined): boolean {
  return code === "23505";
}

/** The students guard trigger refusing a placement change. */
function isNotAllowedByDatabase(code: string | undefined): boolean {
  return code === "42501";
}

/** Refresh everywhere a placement is visible. */
function revalidatePlacement(studentId?: string, partnerId?: string) {
  revalidatePath("/placement");
  revalidatePath("/students");
  if (studentId) {
    revalidatePath(`/students/${studentId}`);
    revalidatePath(`/students/${studentId}/placement`);
  }
  if (partnerId) revalidatePath(`/placement-partners/${partnerId}`);
}

/** The student and partner behind one placement row, for revalidation. */
async function readPlacementOwners(
  placementId: string,
): Promise<{ studentId: string; partnerId: string } | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("student_placements")
    .select("student_id, partner_id")
    .eq("id", placementId)
    .maybeSingle();

  if (error || !data) return null;
  return { studentId: data.student_id, partnerId: data.partner_id };
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

/**
 * Assign a student to a placement partner.
 *
 * One insert. students.placement_status becomes placement_assigned through the
 * trigger in 0006 rather than a second write from here, so the summary can
 * never drift out of step with the real relationship, and any hold the student
 * was under is released by the same trigger.
 *
 * No partner is ever chosen automatically, no capacity is counted, and the
 * partner's availability is left exactly as it was: availability is an
 * operational fact about the organization, not a slot this consumes.
 */
export async function assignPlacementAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!canManagePlacements(session)) {
    return { error: NOT_ALLOWED_MESSAGE, fieldErrors: {} };
  }

  const parsed = AssignPlacementSchema.safeParse(
    assignPlacementFormDataToObject(formData),
  );
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const values = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("student_placements").insert({
    student_id: values.student_id,
    partner_id: values.partner_id,
    status: "assigned",
    assigned_by: session.userId,
    planned_start_date: values.planned_start_date,
    planned_end_date: values.planned_end_date,
    actual_start_date: null,
    actual_end_date: null,
    assignment_note: values.assignment_note,
    // A new placement has not ended, so every ending field starts empty. The
    // stamp trigger in 0006 would clear them anyway; saying so here keeps the
    // insert honest about what an assignment is.
    credited_hours: null,
    completion_note: null,
    end_reason: null,
    cancelled_at: null,
    cancellation_reason: null,
  });

  if (error) {
    if (isDoubleAssignment(error.code)) {
      return {
        error:
          "This student already has a current placement. Finish it before assigning a new partner.",
        fieldErrors: {},
      };
    }
    return {
      error: "The placement could not be saved. Try again.",
      fieldErrors: {},
    };
  }

  revalidatePlacement(values.student_id, values.partner_id);
  redirect(`/students/${values.student_id}/placement`);
}

/**
 * Change the planned dates or the note on a live placement.
 *
 * Only the planning fields. The partner on a placement is never edited: moving
 * a student somewhere else is finishing this placement and assigning a new one,
 * so the history says what actually happened at each partner.
 */
export async function updatePlacementDatesAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!canManagePlacements(session)) {
    return { error: NOT_ALLOWED_MESSAGE, fieldErrors: {} };
  }

  const parsed = PlacementDatesSchema.safeParse(
    placementDatesFormDataToObject(formData),
  );
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const { placement_id: placementId, ...changes } = parsed.data;
  const owners = await readPlacementOwners(placementId);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("student_placements")
    .update(changes)
    .eq("id", placementId);

  if (error) {
    return {
      error: "The changes could not be saved. Try again.",
      fieldErrors: {},
    };
  }

  revalidatePlacement(owners?.studentId, owners?.partnerId);
  return emptyFormState;
}

/**
 * Start a placement.
 *
 * The one status change between assigning a student and finishing their
 * placement, and the line the two endings are drawn on: an ASSIGNED placement
 * can still be cancelled, a STARTED one can only be finished, because by then
 * the student has actually been there.
 *
 * It records the day they began and nothing else. This is not a check-in and it
 * is not attendance; what happens during a placement is PLACEMENT-05.
 *
 * The `.eq("status", "assigned")` is the guard, not a filter: if the placement
 * was started or cancelled between the page rendering and this running, no row
 * matches and the action says so instead of writing over the newer fact.
 */
export async function startPlacementAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!canManagePlacements(session)) {
    return { error: NOT_ALLOWED_MESSAGE, fieldErrors: {} };
  }

  const parsed = StartPlacementSchema.safeParse(
    startPlacementFormDataToObject(formData),
  );
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const values = parsed.data;
  const owners = await readPlacementOwners(values.placement_id);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("student_placements")
    .update({
      status: "started",
      actual_start_date: values.actual_start_date,
    })
    .eq("id", values.placement_id)
    .eq("status", "assigned")
    .select("id");

  if (error) {
    if (isNotAllowedByDatabase(error.code)) {
      return { error: NOT_ALLOWED_MESSAGE, fieldErrors: {} };
    }
    return {
      error: "The placement could not be started. Try again.",
      fieldErrors: {},
    };
  }

  if ((data ?? []).length === 0) {
    return {
      error:
        "This placement is no longer waiting to start. Reload the page to see where it got to.",
      fieldErrors: {},
    };
  }

  revalidatePlacement(owners?.studentId, owners?.partnerId);
  return emptyFormState;
}

/**
 * Cancel an assignment.
 *
 * Cancelling means the placement never meaningfully started, so it is a
 * deliberately different thing from finishing one, and a deliberately smaller
 * one. There are no hours to credit, no outcome to choose, and it is never
 * asked whether this completes the student's placement requirement: nothing
 * happened at that partner, so there is nothing to have completed.
 *
 * Only an ASSIGNED placement can be cancelled here. A student who has already
 * started was not "cancelled", and offering it would misrepresent what
 * happened; that placement is finished as Ended Early instead. The CHECK
 * constraint still permits the value so a mis-entered record can be corrected
 * in SQL, but no ordinary path produces it.
 *
 * The row is NEVER deleted. The trigger in 0006 then restores the student's
 * high-level status from their current document readiness, which is the only
 * honest answer: cancelling says nothing about where else they should go, so no
 * other partner is guessed.
 */
export async function cancelPlacementAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!canManagePlacements(session)) {
    return { error: NOT_ALLOWED_MESSAGE, fieldErrors: {} };
  }

  const parsed = CancelPlacementSchema.safeParse(
    cancelPlacementFormDataToObject(formData),
  );
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const values = parsed.data;
  const owners = await readPlacementOwners(values.placement_id);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("student_placements")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: values.cancellation_reason,
    })
    .eq("id", values.placement_id)
    .eq("status", "assigned")
    .select("id");

  if (error) {
    if (isNotAllowedByDatabase(error.code)) {
      return { error: NOT_ALLOWED_MESSAGE, fieldErrors: {} };
    }
    return {
      error: "The assignment could not be cancelled. Try again.",
      fieldErrors: {},
    };
  }

  if ((data ?? []).length === 0) {
    return {
      error:
        "This assignment can no longer be cancelled. If the student has already started, finish the placement instead.",
      fieldErrors: {},
    };
  }

  revalidatePlacement(owners?.studentId, owners?.partnerId);
  return emptyFormState;
}

/**
 * Finish a placement the student actually started.
 *
 * The row is NEVER deleted. It takes the historical status staff chose and
 * keeps its dates, its credited hours, and its note as the permanent record of
 * what happened at that partner.
 *
 * The second question is the one that matters, and the application does not
 * answer it on the student's behalf:
 *
 *   YES, this completes their placement requirement
 *       -> students.placement_status = placement_completed, and the student
 *          leaves the working board
 *   NO, they still have placement to do
 *       -> the student goes back to the pre-placement status their documents
 *          put them in, usually Ready for Placement, and another placement can
 *          be assigned at another partner
 *
 * Both writes happen inside finish_student_placement() in 0006, which also
 * refuses anything that is not a started placement, so a placement can never
 * end without the student summary following it and a transfer is never silently
 * recorded as a cancellation.
 */
export async function finishPlacementAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!canManagePlacements(session)) {
    return { error: NOT_ALLOWED_MESSAGE, fieldErrors: {} };
  }

  const parsed = FinishPlacementSchema.safeParse(
    finishPlacementFormDataToObject(formData),
  );
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const values = parsed.data;
  const owners = await readPlacementOwners(values.placement_id);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("finish_student_placement", {
    p_placement_id: values.placement_id,
    p_status: values.outcome,
    p_actual_end_date: values.actual_end_date,
    p_credited_hours: values.credited_hours,
    p_completion_note: values.completion_note,
    p_end_reason: values.end_reason,
    p_completes_requirement: values.completes_requirement,
  });

  if (error) {
    if (isNotAllowedByDatabase(error.code)) {
      return { error: NOT_ALLOWED_MESSAGE, fieldErrors: {} };
    }
    return {
      error: "The placement could not be finished. Try again.",
      fieldErrors: {},
    };
  }

  revalidatePlacement(owners?.studentId, owners?.partnerId);
  return emptyFormState;
}

// ---------------------------------------------------------------------------
// Hold
// ---------------------------------------------------------------------------

/**
 * Put a student On Hold.
 *
 * A hold is a deliberate pause with an optional one-line reason, not a stage of
 * the workflow. It is the one board column a card may be dragged into, because
 * it is the one state that is purely a staff decision.
 */
export async function holdStudentAction(input: {
  studentId: string;
  reason?: string | null;
}): Promise<PlacementActionResult> {
  const session = await requireActiveStaff();
  if (!canManagePlacements(session)) return NOT_ALLOWED;

  const parsed = HoldStudentSchema.safeParse({
    student_id: input.studentId,
    placement_hold_reason: input.reason ?? "",
  });
  if (!parsed.success) return { error: "Missing student." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("students")
    .update({
      placement_status: "on_hold",
      placement_hold_reason: parsed.data.placement_hold_reason,
      placement_hold_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.student_id);

  if (error) {
    if (isNotAllowedByDatabase(error.code)) return NOT_ALLOWED;
    return { error: "The student could not be put on hold. Try again." };
  }

  revalidatePlacement(parsed.data.student_id);
  return OK;
}

/**
 * Release a hold.
 *
 * Never blindly back to Ready. The database resolves where the student belongs
 * from the facts: their live placement record if they still have one, otherwise
 * their current document readiness. One call, so the status and the hold
 * columns can never disagree.
 */
export async function releaseHoldAction(input: {
  studentId: string;
}): Promise<PlacementActionResult> {
  const session = await requireActiveStaff();
  if (!canManagePlacements(session)) return NOT_ALLOWED;

  if (!input.studentId) return { error: "Missing student." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("release_student_placement_hold", {
    p_student_id: input.studentId,
  });

  if (error) {
    if (isNotAllowedByDatabase(error.code)) return NOT_ALLOWED;
    return { error: "The hold could not be released. Try again." };
  }

  revalidatePlacement(input.studentId);
  return OK;
}
