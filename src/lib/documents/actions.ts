"use server";

import { revalidatePath } from "next/cache";

import {
  canManageDocuments,
  isAdmin,
  requireActiveStaff,
} from "@/lib/auth/session";
import {
  emptyFormState,
  fieldErrorsFrom,
  type FormState,
} from "@/lib/forms/state";
import type { PlacementDocumentStatus } from "@/lib/placement/constants";
import type { StudentDocumentUpdate } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  DocumentNoteSchema,
  DocumentStatusChangeSchema,
  RequirementFormSchema,
  requirementFormDataToObject,
} from "./schema";
import {
  DOCUMENT_BUCKET,
  buildPackageStoragePath,
  validatePackageFile,
} from "./storage";

/** Result of a quick action on one checklist row. */
export type DocumentActionResult = { error: string | null };

const OK: DocumentActionResult = { error: null };

const NOT_ALLOWED: DocumentActionResult = {
  error:
    "Your account can view placement documents but not change them. Ask a placement manager or an admin.",
};

const ADMIN_ONLY =
  "Only an admin can change document requirements. Ask an admin to make this change.";

/** Refresh everywhere a document status is visible. */
function revalidateStudent(studentId: string) {
  revalidatePath(`/students/${studentId}/documents`);
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/students");
}

/**
 * Which audit columns a status change writes.
 *
 * Request and Received record who and when. Moving off Received clears the
 * received marker so received_at always means "received right now", while the
 * earlier request marker is kept as useful context.
 */
function auditFor(
  status: PlacementDocumentStatus,
  userId: string,
): StudentDocumentUpdate {
  const now = new Date().toISOString();

  switch (status) {
    case "requested":
      return {
        requested_by: userId,
        requested_at: now,
        received_by: null,
        received_at: null,
      };
    case "received":
      return { received_by: userId, received_at: now };
    case "not_reviewed":
      return {
        requested_by: null,
        requested_at: null,
        received_by: null,
        received_at: null,
      };
    default:
      // needs_update and not_applicable
      return { received_by: null, received_at: null };
  }
}

/**
 * Quick status change from a checklist row.
 *
 * The checklist is a readiness record, not a file store. Staff mark a document
 * Received while the official copy stays in the LMS; nothing is ever uploaded
 * per requirement.
 */
