"use client";

import { MapPin, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import StatusPill from "@/components/ui/StatusPill";
import { areaColorStyle } from "@/lib/partners/area-colors";
import { setCityAreaAction } from "@/lib/planning/actions";
import type { CityMappingBoard, CityMappingRow } from "@/lib/planning/admin";
import { studentCountLabel } from "@/lib/format";
import type { PlacementAreaRow } from "@/lib/supabase/database.types";

type CityAreaMappingAdminProps = {
  board: CityMappingBoard;
  /** Only ACTIVE areas are offered. An archived area is not a valid choice. */
  activeAreas: PlacementAreaRow[];
  canManage: boolean;
};

const SELECT_CLASSES =
  "h-14 w-full rounded-2xl border border-line bg-surface px-4 text-[17px] text-ink outline-none focus:border-brand disabled:opacity-60 sm:w-[20rem]";

/** The small live count strip above the list. */
function CountTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "ready" | "attention";
}) {
  const classes =
    tone === "ready"
      ? "border-ready-line bg-ready-soft text-ready-ink"
      : tone === "attention"
        ? "border-attention-line bg-attention-soft text-attention-ink"
        : "border-line bg-surface text-ink";

  return (
    <div className={`rounded-2xl border p-5 ${classes}`}>
      <p className="text-[34px] font-semibold leading-none">{value}</p>
      <p className="mt-2 text-[15px] font-medium">{label}</p>
    </div>
  );
}

function AreaChip({ row }: { row: CityMappingRow }) {
  if (!row.area) {
    return <StatusPill label="Unmapped" tone="attention" />;
  }
  if (!row.area.is_active) {
    return <StatusPill label="Needs Area Review" tone="attention" />;
  }

  const color = areaColorStyle(row.area.color_key);
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-muted px-4 py-2 text-[15px] font-medium text-ink">
      <span
        aria-hidden="true"
        className={`h-3.5 w-3.5 shrink-0 rounded-full ${color.swatch}`}
      />
      {row.area.name}
    </span>
  );
}

/**
 * One comfortable city row.
 *
 * The whole point of this screen is one decision per row: which operational
 * Area does this city belong to. The student's own city value is never editable
 * here - if a city is wrong on one student, that is a correction on the student
 * record, not a mapping change for everybody who lives there.
 */
