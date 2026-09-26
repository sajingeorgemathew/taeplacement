"use client";

import { Archive, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";

import {
  PLACEMENT_TRACKING_HELPER_TEXT,
  PLACEMENT_TRACKING_LABEL,
  PLACEMENT_TRACKING_OFF_LABEL,
  PLACEMENT_TRACKING_ON_LABEL,
} from "@/lib/batches/tracking";
import { emptyFormState, type FormState } from "@/lib/forms/state";
import { formatDate, studentCountLabel } from "@/lib/format";
import { BATCH_STATUS_LABELS } from "@/lib/placement/constants";
import { isOperationalBatch } from "@/lib/placement/operations";
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
  /** Writes placement_tracking_enabled and nothing else. */
  setTrackingAction: BatchAction;
};

const PILL_BASE =
  "rounded-full border px-4 py-1.5 text-[15px] font-medium";
const PILL_READY = `${PILL_BASE} border-ready-line bg-ready-soft text-ready-ink`;
const PILL_INFO = `${PILL_BASE} border-info-line bg-info-soft text-info-ink`;
const PILL_MUTED = `${PILL_BASE} border-line bg-surface-muted text-ink-muted`;

/**
 * Program, Status, and Placement Operations, side by side on every batch.
 *
 * "Tracking" means status active AND the flag on: the one rule the dashboard
 * reads. An archived batch with the flag still on therefore shows Not
 * Tracking, because that is what the dashboard will do with it.
 */
function BatchPills({ batch }: { batch: BatchRow }) {
  const tracking = isOperationalBatch(batch);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={PILL_INFO} title="Program">
        {batch.program}
      </span>
      <span
        className={batch.status === "active" ? PILL_READY : PILL_MUTED}
        title="Status"
      >
        {BATCH_STATUS_LABELS[batch.status]}
      </span>
      <span
        className={tracking ? PILL_READY : PILL_MUTED}
        title="Placement Operations"
      >
        Placement Operations:{" "}
        {tracking ? PLACEMENT_TRACKING_ON_LABEL : PLACEMENT_TRACKING_OFF_LABEL}
      </span>
    </div>
  );
}

/**
 * The "Track in Placement Operations" checkbox.
 *
 * Saves as soon as it is changed, through an action that updates the one
 * column. The checkbox reflects the stored flag, so an archived batch may show
 * it ticked while the pill above says Not Tracking; the helper line below the
 * box explains that archiving wins.
 */
function TrackingToggle({
  batch,
  action,
}: {
  batch: BatchRow;
  action: BatchAction;
}) {
  const [state, formAction, pending] = useActionState(action, emptyFormState);
  const inputId = `tracking-${batch.id}`;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="batch_id" value={batch.id} />
      <label
        htmlFor={inputId}
        className="flex items-start gap-4 rounded-2xl border border-line bg-surface-muted p-5"
      >
        <input
          id={inputId}
          name="placement_tracking_enabled"
          type="checkbox"
          // Remounts when the saved value changes so the box always shows the
          // stored flag, never a stale default.
          key={String(batch.placement_tracking_enabled)}
          defaultChecked={batch.placement_tracking_enabled}
          disabled={pending}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="mt-1 h-6 w-6 shrink-0 rounded border-line accent-[var(--brand)]"
        />
        <span>
          <span className="block text-[17px] font-medium text-ink">
            {PLACEMENT_TRACKING_LABEL}
            {pending ? (
              <span className="ml-3 text-[15px] font-normal text-ink-muted">
                Saving...
              </span>
            ) : null}
          </span>
          <span className="mt-1 block text-[15px] text-ink-muted">
            {PLACEMENT_TRACKING_HELPER_TEXT}
          </span>
          {batch.status === "archived" ? (
            <span className="mt-2 block text-[15px] text-ink-muted">
              This batch is archived, so it stays out of current placement
              operations whatever this setting says.
            </span>
          ) : null}
        </span>
      </label>
      {state.error ? (
        <p role="alert" className="text-[15px] text-attention-ink">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

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
  setTrackingAction,
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
                      <h3 className="text-[22px] font-semibold leading-tight text-ink">
                        {batch.name}
                      </h3>
                      <div className="mt-3">
                        <BatchPills batch={batch} />
                      </div>

                      <p className="mt-3 text-[16px] text-ink-muted">
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

                  {canManage ? (
                    <div className="mt-6">
                      <TrackingToggle batch={batch} action={setTrackingAction} />
                    </div>
                  ) : null}

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
