"use client";

import { useRouter } from "next/navigation";

import { BATCH_STATUS_LABELS } from "@/lib/placement/constants";
import { emptyPlanningValues, planningHref } from "@/lib/planning/filters";
import type { BatchRow } from "@/lib/supabase/database.types";

/**
 * Which batch are we planning?
 *
 * The options are the real batch records, in the order Admin arranged them.
 * No intake name is hard-coded anywhere: an academy that stops running "April /
 * June / August" changes nothing but its batch rows.
 *
 * Archived batches stay selectable and are labelled as archived. Planning a
 * finished batch is a legitimate thing to look back at, and hiding them would
 * make an archived batch's students look like they had vanished.
 *
 * Choosing a batch resets the drill-down: an Area or a filter from the previous
 * batch means nothing here.
 */
export default function BatchSelector({
  batches,
  selectedId,
  basePath,
}: {
  batches: BatchRow[];
  selectedId: string | null;
  basePath: string;
}) {
  const router = useRouter();

  const active = batches.filter((batch) => batch.status === "active");
  const archived = batches.filter((batch) => batch.status !== "active");

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="planning-batch"
        className="text-[16px] font-medium text-ink"
      >
        Batch
      </label>
      <select
        id="planning-batch"
        className="h-14 w-full rounded-2xl border border-line bg-surface px-5 text-[17px] text-ink outline-none focus:border-brand sm:w-[24rem]"
        value={selectedId ?? ""}
        onChange={(event) =>
          router.push(
            planningHref(basePath, emptyPlanningValues, {
              batch: event.target.value,
            }),
          )
        }
      >
        {active.map((batch) => (
          <option key={batch.id} value={batch.id}>
            {batch.name}
          </option>
        ))}
        {archived.map((batch) => (
          <option key={batch.id} value={batch.id}>
            {batch.name} ({BATCH_STATUS_LABELS[batch.status]})
          </option>
        ))}
      </select>
    </div>
  );
}
