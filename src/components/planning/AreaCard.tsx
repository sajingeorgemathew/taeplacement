import { ChevronRight, CircleAlert } from "lucide-react";
import Link from "next/link";

import { studentCountLabel } from "@/lib/format";
import { areaColorStyle } from "@/lib/partners/area-colors";
import { PLACEMENT_STATUS_LABELS } from "@/lib/placement/constants";
import { planningObservation, type PlanningAreaGroup } from "@/lib/planning/batch";
import {
  PLANNING_BREAKDOWN_STATUSES,
  PLANNING_EXTRA_STATUSES,
  PLANNING_STATUS_LABELS,
} from "@/lib/planning/constants";

/** One "Ready 5" style figure. Deliberately plain: no bars, no charts. */
function Figure({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <p
        className={`text-[24px] font-semibold leading-none ${
          emphasis && value > 0 ? "text-ready-ink" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[14px] leading-snug text-ink-muted">{label}</p>
    </div>
  );
}

/**
 * One geographic Area card.
 *
 * The colour is the area's own color_key, read from the database, never an
 * array position: renaming, reordering, or adding an area repaints nothing.
 *
 * The partner figures are an AVAILABILITY picture, not a capacity one. Partner
 * count is never compared against student count to produce a shortfall, because
 * nothing in this application tracks how many students a partner will take.
 */
export default function AreaCard({
  group,
  href,
}: {
  group: PlanningAreaGroup;
  href: string;
}) {
  const color = areaColorStyle(group.area.color_key);
  const observation = planningObservation(group);
  const extras = PLANNING_EXTRA_STATUSES.filter(
    (status) => group.counts.byStatus[status] > 0,
  );

  return (
    <li className={`overflow-hidden rounded-3xl border ${color.column}`}>
      <div className={`h-1.5 w-full ${color.accent}`} aria-hidden="true" />

      <div className="p-7 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h3
              className={`text-[24px] font-semibold leading-tight ${color.heading}`}
            >
              {group.area.name}
            </h3>
            <p className={`mt-1.5 text-[17px] ${color.muted}`}>
              {studentCountLabel(group.counts.total)} in this batch
            </p>
          </div>
          <span
            className={`text-[38px] font-semibold leading-none ${color.heading}`}
          >
            {group.counts.total}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PLANNING_BREAKDOWN_STATUSES.map((status) => (
            <Figure
              key={status}
              label={PLANNING_STATUS_LABELS[status]}
              value={group.counts.byStatus[status]}
              emphasis={status === "ready_for_placement"}
            />
          ))}
          {extras.map((status) => (
            <Figure
              key={status}
              label={PLANNING_STATUS_LABELS[status]}
              value={group.counts.byStatus[status]}
            />
          ))}
        </div>

        <div className="mt-6">
          <h4 className={`text-[15px] font-semibold ${color.muted}`}>Cities</h4>
          <ul className="mt-2 flex flex-wrap gap-2">
            {group.cities.map((city) => (
              <li
                key={city.normalized}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-[15px] text-ink"
              >
                {city.label}
                <span className="font-semibold">{city.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h4 className="text-[16px] font-semibold text-ink">
              Placement Partners in this Area
            </h4>
            <span className="text-[15px] text-ink-muted">
              {group.partners.total} active
            </span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 text-[15px] sm:grid-cols-4">
            <div>
              <dt className="text-ink-muted">Available Now</dt>
              <dd
                className={`text-[20px] font-semibold ${
                  group.partners.availableNow > 0 ? "text-ready-ink" : "text-ink"
                }`}
              >
                {group.partners.availableNow}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Upcoming</dt>
              <dd className="text-[20px] font-semibold text-ink">
                {group.partners.upcoming}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Unknown</dt>
              <dd className="text-[20px] font-semibold text-ink">
                {group.partners.unknown}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Not Available</dt>
              <dd className="text-[20px] font-semibold text-ink">
                {group.partners.notAvailable}
              </dd>
            </div>
          </dl>

          {group.partners.followUpDue > 0 ? (
            <p className="mt-4 flex items-start gap-2 text-[15px] text-warning-ink">
              <CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>
                {group.partners.followUpDue === 1
                  ? "1 partner follow-up is due"
                  : `${group.partners.followUpDue} partner follow-ups are due`}
              </span>
            </p>
          ) : null}
        </div>

        {observation ? (
          <p className={`mt-5 text-[16px] ${color.muted}`}>{observation}</p>
        ) : null}

        <Link
          href={href}
          className="mt-6 inline-flex items-center gap-1.5 rounded-2xl bg-surface px-6 py-4 text-[17px] font-semibold text-brand-strong transition-colors hover:bg-brand-soft"
        >
          Open {group.area.name}
          <ChevronRight size={20} aria-hidden="true" />
          <span className="sr-only">
            {" "}
            - {studentCountLabel(group.counts.total)},{" "}
            {group.counts.byStatus.ready_for_placement}{" "}
            {PLACEMENT_STATUS_LABELS.ready_for_placement}
          </span>
        </Link>
      </div>
    </li>
  );
}
