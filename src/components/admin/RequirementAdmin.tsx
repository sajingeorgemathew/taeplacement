"use client";

import { Archive, ArrowDown, ArrowUp, Plus, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";

import {
  createRequirementAction,
  moveRequirementAction,
  setRequirementActiveAction,
  setRequirementRequiredAction,
  updateRequirementAction,
} from "@/lib/documents/actions";
import { studentCountLabel } from "@/lib/format";
import type { DocumentRequirementRow } from "@/lib/supabase/database.types";

import RequirementForm from "./RequirementForm";

type RequirementAdminProps = {
  requirements: DocumentRequirementRow[];
  /** Student checklist rows per requirement, so Admin sees what is in use. */
  usageCounts: Record<string, number>;
  canManage: boolean;
};

const ACTION_BUTTON =
  "inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60";

const ICON_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-line bg-surface p-3.5 text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-40";

/**
 * Document Requirements.
 *
 * Requirements are added, edited, reordered, switched between required and
 * optional, archived, and reactivated here. They are never hard deleted, so
 * every student row that already points at one keeps its meaning.
 */
export default function RequirementAdmin({
  requirements,
  usageCounts,
  canManage,
}: RequirementAdminProps) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const active = requirements.filter((requirement) => requirement.is_active);
  const archived = requirements.filter((requirement) => !requirement.is_active);
  const nextSortOrder =
    requirements.reduce(
      (highest, requirement) => Math.max(highest, requirement.sort_order),
      0,
    ) + 10;

  function run(work: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      setError(result.error);
    });
  }

  function renderRequirement(
    requirement: DocumentRequirementRow,
    index: number,
    list: DocumentRequirementRow[],
  ) {
    const usage = usageCounts[requirement.id] ?? 0;
    const isEditing = editingId === requirement.id;

    return (
      <li
        key={requirement.id}
        className="rounded-3xl border border-line bg-surface p-7 sm:p-8"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-[22px] font-semibold leading-tight text-ink">
                {requirement.name}
              </h3>
              <span
                className={`rounded-full border px-4 py-1.5 text-[15px] font-medium ${
                  requirement.is_required
                    ? "border-info-line bg-info-soft text-info-ink"
                    : "border-line bg-surface-muted text-ink-muted"
                }`}
              >
                {requirement.is_required ? "Required" : "Optional"}
              </span>
              {requirement.is_active ? null : (
                <span className="rounded-full border border-line bg-surface-muted px-4 py-1.5 text-[15px] font-medium text-ink-muted">
                  Archived
                </span>
              )}
            </div>

            {requirement.description ? (
              <p className="mt-2 max-w-2xl text-[16px] text-ink-muted">
                {requirement.description}
              </p>
            ) : null}

            <p className="mt-2 text-[16px] text-ink-muted">
              {requirement.short_name
                ? `Short name ${requirement.short_name} - `
                : ""}
              order {requirement.sort_order} - on{" "}
              {studentCountLabel(usage)}
            </p>
            {usage > 0 ? (
              <p className="mt-1 text-[15px] text-ink-muted">
                Requirements in use are archived, never deleted.
              </p>
            ) : null}
          </div>

          {canManage ? (
            <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
              {requirement.is_active ? (
                <>
                  <button
                    type="button"
                    aria-label={`Move ${requirement.name} up`}
                    disabled={pending || index === 0}
                    onClick={() =>
                      run(() =>
                        moveRequirementAction({
                          requirementId: requirement.id,
                          direction: "up",
                        }),
                      )
                    }
                    className={ICON_BUTTON}
                  >
                    <ArrowUp size={20} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${requirement.name} down`}
                    disabled={pending || index === list.length - 1}
                    onClick={() =>
                      run(() =>
                        moveRequirementAction({
                          requirementId: requirement.id,
                          direction: "down",
                        }),
                      )
                    }
                    className={ICON_BUTTON}
                  >
                    <ArrowDown size={20} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        setRequirementRequiredAction({
                          requirementId: requirement.id,
                          isRequired: !requirement.is_required,
                        }),
                      )
                    }
                    className={ACTION_BUTTON}
                  >
                    {requirement.is_required
                      ? "Make Optional"
                      : "Make Required"}
                  </button>
                </>
              ) : null}

              <button
                type="button"
                onClick={() => setEditingId(isEditing ? null : requirement.id)}
                aria-expanded={isEditing}
                className={ACTION_BUTTON}
              >
                {isEditing ? "Close" : "Edit"}
              </button>

              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    setRequirementActiveAction({
                      requirementId: requirement.id,
                      isActive: !requirement.is_active,
                    }),
                  )
                }
                className={ACTION_BUTTON}
              >
                {requirement.is_active ? (
                  <>
                    <Archive size={20} aria-hidden="true" />
                    Archive
                  </>
                ) : (
                  <>
                    <RotateCcw size={20} aria-hidden="true" />
                    Reactivate
                  </>
                )}
              </button>
            </div>
          ) : null}
        </div>

        {isEditing && canManage ? (
          <div className="mt-7 border-t border-line pt-7">
            <RequirementForm
              idPrefix={`requirement-${requirement.id}`}
              action={updateRequirementAction}
              requirement={requirement}
              submitLabel="Save Document"
              onDone={() => setEditingId(null)}
            />
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {!canManage ? (
        <p className="rounded-2xl border border-info-line bg-info-soft px-6 py-4 text-[16px] text-info-ink">
          You can view the document requirements here. Only an admin can add,
          edit, reorder, or archive them.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink"
        >
          {error}
        </p>
      ) : null}

      {canManage ? (
        <section className="rounded-3xl border border-line bg-surface p-7 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-[24px] font-semibold tracking-tight text-ink">
              New Document Requirement
            </h2>
            <button
              type="button"
              onClick={() => setCreating((open) => !open)}
              aria-expanded={creating}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              <Plus size={22} aria-hidden="true" />
              {creating ? "Hide form" : "Add Document"}
            </button>
          </div>

          <p className="mt-3 text-[16px] text-ink-muted">
            A new requirement is added to every active student automatically. No
            duplicate rows are created.
          </p>

          {creating ? (
            <div className="mt-7">
              <RequirementForm
                idPrefix="new-requirement"
                action={createRequirementAction}
                submitLabel="Add Document"
                defaultSortOrder={nextSortOrder}
                onDone={() => setCreating(false)}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="active-requirements-heading">
        <h2
          id="active-requirements-heading"
          className="mb-6 text-[24px] font-semibold tracking-tight text-ink"
        >
          Active Documents
        </h2>

        {active.length === 0 ? (
          <div className="rounded-3xl border border-line bg-surface p-8">
            <p className="text-[17px] text-ink-muted">
              No active document requirements. Add the first one above.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-5">
            {active.map((requirement, index) =>
              renderRequirement(requirement, index, active),
            )}
          </ul>
        )}
      </section>

      {archived.length > 0 ? (
        <section aria-labelledby="archived-requirements-heading">
          <h2
            id="archived-requirements-heading"
            className="mb-2 text-[24px] font-semibold tracking-tight text-ink"
          >
            Archived Documents
          </h2>
          <p className="mb-6 text-[17px] text-ink-muted">
            Archived documents stay off new checklists. Reactivating one hands it
            back to every active student.
          </p>
          <ul className="flex flex-col gap-5">
            {archived.map((requirement, index) =>
              renderRequirement(requirement, index, archived),
            )}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
