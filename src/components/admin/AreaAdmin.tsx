"use client";

import { Archive, ArrowDown, ArrowUp, Plus, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";

import { partnerCountLabel } from "@/lib/format";
import {
  createAreaAction,
  moveAreaAction,
  setAreaActiveAction,
  updateAreaAction,
} from "@/lib/partners/actions";
import { areaColorStyle } from "@/lib/partners/area-colors";
import { AREA_COLOR_LABELS } from "@/lib/placement/constants";
import type { PlacementAreaRow } from "@/lib/supabase/database.types";

import AreaForm from "./AreaForm";

type AreaAdminProps = {
  areas: PlacementAreaRow[];
  /** Partners per area id, so Admin sees what an archive would affect. */
  usageCounts: Record<string, number>;
  canManage: boolean;
};

const ACTION_BUTTON =
  "inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60";

const ICON_BUTTON =
  "inline-flex items-center justify-center rounded-2xl border border-line bg-surface p-3.5 text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-40";

/**
 * Placement Areas.
 *
 * Areas are added, renamed, described, reordered, archived, and reactivated
 * here. They are never hard deleted: a partner that references an area keeps its
 * record, and the database refuses a delete while any partner points at it.
 *
 * The Area Board reads these rows directly, so every change here shows up as a
 * board column with no code change.
 */
export default function AreaAdmin({
  areas,
  usageCounts,
  canManage,
}: AreaAdminProps) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const active = areas.filter((area) => area.is_active);
  const archived = areas.filter((area) => !area.is_active);
  const nextSortOrder =
    areas.reduce((highest, area) => Math.max(highest, area.sort_order), 0) + 10;

  function run(work: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      setError(result.error);
    });
  }

  function renderArea(
    area: PlacementAreaRow,
    index: number,
    list: PlacementAreaRow[],
  ) {
    const usage = usageCounts[area.id] ?? 0;
    const isEditing = editingId === area.id;
    const color = areaColorStyle(area.color_key);

    return (
      <li
        key={area.id}
        className="rounded-3xl border border-line bg-surface p-7 sm:p-8"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span
                aria-hidden="true"
                className={`h-6 w-6 shrink-0 rounded-full ${color.swatch}`}
              />
              <h3 className="text-[22px] font-semibold leading-tight text-ink">
                {area.name}
              </h3>
              <span
                className={`rounded-full border px-4 py-1.5 text-[15px] font-medium ${
                  area.is_active
                    ? "border-ready-line bg-ready-soft text-ready-ink"
                    : "border-line bg-surface-muted text-ink-muted"
                }`}
              >
                {area.is_active ? "Active" : "Archived"}
              </span>
            </div>

            {area.description ? (
              <p className="mt-2 text-[16px] text-ink-muted">
                {area.description}
              </p>
            ) : null}

            <p className="mt-2 text-[16px] text-ink-muted">
              {partnerCountLabel(usage)} - display order {area.sort_order} -{" "}
              {AREA_COLOR_LABELS[area.color_key]} on the board
            </p>

            {usage > 0 ? (
              <p className="mt-1 text-[15px] text-ink-muted">
                Areas that partners point at are archived, never deleted.
                {area.is_active
                  ? ""
                  : " Those partners show under Unassigned until they are given a new area."}
              </p>
            ) : null}
          </div>

          {canManage ? (
            <div className="flex flex-wrap items-start gap-3 lg:shrink-0">
              {area.is_active ? (
                <>
                  <button
                    type="button"
                    aria-label={`Move ${area.name} earlier`}
                    disabled={pending || index === 0}
                    onClick={() =>
                      run(() =>
                        moveAreaAction({ areaId: area.id, direction: "up" }),
                      )
                    }
                    className={ICON_BUTTON}
                  >
                    <ArrowUp size={20} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${area.name} later`}
                    disabled={pending || index === list.length - 1}
                    onClick={() =>
                      run(() =>
                        moveAreaAction({ areaId: area.id, direction: "down" }),
                      )
                    }
                    className={ICON_BUTTON}
                  >
                    <ArrowDown size={20} aria-hidden="true" />
                  </button>
                </>
              ) : null}

              <button
                type="button"
                onClick={() => setEditingId(isEditing ? null : area.id)}
                aria-expanded={isEditing}
                className={ACTION_BUTTON}
              >
                {isEditing ? "Close" : "Rename / Edit"}
              </button>

              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    setAreaActiveAction({
                      areaId: area.id,
                      isActive: !area.is_active,
                    }),
                  )
                }
                className={ACTION_BUTTON}
              >
                {area.is_active ? (
                  <>
                    <Archive size={18} aria-hidden="true" />
                    Archive
                  </>
                ) : (
                  <>
                    <RotateCcw size={18} aria-hidden="true" />
                    Reactivate
                  </>
                )}
              </button>
            </div>
          ) : null}
        </div>

        {isEditing && canManage ? (
          <div className="mt-7 border-t border-line pt-7">
            <AreaForm
              idPrefix={`area-${area.id}`}
              action={updateAreaAction}
              area={area}
              submitLabel="Save Area"
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
          You can view placement areas here. Only an admin can add, rename,
          reorder, or archive them.
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

      <p className="rounded-2xl border border-line bg-surface px-6 py-4 text-[16px] text-ink-muted">
        Unassigned is not an area. A partner with no area is Unassigned, and it is
        always the first column on the Area Board, so it cannot be renamed,
        reordered, or removed.
      </p>

      {canManage ? (
        <section className="rounded-3xl border border-line bg-surface p-7 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-[24px] font-semibold tracking-tight text-ink">
              New Area
            </h2>
            <button
              type="button"
              onClick={() => setCreating((open) => !open)}
              aria-expanded={creating}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              <Plus size={22} aria-hidden="true" />
              {creating ? "Hide form" : "Add Area"}
            </button>
          </div>

          {creating ? (
            <div className="mt-7">
              <AreaForm
                idPrefix="new-area"
                action={createAreaAction}
                submitLabel="Add Area"
                defaultSortOrder={nextSortOrder}
                onDone={() => setCreating(false)}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="area-list-heading">
        <h2
          id="area-list-heading"
          className="mb-6 text-[24px] font-semibold tracking-tight text-ink"
        >
          Areas on the Board
        </h2>

        {active.length === 0 ? (
          <div className="rounded-3xl border border-line bg-surface p-8">
            <p className="text-[17px] text-ink-muted">
              No active areas. Every partner sits in Unassigned until an area is
              added.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-5">
            {active.map((area, index) => renderArea(area, index, active))}
          </ul>
        )}
      </section>

      {archived.length > 0 ? (
        <section aria-labelledby="archived-area-heading">
          <h2
            id="archived-area-heading"
            className="mb-3 text-[24px] font-semibold tracking-tight text-ink"
          >
            Archived Areas
          </h2>
          <p className="mb-6 text-[17px] text-ink-muted">
            Archived areas leave the board. Partners that still reference one keep
            their record and surface under Unassigned.
          </p>
          <ul className="flex flex-col gap-5">
            {archived.map((area, index) => renderArea(area, index, archived))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
