import { requireActiveStaff } from "@/lib/auth/session";
import type {
  DocumentReadinessRow,
  DocumentRequirementRow,
  StudentDocumentRow,
  StudentPackageRow,
} from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** One checklist line: the definition plus this student's record for it. */
export type ChecklistItem = {
  requirement: DocumentRequirementRow;
  document: StudentDocumentRow;
  requestedByName: string | null;
  receivedByName: string | null;
};

/** "X of Y ready" plus the pieces the summary card needs. */
export type DocumentReadiness = {
  requiredTotal: number;
  requiredReady: number;
  activeTotal: number;
  activeReady: number;
  reviewedCount: number;
  /** Percentage of required requirements that are ready, 0-100. */
  percent: number;
  isReady: boolean;
};

const EMPTY_READINESS: DocumentReadiness = {
  requiredTotal: 0,
  requiredReady: 0,
  activeTotal: 0,
  activeReady: 0,
  reviewedCount: 0,
  percent: 0,
  isReady: false,
};

function toReadiness(row: DocumentReadinessRow | null): DocumentReadiness {
  if (!row) return EMPTY_READINESS;

  const requiredTotal = row.required_total;
  const requiredReady = Math.min(row.required_ready, requiredTotal);

  return {
    requiredTotal,
    requiredReady,
    activeTotal: row.active_total,
    activeReady: row.active_ready,
    reviewedCount: row.reviewed_count,
    percent:
      requiredTotal === 0
        ? 100
        : Math.round((requiredReady / requiredTotal) * 100),
    isReady: requiredReady >= requiredTotal,
  };
}

/**
 * Document requirement definitions.
 *
 * Pass activeOnly for the student checklist. Admin reads the whole list so
 * archived requirements can be reactivated.
 */
export async function listDocumentRequirements(
  options: { activeOnly?: boolean } = {},
): Promise<DocumentRequirementRow[]> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  let query = supabase.from("placement_document_requirements").select("*");
  if (options.activeOnly) query = query.eq("is_active", true);

  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * The checklist for one student, in Admin's configured order.
 *
 * Only active requirements are listed. A requirement with no row yet (added
 * between the last initialization and now) is skipped here rather than faked,
 * and the documents page offers a one-click refresh that creates it.
 */
export async function getStudentChecklist(
  studentId: string,
): Promise<ChecklistItem[]> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const [requirementsResult, documentsResult] = await Promise.all([
    supabase
      .from("placement_document_requirements")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("student_placement_documents")
      .select("*")
      .eq("student_id", studentId),
  ]);

  if (requirementsResult.error) throw new Error(requirementsResult.error.message);
  if (documentsResult.error) throw new Error(documentsResult.error.message);

  const documents = documentsResult.data ?? [];
  const byRequirement = new Map(
    documents.map((document) => [document.requirement_id, document]),
  );

  // requested_by / received_by point at profiles, read in one small extra query
  // so the checklist can say who asked for a document and who cleared it.
  const staffIds = [
    ...new Set(
      documents
        .flatMap((document) => [document.requested_by, document.received_by])
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const names = new Map<string, string | null>();
  if (staffIds.length > 0) {
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", staffIds);

    if (error) throw new Error(error.message);
    for (const profile of profiles ?? []) {
      names.set(profile.id, profile.full_name);
    }
  }

  const items: ChecklistItem[] = [];
  for (const requirement of requirementsResult.data ?? []) {
    const document = byRequirement.get(requirement.id);
    if (!document) continue;
    items.push({
      requirement,
      document,
      requestedByName: document.requested_by
        ? (names.get(document.requested_by) ?? null)
        : null,
      receivedByName: document.received_by
        ? (names.get(document.received_by) ?? null)
        : null,
    });
  }

  return items;
}

/** True when a student is missing a checklist row for an active requirement. */
export function hasMissingChecklistRows(
  items: ChecklistItem[],
  activeRequirementCount: number,
): boolean {
  return items.length < activeRequirementCount;
}

export async function getStudentReadiness(
  studentId: string,
): Promise<DocumentReadiness> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("student_document_readiness")
    .select("*")
    .eq("student_id", studentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return toReadiness(data ?? null);
}

/**
 * Readiness for every student in one read, so the Students list can show a
 * plain "9/13" without a query per row.
 */
export async function listStudentReadiness(): Promise<
  Map<string, DocumentReadiness>
> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("student_document_readiness")
    .select("*");

  if (error) throw new Error(error.message);

  const map = new Map<string, DocumentReadiness>();
  for (const row of data ?? []) {
    map.set(row.student_id, toReadiness(row));
  }
  return map;
}

/** The current merged PDF for one student, with the name of who uploaded it. */
export type PlacementPackage = {
  record: StudentPackageRow;
  uploadedByName: string | null;
};

/**
 * The student's Final Placement Package, or null when nothing has been
 * uploaded yet.
 *
 * The package is optional at every point. It is prepared outside this
 * application once the checklist is ready and it never affects readiness.
 */
export async function getStudentPlacementPackage(
  studentId: string,
): Promise<PlacementPackage | null> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("student_placement_packages")
    .select("*")
    .eq("student_id", studentId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  let uploadedByName: string | null = null;
  if (data.uploaded_by) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", data.uploaded_by)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);
    uploadedByName = profile?.full_name ?? null;
  }

  return { record: data, uploadedByName };
}

/** Student count per requirement, so Admin can see what is already in use. */
export async function countDocumentsByRequirement(): Promise<
  Record<string, number>
> {
  await requireActiveStaff();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("student_placement_documents")
    .select("requirement_id");

  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.requirement_id] = (counts[row.requirement_id] ?? 0) + 1;
  }
  return counts;
}
