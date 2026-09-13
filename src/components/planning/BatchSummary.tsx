import Link from "next/link";

import type { Tone } from "@/lib/placement/constants";
import type { BatchPlanning } from "@/lib/planning/batch";

/**
 * The batch summary strip.
 *
 * Every number is counted from the live student records for this batch. There
 * is no summary table and no stored aggregate anywhere: a status change or a
 * newly mapped city shows up on the next load.
 *
 * Unmapped City and City Missing sit in this strip beside the placement
 * statuses on purpose. They are not errors to tuck away, they are the two
 * planning questions a batch most often fails on, and a planner should see them
 * in the same glance as Ready and On Hold.
 */

const TONE_CLASSES: Record<Tone, string> = {
  info: "border-info-line bg-info-soft text-info-ink",
  ready: "border-ready-line bg-ready-soft text-ready-ink",
  attention: "border-attention-line bg-attention-soft text-attention-ink",
  warning: "border-warning-line bg-warning-soft text-warning-ink",
  neutral: "border-line bg-surface text-ink",
};

function Tile({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: number;
  tone: Tone;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-[34px] font-semibold leading-none">{value}</p>
      <p className="mt-2 text-[15px] font-medium leading-snug">{label}</p>
    </>
  );

  const classes = `rounded-2xl border p-5 ${TONE_CLASSES[tone]}`;

  if (href) {
    return (
      <Link href={href} className={`${classes} block transition-shadow hover:shadow-sm`}>
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}

export default function BatchSummary({
  planning,
  unmappedHref,
  missingHref,
}: {
  planning: BatchPlanning;
  unmappedHref: string;
  missingHref: string;
}) {
  const { byStatus } = planning.counts;
  const unmapped = planning.unmapped.counts.total;
  const missing = planning.missing.counts.total;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label="Total Students" value={planning.counts.total} tone="neutral" />
      <Tile
        label="Documents Pending"
        value={byStatus.documents_pending}
        tone={byStatus.documents_pending > 0 ? "attention" : "neutral"}
      />
      <Tile
        label="Ready for Placement"
        value={byStatus.ready_for_placement}
        tone={byStatus.ready_for_placement > 0 ? "ready" : "neutral"}
      />
      <Tile
        label="Awaiting Start"
        value={byStatus.placement_assigned}
        tone={byStatus.placement_assigned > 0 ? "info" : "neutral"}
      />
      <Tile
        label="On Placement"
        value={byStatus.placement_started}
        tone={byStatus.placement_started > 0 ? "info" : "neutral"}
      />
      <Tile
        label="On Hold"
        value={byStatus.on_hold}
        tone={byStatus.on_hold > 0 ? "attention" : "neutral"}
      />
      <Tile
        label="Unmapped City"
        value={unmapped}
        tone={unmapped > 0 ? "attention" : "neutral"}
        href={unmapped > 0 ? unmappedHref : undefined}
      />
      <Tile
        label="City Missing"
        value={missing}
        tone={missing > 0 ? "attention" : "neutral"}
        href={missing > 0 ? missingHref : undefined}
      />
    </div>
  );
}