export async function setDocumentStatusAction(input: {
  documentId: string;
  status: string;
}): Promise<DocumentActionResult> {
  const session = await requireActiveStaff();
  if (!canManageDocuments(session)) return NOT_ALLOWED;

  const parsed = DocumentStatusChangeSchema.safeParse({
    document_id: input.documentId,
    status: input.status,
  });
  if (!parsed.success) {
    return { error: "That document status is not allowed." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("student_placement_documents")
    .update({
      status: parsed.data.status,
      updated_by: session.userId,
      ...auditFor(parsed.data.status, session.userId),
    })
    .eq("id", parsed.data.document_id)
    .select("student_id")
    .maybeSingle();

  if (error || !data) {
    return { error: "That status could not be saved. Try again." };
  }

  revalidateStudent(data.student_id);
  return OK;
}

/** One short internal note per document row. */
export async function saveDocumentNoteAction(input: {
  documentId: string;
  note: string;
}): Promise<DocumentActionResult> {
  const session = await requireActiveStaff();
  if (!canManageDocuments(session)) return NOT_ALLOWED;

  const parsed = DocumentNoteSchema.safeParse({
    document_id: input.documentId,
    note: input.note,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "That note could not be saved.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("student_placement_documents")
    .update({ note: parsed.data.note, updated_by: session.userId })
    .eq("id", parsed.data.document_id)
    .select("student_id")
    .maybeSingle();

  if (error || !data) {
    return { error: "That note could not be saved. Try again." };
  }

  revalidateStudent(data.student_id);
  return OK;
}

/**
 * Upload or replace the student's Final Placement Package.
 *
 * One merged PDF per student, prepared outside this application once the
 * checklist is ready. Individual requirements never carry a file: staff do not
 * upload Serology, VSC, TB, or CPR documents into TAE Placement.
 *
 * Replacing removes the previous object once the new reference is saved, so one
 * current package is kept per student and nothing is orphaned.
 */
export async function uploadPlacementPackageAction(
  formData: FormData,
): Promise<DocumentActionResult> {
  const session = await requireActiveStaff();
  if (!canManageDocuments(session)) return NOT_ALLOWED;

  const studentId = String(formData.get("student_id") ?? "");
  const file = formData.get("file");

  if (!studentId || !(file instanceof File)) {
    return { error: "Choose a merged PDF to upload." };
  }

  const invalid = validatePackageFile(file);
  if (invalid) return { error: invalid };

  const supabase = await createSupabaseServerClient();

  // Read the student rather than trusting the client, so the storage path can
  // never be pointed at an id that is not a real student.
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError || !student) {
    return { error: "That student could not be found." };
  }

  const { data: existing } = await supabase
    .from("student_placement_packages")
    .select("file_path")
    .eq("student_id", student.id)
    .maybeSingle();

  const path = buildPackageStoragePath(student.id);

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return { error: "The package could not be uploaded. Try again." };
  }

  const { error: saveError } = await supabase
    .from("student_placement_packages")
    .upsert(
      {
        student_id: student.id,
        file_path: path,
        original_file_name: file.name.slice(0, 200),
        mime_type: file.type,
        file_size_bytes: file.size,
        uploaded_by: session.userId,
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: "student_id" },
    );

  if (saveError) {
    // Do not leave a stored object that nothing points at.
    await supabase.storage.from(DOCUMENT_BUCKET).remove([path]);
    return { error: "The package could not be saved. Try again." };
  }

  if (existing?.file_path && existing.file_path !== path) {
    await supabase.storage.from(DOCUMENT_BUCKET).remove([existing.file_path]);
  }

  revalidateStudent(student.id);
  return OK;
}

/**
 * Remove the Final Placement Package.
 *
 * The checklist is untouched: readiness comes from the requirement statuses
 * alone, so removing the merged PDF never changes whether a student is ready.
 */
export async function removePlacementPackageAction(input: {
  studentId: string;
}): Promise<DocumentActionResult> {
  const session = await requireActiveStaff();
  if (!canManageDocuments(session)) return NOT_ALLOWED;

  const supabase = await createSupabaseServerClient();
  const { data: existing, error: readError } = await supabase
    .from("student_placement_packages")
    .select("id, student_id, file_path")
    .eq("student_id", input.studentId)
    .maybeSingle();

  if (readError) {
    return { error: "The package could not be removed. Try again." };
  }
  if (!existing) return OK;

  const { error: deleteError } = await supabase
    .from("student_placement_packages")
    .delete()
    .eq("id", existing.id);

  if (deleteError) {
    return { error: "The package could not be removed. Try again." };
  }

  await supabase.storage.from(DOCUMENT_BUCKET).remove([existing.file_path]);

  revalidateStudent(existing.student_id);
  return OK;
}

/**
 * Mark every requirement for one student back to Not Reviewed.
 *
 * The only bulk convenience offered here. There is deliberately no bulk
 * "mark everything Received" and no multi-student action: readiness must never
 * change by accident. Any uploaded Final Placement Package is kept.
 */
export async function resetStudentDocumentsAction(input: {
  studentId: string;
}): Promise<DocumentActionResult> {
  const session = await requireActiveStaff();
  if (!canManageDocuments(session)) return NOT_ALLOWED;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("student_placement_documents")
    .update({
      status: "not_reviewed",
      requested_by: null,
      requested_at: null,
      received_by: null,
      received_at: null,
      updated_by: session.userId,
    })
    .eq("student_id", input.studentId);

  if (error) {
    return { error: "The checklist could not be reset. Try again." };
  }

  revalidateStudent(input.studentId);
  return OK;
}

/**
 * Give one student any active requirement they are missing.
 *
 * Idempotent in the database, so pressing this twice creates nothing extra.
 */
export async function refreshStudentChecklistAction(input: {
  studentId: string;
}): Promise<DocumentActionResult> {
  const session = await requireActiveStaff();
  if (!canManageDocuments(session)) return NOT_ALLOWED;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(
    "initialize_student_placement_documents",
    { p_student_id: input.studentId },
  );

  if (error) {
    return { error: "The checklist could not be refreshed. Try again." };
  }

  revalidateStudent(input.studentId);
  return OK;
}

// ---------------------------------------------------------------------------
// Admin document requirements
// ---------------------------------------------------------------------------

function isDuplicateName(code: string | undefined): boolean {
  return code === "23505";
}

function revalidateRequirements() {
  revalidatePath("/admin/document-requirements");
  revalidatePath("/students");
}

/**
 * A new requirement reaches every active student through a database trigger,
 * so there is no client-side loop over the roster here.
 */
export async function createRequirementAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!isAdmin(session)) return { error: ADMIN_ONLY, fieldErrors: {} };

  const parsed = RequirementFormSchema.safeParse(
    requirementFormDataToObject(formData),
  );
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("placement_document_requirements")
    .insert({ ...parsed.data, is_active: true });

  if (error) {
    if (isDuplicateName(error.code)) {
      return {
        error: null,
        fieldErrors: { name: "A requirement with that name already exists." },
      };
    }
    return {
      error: "The requirement could not be created. Try again.",
      fieldErrors: {},
    };
  }

  revalidateRequirements();
  return emptyFormState;
}

