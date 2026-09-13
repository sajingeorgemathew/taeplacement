import { ChevronRight, MapPinOff, Settings, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { studentCountLabel } from "@/lib/format";
import type { BatchPlanning } from "@/lib/planning/batch";

/**
 * The two planning exceptions.
 *
 * Neither one is an Area, neither one is guessed into an Area, and neither one
 * is allowed to disappear. A student nobody can place because their city is
 * unmapped is exactly as much of a planning problem as a student with no
 * partners nearby, and the only way to fix it is to make it visible.
 *
 * They are kept apart on purpose:
 *
 *   Unmapped City   the student HAS a city. Admin has not said which Area it
 *                   belongs to, or the Area it points at has been archived.
 *                   Fixed at /admin/city-area-mapping.
 *
 *   City Missing    the student record has no city at all. That is a student
 *                   record correction, not a mapping decision, so it never
 *                   links to the mapping screen.
 */
export default function ExceptionCards({
  planning,
  unmappedHref,
  missingHref,
}: {
  planning: BatchPlanning;
  unmappedHref: string;
  missingHref: string;
}) {
  const unmapped = planning.unmapped;
  const missing = planning.missing;

  if (unmapped.counts.total === 0 && missing.counts.total === 0) return null;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      {unmapped.counts.total > 0 ? (
        <section className="rounded-3xl border border-attention-line bg-attention-soft p-7 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2.5 text-[22px] font-semibold leading-tight text-attention-ink">
                <MapPinOff size={22} aria-hidden="true" />
                Unmapped City
              </h3>
              <p className="mt-1.5 text-[17px] text-attention-ink/85">
                {studentCountLabel(unmapped.counts.total)} in a city that does
                not belong to an active Placement Area yet.
              </p>
            </div>
            <span className="text-[38px] font-semibold leading-none text-attention-ink">
              {unmapped.counts.total}
            </span>
          </div>

          <ul className="mt-6 flex flex-col gap-2">
            {unmapped.cities.map((city) => (
              <li
                key={city.normalized}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-attention-line bg-surface px-5 py-3.5"
              >
                <span className="min-w-0">
                  <span className="block text-[17px] font-medium text-ink">
                    {city.label}
                  </span>
                  {city.archivedArea ? (
                    <span className="mt-0.5 flex items-start gap-1.5 text-[15px] text-attention-ink">
                      <TriangleAlert
                        size={16}
                        aria-hidden="true"
                        className="mt-1 shrink-0"
                      />
                      Needs Area Review - mapped to {city.archivedArea.name},
                      which is archived
                    </span>
                  ) : null}
                </span>
                <span className="text-[17px] font-semibold text-ink">
                  {city.count}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/admin/city-area-mapping"
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              <Settings size={20} aria-hidden="true" />
              Manage City Mapping
            </Link>
            <Link
              href={unmappedHref}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-attention-line bg-surface px-6 py-4 text-[17px] font-semibold text-attention-ink transition-colors hover:bg-attention-soft"
            >
              View these students
              <ChevronRight size={20} aria-hidden="true" />
            </Link>
          </div>
        </section>
      ) : null}

      {missing.counts.total > 0 ? (
        <section className="rounded-3xl border border-attention-line bg-surface p-7 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2.5 text-[22px] font-semibold leading-tight text-ink">
                <MapPinOff size={22} aria-hidden="true" />
                City Missing
              </h3>
              <p className="mt-1.5 text-[17px] text-ink-muted">
                {studentCountLabel(missing.counts.total)} with no city on their
                student record. Their Area cannot be worked out from anything
                else, and nothing is guessed for them.
              </p>
            </div>
            <span className="text-[38px] font-semibold leading-none text-ink">
              {missing.counts.total}
            </span>
          </div>

          <p className="mt-5 text-[16px] text-ink-muted">
            Add the city on each student record, and they join their Area here
            automatically.
          </p>

          <Link
            href={missingHref}
            className="mt-6 inline-flex items-center gap-1.5 rounded-2xl border border-line bg-surface px-6 py-4 text-[17px] font-semibold text-brand-strong transition-colors hover:bg-brand-soft"
          >
            View these students
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
        </section>
      ) : null}
    </div>
  );
}
