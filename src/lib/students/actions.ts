"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireActiveStaff } from "@/lib/auth/session";
import {
  emptyFormState,
  fieldErrorsFrom,
  type FormState,
} from "@/lib/forms/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  NoteFormSchema,
  StudentFormSchema,
  studentFormDataToObject,
} from "./schema";

/** Postgres unique violation, raised when a student number is already taken. */
function isDuplicateStudentNumber(code: string | undefined): boolean {
  return code === "23505";
}

/**
 * The students guard trigger from 0006 refusing a placement change.
 *
 * Every active staff member may edit a student, but only admin and
 * placement_manager may move their placement status or put them on hold. The
 * database is what enforces that; this only turns it into a sentence.
 */
function isPlacementChangeRefused(code: string | undefined): boolean {
  return code === "42501";
}

const PLACEMENT_NOT_ALLOWED =
  "Your account can edit this student but not change their placement status. Ask a placement manager or an admin.";

export async function createStudentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireActiveStaff();

  const parsed = StudentFormSchema.safeParse(studentFormDataToObject(formData));
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("students")
    .insert({ ...parsed.data, is_active: true, migration_source: null })
    .select("id")
    .single();

  if (error) {
    if (isDuplicateStudentNumber(error.code)) {
      return {
        error: null,
        fieldErrors: {
          student_number: "That student number is already used by another student.",
        },
      };
    }
    if (isPlacementChangeRefused(error.code)) {
      return {
        error: PLACEMENT_NOT_ALLOWED,
        fieldErrors: { placement_status: PLACEMENT_NOT_ALLOWED },
      };
    }
    return { error: "The student could not be saved. Try again.", fieldErrors: {} };
  }

  revalidatePath("/students");
  redirect(`/students/${data.id}`);
}

export async function updateStudentAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireActiveStaff();

  const studentId = String(formData.get("student_id") ?? "");
  if (!studentId) {
    return { error: "Missing student.", fieldErrors: {} };
  }

  const parsed = StudentFormSchema.safeParse(studentFormDataToObject(formData));
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  // document_status is derived from the placement document checklist, so an
  // edit here must never overwrite it.
  const changes: Partial<typeof parsed.data> = { ...parsed.data };
  delete changes.document_status;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("students")
    .update(changes)
    .eq("id", studentId);

  if (error) {
    if (isDuplicateStudentNumber(error.code)) {
      return {
        error: null,
        fieldErrors: {
          student_number: "That student number is already used by another student.",
        },
      };
    }
    if (isPlacementChangeRefused(error.code)) {
      return {
        error: PLACEMENT_NOT_ALLOWED,
        fieldErrors: { placement_status: PLACEMENT_NOT_ALLOWED },
      };
    }
    return { error: "The changes could not be saved. Try again.", fieldErrors: {} };
  }

  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/placement");
  redirect(`/students/${studentId}`);
}

export async function addStudentNoteAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();

  const parsed = NoteFormSchema.safeParse({
    student_id: formData.get("student_id") ?? "",
    body: formData.get("body") ?? "",
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "The note could not be saved.",
      fieldErrors: {},
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("student_notes").insert({
    student_id: parsed.data.student_id,
    body: parsed.data.body,
    created_by: session.userId,
  });

  if (error) {
    return { error: "The note could not be saved. Try again.", fieldErrors: {} };
  }

  revalidatePath(`/students/${parsed.data.student_id}`);
  return emptyFormState;
}
