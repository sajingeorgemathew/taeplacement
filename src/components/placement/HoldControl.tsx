"use client";

import { PauseCircle, PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { holdStudentAction, releaseHoldAction } from "@/lib/placement/actions";

/**
 * Put a student On Hold, or take them off it.
 *
 * A hold is a pause, not a stage: it says "do not match this student right
 * now". Releasing it never assumes the student is Ready. Where they land is
 * resolved from the facts by the database, which is their live placement if
 * they still have one, and their current document readiness otherwise.
 */
export default function HoldControl({
  studentId,
  onHold,
  holdReason,
}: {
  studentId: string;
  onHold: boolean;
  holdReason: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(work: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="border-t border-line pt-6">
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink"
        >
          {error}
        </p>
      ) : null}

      {onHold ? (
        <div className="flex flex-col gap-3">
          <p className="text-[16px] text-ink-muted">
            {holdReason
              ? `On hold: ${holdReason}`
              : "This student is on hold. No reason was recorded."}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => releaseHoldAction({ studentId }))}
            className="inline-flex w-fit items-center gap-2 rounded-2xl border border-line px-6 py-4 text-[17px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60"
          >
            <PlayCircle size={20} aria-hidden="true" />
            {pending ? "Releasing..." : "Release Hold"}
          </button>
          <p className="text-[15px] text-ink-muted">
            They go back to their current placement if they still have one, and
            otherwise to whatever their documents say. Never straight to Ready.
          </p>
        </div>
      ) : open ? (
        <div className="rounded-2xl border border-line bg-surface-muted p-6">
          <label
            htmlFor={`hold-reason-${studentId}`}
            className="block text-[16px] font-medium text-ink"
          >
            Why is this student on hold? Optional.
          </label>
          <input
            id={`hold-reason-${studentId}`}
            type="text"
            value={reason}
            maxLength={200}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Waiting on a medical clearance"
            className="mt-2 h-14 w-full rounded-2xl border border-line bg-surface px-5 text-[17px] text-ink outline-none focus:border-brand"
          />
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() =>
                  holdStudentAction({
                    studentId,
                    reason: reason.trim() || null,
                  }),
                )
              }
              className="rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
            >
              {pending ? "Saving..." : "Put On Hold"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setReason("");
                setError(null);
              }}
              className="rounded-2xl border border-line bg-surface px-6 py-4 text-[17px] font-medium text-ink transition-colors hover:bg-surface-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-2xl border border-line px-6 py-4 text-[17px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
        >
          <PauseCircle size={20} aria-hidden="true" />
          Put On Hold
        </button>
      )}
    </div>
  );
}
