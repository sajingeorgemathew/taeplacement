import { NextResponse } from "next/server";

import { requireActiveStaff } from "@/lib/auth/session";
import {
  DOCUMENT_BUCKET,
  DOCUMENT_SIGNED_URL_SECONDS,
} from "@/lib/documents/storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Opens the private Final Placement Package for one student.
 *
 * There is no permanent public URL anywhere in this application. Each view
 * mints a fresh short lived signed URL for a signed in, admin activated staff
 * member and redirects to it. Row Level Security on the storage bucket is the
 * real boundary: a request from anyone else is refused by Supabase, not by this
 * handler.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/placement-packages/[studentId]">,
) {
  await requireActiveStaff();
  const { studentId } = await context.params;

  const supabase = await createSupabaseServerClient();

  const { data: placementPackage, error } = await supabase
    .from("student_placement_packages")
    .select("file_path")
    .eq("student_id", studentId)
    .maybeSingle();

  if (error || !placementPackage?.file_path) {
    return new NextResponse("No final placement package on file.", {
      status: 404,
    });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(placementPackage.file_path, DOCUMENT_SIGNED_URL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return new NextResponse("That file could not be opened.", { status: 404 });
  }

  // no-store so a signed URL never lands in a shared or browser cache.
  return NextResponse.redirect(signed.signedUrl, {
    headers: { "Cache-Control": "no-store" },
  });
}
