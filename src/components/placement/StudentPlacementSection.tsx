import { Building2, MapPin, PauseCircle, Search } from "lucide-react";
import Link from "next/link";

import HoldControl from "@/components/placement/HoldControl";
import { partnerLocationLabel } from "@/components/partners/PartnerList";
import StatusPill from "@/components/ui/StatusPill";
import { availabilityChipLabel, formatDate, formatTimestamp } from "@/lib/format";
import {
  AVAILABILITY_STATUS_TONES,
  PLACEMENT_RECORD_STATUS_LABELS,
  PLACEMENT_RECORD_STATUS_TONES,
  PLACEMENT_STATUS_LABELS,
} from "@/lib/placement/constants";
import { formatCreditedHours, totalCreditedHours } from "@/lib/placement/hours";
import type { StudentPlacement } from "@/lib/placement/queries";
import type { StudentRow } from "@/lib/supabase/database.types";

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[15px] text-ink-muted">{label}</p>
      <p className="mt-0.5 break-words text-[17px] text-ink">
        {value ?? "Not recorded"}
      </p>
    </div>
  );
}

/**
 * One line per past placement: where, what happened, and what it credited.
 *
 * Short on purpose. The full record, with its dates and its notes, is one click
 * away on the student's own placement page.
 */
function HistoryRow({ placement }: { placement: StudentPlacement }) {
  const hours = formatCreditedHours(placement.credited_hours);
  const ended = formatDate(placement.actual_end_date);

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-muted px-5 py-4">
      <div className="min-w-0">
        <p className="text-[17px] font-medium text-ink">
          {placement.partner?.name ?? "Partner record not available"}
        </p>
        <p className="mt-0.5 text-[15px] text-ink-muted">
          {ended ? `Ended ${ended}` : "No end date recorded"}
          {hours ? ` - ${hours} credited` : ""}
        </p>
      </div>
      <StatusPill
        label={PLACEMENT_RECORD_STATUS_LABELS[placement.status]}
        tone={PLACEMENT_RECORD_STATUS_TONES[placement.status]}
      />
    </li>
  );
}

/**
 * The Placement section on a student's page.
 *
 * Three different facts, deliberately separated because they are easy to
 * confuse:
 *
 *   Overall Placement Status   where the student is on their WHOLE placement
 *                              requirement
 *   Current Placement          the one live placement, if there is one
 *   Placement History          every placement segment that has finished
 *
 * A student may complete part of their placement at one partner and continue at
 * another, so finishing a placement here is not the same as finishing placement.
 */
