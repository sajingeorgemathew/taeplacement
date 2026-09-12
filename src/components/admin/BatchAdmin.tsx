"use client";

import { Archive, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import { emptyFormState, type FormState } from "@/lib/forms/state";
import { formatDate, studentCountLabel } from "@/lib/format";
import { BATCH_STATUS_LABELS } from "@/lib/placement/constants";
import type { BatchRow } from "@/lib/supabase/database.types";

import BatchForm from "./BatchForm";

type BatchAction = (state: FormState, formData: FormData) => Promise<FormState>;

type BatchAdminProps = {
  batches: BatchRow[];
  /** Student count per batch id, used to explain why a batch cannot be removed. */
  studentCounts: Record<string, number>;
  canManage: boolean;
  createAction: BatchAction;
  updateAction: BatchAction;
  setStatusAction: BatchAction;
};

function StatusButton({
  batch,
  action,
  disabled,
}: {
  batch: BatchRow;
  action: BatchAction;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const archiving = batch.status === "active";

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="batch_id" value={batch.id} />
      <input
        type="hidden"
        name="status"
        value={archiving ? "archived" : "active"}
      />
      <button
        type="submit"
        disabled={disabled || pending}
        className="inline-flex items-center gap-2 rounded-2xl border border-line px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:bg-surface-muted disabled:opacity-60"
      >
        {archiving ? (
          <Archive size={20} aria-hidden="true" />
        ) : (
          <RotateCcw size={20} aria-hidden="true" />
        )}
        {pending ? "Saving..." : archiving ? "Archive" : "Reactivate"}
      </button>
      {state.error ? (
        <p role="alert" className="text-[15px] text-attention-ink">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Batch Management. Batches are created, edited, archived, and reactivated
 * here. They are never deleted, so archived batches stay available as history.
 */
export default function BatchAdmin({
  batches,
  studentCounts,
  canManage,
  createAction,
  updateAction,
  setStatusAction,
}: BatchAdminProps) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-8">
      {!canManage ? (
        <p className="rounded-2xl border border-info-line bg-info-soft px-6 py-4 text-[16px] text-info-ink">
          You can view batches here. Only an admin can create, edit, or archive
          them.
        </p>
      ) : null}

      {canManage ? (
        <section className="rounded-3xl border border-line bg-surface p-7 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-[24px] font-semibold tracking-tight text-ink">
              New Batch
            </h2>
            <button
              type="button"
              onClick={() => setCreating((open) => !open)}
              aria-expanded={creating}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              <Plus size={22} aria-hidden="true" />
              {creating ? "Hide form" : "Create Batch"}
            </button>
          </div>

          {creating ? (
            <div className="mt-7">
              <BatchForm
                idPrefix="new-batch"
                action={createAction}
                submitLabel="Create Batch"
                onDone={() => setCreating(false)}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="batch-list-heading">
        <h2
          id="batch-list-heading"
          className="mb-6 text-[24px] font-semibold tracking-tight text-ink"
        >
          Batches
        </h2>

        {batches.length === 0 ? (
          <div className="rounded-3xl border border-line bg-surface p-8">
            <p className="text-[17px] text-ink-muted">
              No batches yet. Create the first batch above.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-5">
            {batches.map((batch) => {
              const count = studentCounts[batch.id] ?? 0;
              const isEditing = editingId === batch.id;

              return (
                <li
                  key={batch.id}
                  className="rounded-3xl border border-line bg-surface p-7 sm:p-8"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-[22px] font-semibold leading-tight text-ink">
                          {batch.name}
                        </h3>
                        <span
                          className={`rounded-full border px-4 py-1.5 text-[15px] font-medium ${
                            batch.status === "active"
                              ? "border-ready-line bg-ready-soft text-ready-ink"
                              : "border-line bg-surface-muted text-ink-muted"
                          }`}
                        >
                          {BATCH_STATUS_LABELS[batch.status]}
                        </span>
                      </div>

                      <p className="mt-2 text-[16px] text-ink-muted">
                        {batch.program}
                        {batch.schedule_label ? ` - ${batch.schedule_label}` : ""}
                        {formatDate(batch.start_date)
                          ? ` - starts ${formatDate(batch.start_date)}`
                          : ""}
                      </p>
                      <p className="mt-1 text-[16px] text-ink-muted">
                        {studentCountLabel(count)}
                        {batch.sort_order !== null
                          ? ` - sort order ${batch.sort_order}`
                          : ""}
                      </p>
                      {count > 0 ? (
                        <p className="mt-1 text-[15px] text-ink-muted">
                          Batches with students are archived, never deleted.
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-3 lg:shrink-0">
                      <Link
                        href={`/students/batches/${batch.id}`}
                        className="rounded-2xl border border-line px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
                      >
                        View Students
                      </Link>
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setEditingId(isEditing ? null : batch.id)
                            }
                            aria-expanded={isEditing}
                            className="rounded-2xl border border-line px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:bg-surface-muted"
                          >
                            {isEditing ? "Close" : "Edit"}
                          </button>
                          <StatusButton
                            batch={batch}
                            action={setStatusAction}
                            disabled={false}
                          />
                        </>
                      ) : null}
                    </div>
                  </div>

                  {isEditing && canManage ? (
                    <div className="mt-7 border-t border-line pt-7">
                      <BatchForm
                        idPrefix={`batch-${batch.id}`}
                        action={updateAction}
                        batch={batch}
                        submitLabel="Save Batch"
                        onDone={() => setEditingId(null)}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
