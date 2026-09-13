import { z } from "zod";

import { PLACEMENT_OUTCOMES } from "@/lib/placement/constants";

/** Trims a form value and turns an empty string into null. */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .default(null);

/**
 * A date only input stored in a real DATE column, kept as "YYYY-MM-DD".
 *
 * A planned start is a DAY, not a moment. Widening it into a timestamp is how a
 * placement that starts on the 27th ends up displayed as the evening of the
 * 26th, so it never happens here.
 */
const optionalDateOnly = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? value : null))
  .nullable()
  .default(null)
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), {
    message: "Enter a date, or leave it empty.",
  });

/**
 * Credited hours: the one number staff accept for a placement segment.
 *
 * Not a timesheet and not an hours log. Empty is a legitimate answer - staff
 * often finish a placement before the hours have been confirmed - so it stays
 * optional and never defaults to zero, which would be a claim nobody made.
 */
const optionalHours = z
  .string()
  .trim()
  .transform((value) => (value.length > 0 ? Number(value) : null))
  .nullable()
  .default(null)
  .refine(
    (value) =>
      value === null ||
      (Number.isFinite(value) && value >= 0 && value <= 9999),
    { message: "Enter the hours as a number, or leave it empty." },
  );

/**
 * The assignment confirmation form.
 *
 * Only the student and the partner are required. Staff assign a placement the
 * moment the decision is made, and fill in the dates when they know them.
 */
export const AssignPlacementSchema = z
  .object({
    student_id: z.uuid("Choose a student."),
    partner_id: z.uuid("Choose a placement partner."),
    planned_start_date: optionalDateOnly,
    planned_end_date: optionalDateOnly,
    assignment_note: optionalText.refine(
      (value) => value === null || value.length <= 500,
      { message: "Keep the assignment note short." },
    ),
  })
  .refine(
    (values) =>
      !values.planned_start_date ||
      !values.planned_end_date ||
      values.planned_end_date >= values.planned_start_date,
    {
      message: "The planned end date cannot be before the planned start date.",
      path: ["planned_end_date"],
    },
  );

/** Editing the planned dates and note on an existing assignment. */
export const PlacementDatesSchema = z
  .object({
    placement_id: z.uuid(),
    planned_start_date: optionalDateOnly,
    planned_end_date: optionalDateOnly,
    assignment_note: optionalText,
  })
  .refine(
    (values) =>
      !values.planned_start_date ||
      !values.planned_end_date ||
      values.planned_end_date >= values.planned_start_date,
    {
      message: "The planned end date cannot be before the planned start date.",
      path: ["planned_end_date"],
    },
  );

/**
 * Starting a placement.
 *
 * The one status change between assigning a student and finishing their
 * placement. It records the day they actually began and nothing else: this is
 * not a check-in, and PLACEMENT-05 still owns everything that happens during a
 * placement.
 */
export const StartPlacementSchema = z.object({
  placement_id: z.uuid(),
  actual_start_date: optionalDateOnly,
});

/**
 * Cancelling an assignment.
 *
 * Deliberately tiny, and deliberately NOT the Finish Placement form. Cancelling
 * means the assignment never meaningfully started, so there are no hours to
 * credit, no outcome to choose, and no requirement to complete. One optional
 * reason, and the record is kept as history.
 */
export const CancelPlacementSchema = z.object({
  placement_id: z.uuid(),
  cancellation_reason: optionalText.refine(
    (value) => value === null || value.length <= 200,
    { message: "Keep the reason short." },
  ),
});

/**
 * The Finish Placement form, for a placement the student ACTUALLY STARTED.
 *
 * Two decisions in one form, because ending a real placement is genuinely two
 * questions and staff must answer both:
 *
 *   outcome               what happened to THIS placement, completed or
 *                         ended_early
 *   completes_requirement does that finish the student's WHOLE placement
 *
 * Cancellation is not one of the outcomes. An assignment that never began is
 * cancelled from the assignment itself, and it can never complete a
 * requirement.
 */
export const FinishPlacementSchema = z.object({
  placement_id: z.uuid(),
  outcome: z.enum(PLACEMENT_OUTCOMES, {
    message: "Choose what happened to this placement.",
  }),
  actual_end_date: optionalDateOnly.refine((value) => Boolean(value), {
    message: "Enter the day this placement actually ended.",
  }),
  credited_hours: optionalHours,
  completion_note: optionalText.refine(
    (value) => value === null || value.length <= 500,
    { message: "Keep the note short." },
  ),
  end_reason: optionalText.refine(
    (value) => value === null || value.length <= 200,
    { message: "Keep the reason short." },
  ),
  completes_requirement: z.boolean(),
});

export const HoldStudentSchema = z.object({
  student_id: z.uuid(),
  placement_hold_reason: optionalText,
});

export function assignPlacementFormDataToObject(formData: FormData) {
  return {
    student_id: String(formData.get("student_id") ?? ""),
    partner_id: String(formData.get("partner_id") ?? ""),
    planned_start_date: String(formData.get("planned_start_date") ?? ""),
    planned_end_date: String(formData.get("planned_end_date") ?? ""),
    assignment_note: String(formData.get("assignment_note") ?? ""),
  };
}

export function startPlacementFormDataToObject(formData: FormData) {
  return {
    placement_id: String(formData.get("placement_id") ?? ""),
    actual_start_date: String(formData.get("actual_start_date") ?? ""),
  };
}

export function cancelPlacementFormDataToObject(formData: FormData) {
  return {
    placement_id: String(formData.get("placement_id") ?? ""),
    cancellation_reason: String(formData.get("cancellation_reason") ?? ""),
  };
}

export function finishPlacementFormDataToObject(formData: FormData) {
  return {
    placement_id: String(formData.get("placement_id") ?? ""),
    outcome: String(formData.get("outcome") ?? ""),
    actual_end_date: String(formData.get("actual_end_date") ?? ""),
    credited_hours: String(formData.get("credited_hours") ?? ""),
    completion_note: String(formData.get("completion_note") ?? ""),
    end_reason: String(formData.get("end_reason") ?? ""),
    // A checkbox is absent when unticked, so "does this complete their whole
    // placement" defaults to NO. The safe answer is the one that leaves the
    // student available to be placed again.
    completes_requirement: formData.get("completes_requirement") === "yes",
  };
}

export function placementDatesFormDataToObject(formData: FormData) {
  return {
    placement_id: String(formData.get("placement_id") ?? ""),
    planned_start_date: String(formData.get("planned_start_date") ?? ""),
    planned_end_date: String(formData.get("planned_end_date") ?? ""),
    assignment_note: String(formData.get("assignment_note") ?? ""),
  };
}

/** "2026-04-27" for a date input, from a stored DATE value. */
export function dateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}