export default function StudentPlacementSection({
  student,
  placement,
  history,
  canManage,
}: {
  student: StudentRow;
  placement: StudentPlacement | null;
  /** Every placement this student has had, newest first. */
  history: StudentPlacement[];
  canManage: boolean;
}) {
  const partner = placement?.partner ?? null;
  const isReady = student.placement_status === "ready_for_placement";
  const onHold = student.placement_status === "on_hold";
  const requirementComplete =
    student.placement_status === "placement_completed";

  const past = history.filter((row) => row.id !== placement?.id);
  const creditedHours = formatCreditedHours(totalCreditedHours(history));

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-line bg-surface-muted p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] text-ink-muted">
              Overall Placement Status
            </p>
            <p className="mt-1 text-[24px] font-semibold text-ink">
              {PLACEMENT_STATUS_LABELS[student.placement_status]}
            </p>
          </div>
          <StatusPill
            label={creditedHours ? `${creditedHours} credited` : "No hours yet"}
            tone={creditedHours ? "ready" : "neutral"}
            size="large"
          />
        </div>
        <p className="mt-3 text-[16px] text-ink-muted">
          {requirementComplete
            ? "This student has finished their whole placement requirement."
            : onHold
              ? (student.placement_hold_reason ??
                "This student is on hold. No reason was recorded.")
              : placement
                ? "This is where they are overall. The placement below is one part of it."
                : isReady
                  ? "Documents are complete. This student is ready to be matched with a placement partner."
                  : "No placement has been assigned yet. Their document checklist decides when they become ready."}
        </p>
      </div>

      {placement && partner ? (
        <>
          <div className="rounded-2xl border border-info-line bg-info-soft p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] text-info-ink">Current placement</p>
                <Link
                  href={`/placement-partners/${partner.id}`}
                  className="mt-1 block text-[22px] font-semibold leading-snug text-ink hover:text-brand-strong"
                >
                  {partner.name}
                </Link>
                <p className="mt-2 flex items-start gap-2 text-[16px] text-info-ink">
                  <MapPin
                    size={18}
                    aria-hidden="true"
                    className="mt-0.5 shrink-0"
                  />
                  <span className="min-w-0 break-words">
                    {partnerLocationLabel(partner)} -{" "}
                    {partner.area?.name ?? "Unassigned"}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusPill
                  label={PLACEMENT_RECORD_STATUS_LABELS[placement.status]}
                  tone={PLACEMENT_RECORD_STATUS_TONES[placement.status]}
                />
                <StatusPill
                  label={availabilityChipLabel(partner)}
                  tone={AVAILABILITY_STATUS_TONES[partner.availability_status]}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 rounded-2xl border border-line bg-surface-muted p-6 sm:grid-cols-2">
            <Detail
              label="Planned Start"
              value={formatDate(placement.planned_start_date)}
            />
            <Detail
              label="Planned End"
              value={formatDate(placement.planned_end_date)}
            />
            <Detail
              label="Assigned Date"
              value={formatTimestamp(placement.assigned_at)}
            />
            <Detail label="Assigned By" value={placement.assignedByName} />
            <div className="sm:col-span-2">
              <Detail
                label="Assignment Note"
                value={placement.assignment_note}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/students/${student.id}/placement`}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              View Placement
            </Link>
            <Link
              href={`/placement-partners/${partner.id}`}
              className="inline-flex items-center gap-2 rounded-2xl border border-line px-6 py-4 text-[17px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
            >
              <Building2 size={20} aria-hidden="true" />
              Open Partner
            </Link>
          </div>

          <p className="text-[15px] text-ink-muted">
            {placement.status === "assigned"
              ? "This placement has not started yet. Starting it, or cancelling the assignment, is done on the placement page."
              : "Finishing this placement is done on the placement page, where staff also say whether it completes the student's whole requirement."}
          </p>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {canManage && isReady ? (
            <Link
              href={`/placement/find/${student.id}`}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              <Search size={20} aria-hidden="true" />
              Find Placement
            </Link>
          ) : null}

          <Link
            href={`/students/${student.id}/placement`}
            className="inline-flex items-center gap-2 rounded-2xl border border-line px-6 py-4 text-[17px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
          >
            <PauseCircle size={20} aria-hidden="true" />
            Placement History
          </Link>
        </div>
      )}

      {past.length > 0 ? (
        <div className="border-t border-line pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-[19px] font-semibold text-ink">
              Placement History
            </h3>
            <p className="text-[16px] text-ink-muted">
              Total Credited Placement Hours:{" "}
              <span className="font-semibold text-ink">
                {creditedHours ?? "None credited yet"}
              </span>
            </p>
          </div>
          <ul className="mt-4 flex flex-col gap-3">
            {past.map((row) => (
              <HistoryRow key={row.id} placement={row} />
            ))}
          </ul>
          <Link
            href={`/students/${student.id}/placement`}
            className="mt-4 inline-flex items-center gap-1 text-[16px] font-medium text-brand-strong hover:underline"
          >
            See the full placement history
          </Link>
        </div>
      ) : null}

      {canManage ? (
        <HoldControl
          studentId={student.id}
          onHold={onHold}
          holdReason={student.placement_hold_reason}
        />
      ) : null}
    </div>
  );
}
