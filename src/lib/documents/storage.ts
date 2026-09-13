/**
 * Private placement document storage rules.
 *
 * Only ONE file per student is ever stored here: the Final Placement Package,
 * the single merged PDF an admin prepares outside this application once the
 * checklist is ready. The 13 requirements themselves are a readiness checklist
 * and hold no files.
 *
 * A merged package contains medical and police-check information, so the bucket
 * is private, paths never contain a student name, and the browser only ever
 * receives a short lived signed URL.
 *
 * These values mirror the bucket configuration in
 * supabase/migrations/0003_final_placement_package.sql. Keep the two in step.
 */

export const DOCUMENT_BUCKET = "placement-documents";

/**
 * 25 MB for the merged package.
 *
 * Higher than the 15 MB single-document limit in 0002 because one merged PDF
 * holds thirteen scanned documents.
 */
export const PACKAGE_MAX_FILE_BYTES = 25 * 1024 * 1024;

/** PDF only. The package is a merged document, never a phone photo. */
export const PACKAGE_MIME_TYPE = "application/pdf";

/** What the upload control tells the file picker to offer. */
export const PACKAGE_FILE_ACCEPT = ".pdf";

export const PACKAGE_FILE_HINT = "One merged PDF, up to 25 MB.";

/** Seconds a signed view URL stays valid. Long enough to open, short enough to leak nothing. */
export const DOCUMENT_SIGNED_URL_SECONDS = 60;

/**
 * Basic upload validation. The bucket enforces the same limits server side and
 * Row Level Security decides who may write at all, so this is the friendly
 * first line rather than the security boundary.
 */
export function validatePackageFile(file: {
  name: string;
  size: number;
  type: string;
}): string | null {
  if (file.size <= 0) {
    return "That file is empty. Choose a different file.";
  }
  if (file.size > PACKAGE_MAX_FILE_BYTES) {
    return "That file is larger than 25 MB. Upload a smaller merged PDF.";
  }
  if (file.type !== PACKAGE_MIME_TYPE) {
    return "The final placement package must be a single PDF.";
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return "The final placement package must be a single PDF.";
  }
  return null;
}

/**
 * students/{student_id}/final-package/{random}.pdf
 *
 * Ids only. A storage path must never leak a student name.
 */
export function buildPackageStoragePath(studentId: string): string {
  return `students/${studentId}/final-package/${crypto.randomUUID()}.pdf`;
}

/** "1.4 MB" for the package file line. */
export function formatFileSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