function CityRow({
  row,
  activeAreas,
  canManage,
  onChange,
  pending,
}: {
  row: CityMappingRow;
  activeAreas: PlacementAreaRow[];
  canManage: boolean;
  onChange: (city: string, areaId: string | null) => void;
  pending: boolean;
}) {
  const needsReview = row.state === "needs_review";
  const selectId = `city-area-${row.normalized.replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <li
      className={`rounded-3xl border bg-surface p-6 sm:p-7 ${
        needsReview ? "border-attention-line" : "border-line"
      }`}
    >
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 xl:flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <MapPin size={20} aria-hidden="true" className="text-ink-muted" />
            <h3 className="text-[21px] font-semibold leading-tight text-ink">
              {row.label}
            </h3>
            <AreaChip row={row} />
          </div>

          <p className="mt-2 text-[16px] text-ink-muted">
            {row.studentCount === 0
              ? "No active student lives here right now"
              : studentCountLabel(row.studentCount)}
          </p>

          {row.variants.length > 1 ? (
            <p className="mt-1 text-[15px] text-ink-muted">
              Also written as{" "}
              {row.variants
                .filter((variant) => variant !== row.label)
                .join(", ")}
              . These are counted as one city.
            </p>
          ) : null}

          {needsReview && row.area ? (
            <p className="mt-2 flex items-start gap-2 text-[15px] text-attention-ink">
              <TriangleAlert
                size={18}
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              />
              <span>
                This city is still mapped to {row.area.name}, which has been
                archived. Batch Planning treats these students as Unmapped until
                the city is moved to an active area.
              </span>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:shrink-0">
          <label htmlFor={selectId} className="sr-only">
            Placement area for {row.label}
          </label>
          <select
            id={selectId}
            className={SELECT_CLASSES}
            disabled={!canManage || pending}
            value={row.area?.is_active ? row.area.id : ""}
            onChange={(event) =>
              onChange(row.label, event.target.value || null)
            }
          >
            <option value="">Unmapped</option>
            {activeAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>

          {canManage && row.mapping ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onChange(row.label, null)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60"
            >
              <X size={18} aria-hidden="true" />
              Unmap
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * City to Area Mapping.
 *
 * The list comes from the cities active students really live in, grouped by
 * their normalized value, so capitalisation and stray spaces never split one
 * city across two rows. Each city belongs to at most one Area.
 *
 * Nothing is ever guessed. There is no geocoding, no postal code lookup, and no
 * seeded "Mississauga is probably Peel": an unmapped city stays Unmapped, and
 * Batch Planning shows it as a planning exception until an admin decides.
 */
export default function CityAreaMappingAdmin({
  board,
  activeAreas,
  canManage,
}: CityAreaMappingAdminProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(city: string, areaId: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await setCityAreaAction({ city, areaId });
      setError(result.error);
    });
  }

  const rowProps = { activeAreas, canManage, onChange: change, pending };

  return (
    <div className="flex flex-col gap-8">
      {!canManage ? (
        <p className="rounded-2xl border border-info-line bg-info-soft px-6 py-4 text-[16px] text-info-ink">
          You can view city to area mapping here. Only an admin can assign,
          change, or remove a mapping.
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
        This screen maps a city to an operational Placement Area. It never
        changes a student&apos;s city. If one student&apos;s city is wrong, correct it
        on their student record. Areas themselves are added, renamed, and
        archived in{" "}
        <Link
          href="/admin/placement-areas"
          className="font-medium text-brand-strong underline underline-offset-4"
        >
          Placement Areas
        </Link>
        .
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CountTile label="Cities in use" value={board.counts.cities} tone="neutral" />
        <CountTile label="Mapped to an Area" value={board.counts.mapped} tone="ready" />
        <CountTile
          label="Unmapped"
          value={board.counts.unmapped}
          tone={board.counts.unmapped > 0 ? "attention" : "neutral"}
        />
        <CountTile
          label="Needs Area Review"
          value={board.counts.needsReview}
          tone={board.counts.needsReview > 0 ? "attention" : "neutral"}
        />
      </div>

      <section aria-labelledby="student-cities-heading">
        <h2
          id="student-cities-heading"
          className="mb-2 text-[24px] font-semibold tracking-tight text-ink"
        >
          Student Cities
        </h2>
        <p className="mb-6 text-[17px] text-ink-muted">
          Every city active students currently live in. Cities that need
          attention are listed first.
        </p>

        {board.rows.length === 0 ? (
          <div className="rounded-3xl border border-line bg-surface p-8">
            <p className="text-[17px] text-ink-muted">
              No active student has a city on file yet. Cities appear here as
              soon as student records carry one.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {board.rows.map((row) => (
              <CityRow key={row.normalized} row={row} {...rowProps} />
            ))}
          </ul>
        )}
      </section>

      {board.unused.length > 0 ? (
        <section aria-labelledby="unused-mapping-heading">
          <h2
            id="unused-mapping-heading"
            className="mb-2 text-[24px] font-semibold tracking-tight text-ink"
          >
            Mappings Not Currently In Use
          </h2>
          <p className="mb-6 text-[17px] text-ink-muted">
            No active student lives in these cities right now. The mappings are
            kept, never removed automatically, so a returning student in one of
            these cities lands in the right Area straight away.
          </p>
          <ul className="flex flex-col gap-4">
            {board.unused.map((row) => (
              <CityRow key={row.normalized} row={row} {...rowProps} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
