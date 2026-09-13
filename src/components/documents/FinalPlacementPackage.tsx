"use client";

import { ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import {
  removePlacementPackageAction,
  uploadPlacementPackageAction,
} from "@/lib/documents/actions";
import type { PlacementPackage } from "@/lib/documents/queries";
import {
  PACKAGE_FILE_ACCEPT,
  PACKAGE_FILE_HINT,
  formatFileSize,
  validatePackageFile,
} from "@/lib/documents/storage";
import { formatTimestamp } from "@/lib/format";

const BUTTON =
  "inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60";

const PRIMARY_BUTTON =
  "inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60";

/**
 * The one merged PDF per student.
 *
 * The 13 requirements above are a readiness checklist and hold no files. Once
 * they are ready, an admin merges the documents outside this application and
 * uploads the result here. The package is optional the whole time the documents
 * are being prepared and never affects the readiness count.
 */
export default function FinalPlacementPackage({
  studentId,
  placementPackage,
  canManage,
}: {
  studentId: string;
  placementPackage: PlacementPackage | null;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const record = placementPackage?.record ?? null;
  const fileSize = formatFileSize(record?.file_size_bytes);
  const uploadedAt = formatTimestamp(record?.uploaded_at);

  function run(work: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      setError(result.error);
      if (!result.error) setConfirmingRemove(false);
    });
  }

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const invalid = validatePackageFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }

    const formData = new FormData();
    formData.set("student_id", studentId);
    formData.set("file", file);
    run(() => uploadPlacementPackageAction(formData));
  }

  return (
    <section
      aria-labelledby="final-package-heading"
      className={`rounded-3xl border bg-surface p-7 sm:p-8 ${
        pending ? "border-brand" : "border-line"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            id="final-package-heading"
            className="text-[26px] font-semibold tracking-tight text-ink"
          >
            Final Placement Package
          </h2>
          <p className="mt-2 max-w-2xl text-[17px] text-ink-muted">
            One merged PDF of this student&apos;s placement documents, prepared
            outside TAE Placement once the checklist above is ready. Optional
            while the documents are still being collected, and never part of the
            readiness count.
          </p>
        </div>

        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-5 py-2.5 text-[16px] font-medium ${
            record
              ? "border-ready-line bg-ready-soft text-ready-ink"
              : "border-line bg-surface-muted text-ink-muted"
          }`}
        >
          {record ? "Uploaded" : "Not Uploaded"}
        </span>
      </div>

      {record ? (
        <div className="mt-6 rounded-2xl border border-line bg-surface-muted p-6">
          <p className="flex items-start gap-3 text-[18px] text-ink">
            <FileText
              size={22}
              aria-hidden="true"
              className="mt-1 shrink-0 text-ink-muted"
            />
            <span className="min-w-0 break-all">
              {record.original_file_name ?? "Final placement package.pdf"}
              {fileSize ? ` (${fileSize})` : ""}
            </span>
          </p>
          <p className="mt-3 text-[16px] text-ink-muted">
            Uploaded {uploadedAt ?? "recently"}
            {placementPackage?.uploadedByName
              ? ` by ${placementPackage.uploadedByName}`
              : ""}
          </p>
        </div>
      ) : (
        <p className="mt-6 rounded-2xl border border-line bg-surface-muted px-6 py-5 text-[17px] text-ink-muted">
          No merged package has been uploaded for this student yet.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {record ? (
          <a
            href={`/api/placement-packages/${studentId}`}
            target="_blank"
            rel="noreferrer"
            className={BUTTON}
          >
            <ExternalLink size={20} aria-hidden="true" />
            View
          </a>
        ) : null}

        {canManage ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => fileInputRef.current?.click()}
              className={record ? BUTTON : PRIMARY_BUTTON}
            >
              <Upload size={20} aria-hidden="true" />
              {pending
                ? "Uploading..."
                : record
                  ? "Replace"
                  : "Upload Merged PDF"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={PACKAGE_FILE_ACCEPT}
              onChange={onFileChosen}
              className="sr-only"
              aria-label="Upload the final placement package"
            />

            {record ? (
              confirmingRemove ? (
                <>
                  <span className="text-[16px] text-ink">
                    Remove this package?
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() => removePlacementPackageAction({ studentId }))
                    }
                    className="rounded-2xl border border-attention bg-attention-soft px-5 py-3.5 text-[16px] font-semibold text-attention-ink transition-colors hover:bg-white disabled:opacity-60"
                  >
                    {pending ? "Removing..." : "Yes, remove"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRemove(false)}
                    className={BUTTON}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirmingRemove(true)}
                  className={BUTTON}
                >
                  <Trash2 size={20} aria-hidden="true" />
                  Remove
                </button>
              )
            ) : null}
          </>
        ) : null}
      </div>

      <p className="mt-4 text-[16px] text-ink-muted">
        {canManage
          ? PACKAGE_FILE_HINT
          : "Your account can view the placement package but not change it."}
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-2xl border border-attention-line bg-attention-soft px-5 py-3 text-[16px] text-attention-ink"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
