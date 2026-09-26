"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { BATCH_STATUS_LABELS } from "@/lib/placement/constants";
import {
  ALL_STUDENTS_VALUE,
  isOperationalBatch,
  type OperationsScope,
} from "@/lib/placement/operations";
import { emptyPlanningValues, planningHref } from "@/lib/planning/filters";
import type { BatchRow } from "@/lib/supabase/database.types";

/**
 * Which batch are we planning?
 *
 * The options are the real batch records, in the order Admin arranged them.
 * No intake name is hard-coded anywhere: an academy that stops running "April /
 * June / August" changes nothing but its batch rows.
 *
 * Batch Planning is an operational tool, so by default the choices are the
 * batches in CURRENT placement operations: active and tracked. Older batches
 * are not gone; "Show all batches" lists every batch, archived ones labelled,
 * and a batch that arrived by direct link is always in the list whatever its
 * status. Planning a finished batch is a legitimate thing to look back at.
 *
 * Choosing a batch resets the drill-down: an Area or a filter from the previous
 * batch means nothing here. The scope is kept.
 */
export default function BatchSelector({
  batches,
  scope,
  selectedId,
  basePath,
}: {
  /** Already narrowed to the scope (plus the selected batch). */
  batches: BatchRow[];
  scope: OperationsScope;
  selectedId: string | null;
  basePath: string;
}) {
  const router = useRouter();
  const showingAll = scope === "all";
  const scopeValue = showingAll ? ALL_STUDENTS_VALUE : "";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <label
          htmlFor="planning-batch"
          className="text-[16px] font-medium text-ink"
        >
          Batch
        </label>
        <Link
          href={planningHref(basePath, emptyPlanningValues, {
            batch: selectedId ?? "",
            operations: showingAll ? "" : ALL_STUDENTS_VALUE,
          })}
          className="text-[15px] font-medium text-brand-strong hover:underline"
        >
          {showingAll ? "Current batches only" : "Show all batches"}
        </Link>
      </div>
      <select
        id="planning-batch"
        className="h-14 w-full rounded-2xl border border-line bg-surface px-5 text-[17px] text-ink outline-none focus:border-brand sm:w-[24rem]"
        value={selectedId ?? ""}
        onChange={(event) =>
          router.push(
            planningHref(basePath, emptyPlanningValues, {
              batch: event.target.value,
              operations: scopeValue,
            }),
          )
        }
      >
        {batches.map((batch) => (
          <option key={batch.id} value={batch.id}>
            {batchOptionLabel(batch)}
          </option>
        ))}
      </select>
      <p className="text-[14px] text-ink-muted">
        {showingAll
          ? "Every batch, including those not tracked in Placement Operations and archived ones."
          : "Batches tracked in Placement Operations."}
      </p>
    </div>
  );
}

/** Archived and untracked batches say so, so an old choice is never a surprise. */
function batchOptionLabel(batch: BatchRow): string {
  if (batch.status === "archived") {
    return `${batch.name} (${BATCH_STATUS_LABELS[batch.status]})`;
  }
  if (!isOperationalBatch(batch)) return `${batch.name} (Not Tracking)`;
  return batch.name;
}
