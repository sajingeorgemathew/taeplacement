"use client";

import { Archive, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";

import { setPartnerActiveAction } from "@/lib/partners/actions";

/**
 * Archive or restore a partner.
 *
 * Archiving takes a partner off the Area Board and out of List View. It never
 * deletes the record, its contacts, or its comments.
 */
export default function PartnerArchiveButton({
  partnerId,
  isActive,
}: {
  partnerId: string;
  isActive: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await setPartnerActiveAction({
              partnerId,
              isActive: !isActive,
            });
            setError(result.error);
          });
        }}
        className="inline-flex items-center gap-2 rounded-2xl border border-line px-6 py-4 text-[17px] font-medium text-ink transition-colors hover:bg-surface-muted disabled:opacity-60"
      >
        {isActive ? (
          <>
            <Archive size={20} aria-hidden="true" />
            {pending ? "Saving..." : "Archive Partner"}
          </>
        ) : (
          <>
            <RotateCcw size={20} aria-hidden="true" />
            {pending ? "Saving..." : "Restore Partner"}
          </>
        )}
      </button>
      {error ? (
        <p role="alert" className="text-[15px] text-attention-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