export async function updateRequirementAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireActiveStaff();
  if (!isAdmin(session)) return { error: ADMIN_ONLY, fieldErrors: {} };

  const requirementId = String(formData.get("requirement_id") ?? "");
  if (!requirementId) return { error: "Missing requirement.", fieldErrors: {} };

  const parsed = RequirementFormSchema.safeParse(
    requirementFormDataToObject(formData),
  );
  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("placement_document_requirements")
    .update(parsed.data)
    .eq("id", requirementId);

  if (error) {
    if (isDuplicateName(error.code)) {
      return {
        error: null,
        fieldErrors: { name: "A requirement with that name already exists." },
      };
    }
    return {
      error: "The changes could not be saved. Try again.",
      fieldErrors: {},
    };
  }

  revalidateRequirements();
  return emptyFormState;
}

/**
 * Archive or reactivate. Requirements are never hard deleted, so every student
 * row that already points at one keeps its meaning. Reactivating hands the
 * requirement back to every active student through the same trigger.
 */
export async function setRequirementActiveAction(input: {
  requirementId: string;
  isActive: boolean;
}): Promise<DocumentActionResult> {
  const session = await requireActiveStaff();
  if (!isAdmin(session)) return { error: ADMIN_ONLY };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("placement_document_requirements")
    .update({ is_active: input.isActive })
    .eq("id", input.requirementId);

  if (error) {
    return { error: "That requirement could not be changed. Try again." };
  }

  revalidateRequirements();
  return OK;
}

export async function setRequirementRequiredAction(input: {
  requirementId: string;
  isRequired: boolean;
}): Promise<DocumentActionResult> {
  const session = await requireActiveStaff();
  if (!isAdmin(session)) return { error: ADMIN_ONLY };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("placement_document_requirements")
    .update({ is_required: input.isRequired })
    .eq("id", input.requirementId);

  if (error) {
    return { error: "That requirement could not be changed. Try again." };
  }

  revalidateRequirements();
  return OK;
}

/**
 * Move one requirement up or down by swapping sort_order with its neighbour.
 *
 * Requirements seeded in steps of ten can still collide on equal values, so the
 * swap falls back to a small nudge when both rows share a sort order.
 */
export async function moveRequirementAction(input: {
  requirementId: string;
  direction: "up" | "down";
}): Promise<DocumentActionResult> {
  const session = await requireActiveStaff();
  if (!isAdmin(session)) return { error: ADMIN_ONLY };

  const supabase = await createSupabaseServerClient();
  const { data: requirements, error } = await supabase
    .from("placement_document_requirements")
    .select("id, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error || !requirements) {
    return { error: "The order could not be changed. Try again." };
  }

  const index = requirements.findIndex(
    (requirement) => requirement.id === input.requirementId,
  );
  const neighbourIndex = input.direction === "up" ? index - 1 : index + 1;

  if (index < 0 || neighbourIndex < 0 || neighbourIndex >= requirements.length) {
    return OK;
  }

  const current = requirements[index];
  const neighbour = requirements[neighbourIndex];

  const currentOrder =
    current.sort_order === neighbour.sort_order
      ? neighbour.sort_order + (input.direction === "up" ? -1 : 1)
      : neighbour.sort_order;

  const [first, second] = await Promise.all([
    supabase
      .from("placement_document_requirements")
      .update({ sort_order: currentOrder })
      .eq("id", current.id),
    supabase
      .from("placement_document_requirements")
      .update({ sort_order: current.sort_order })
      .eq("id", neighbour.id),
  ]);

  if (first.error || second.error) {
    return { error: "The order could not be changed. Try again." };
  }

  revalidateRequirements();
  return OK;
}
