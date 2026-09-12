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

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("students")
    .update(parsed.data)
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
    return { error: "The changes could not be saved. Try again.", fieldErrors: {} };
  }

  revalidatePath("/students");
  revalidatePath(`/students/${studentId}`);
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
