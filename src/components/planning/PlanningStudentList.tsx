import { ArrowRight, Building2, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";

import { PlacementStatusPill } from "@/components/ui/StatusPill";
import { studentFullName } from "@/lib/format";
import type { PlacementBoardStudent } from "@/lib/placement/queries";
import { canOfferFindPlacement } from "@/lib/planning/batch";
import {
  studentNeedLabel,
  type StudentNeedSummary,
} from "@/lib/planning/needs";
import { tidyCityName } from "@/lib/planning/city";

/**
 * A student as a Batch Planning drill-down sees them.
 *
 * One compact row: enough to plan without opening the profile, and nothing
 * more. Name, program, city, placement status, document readiness X of Y,
 * the current partner when there is one, and a one-line document attention
 * summary counted from the checklist ("2 student actions", "3 items not
 * reviewed"). No note text, no document names, no dates: this is a planning
 * list, not the PLACEMENT-07C progress card.
 *
 * Readiness is the same derived X of Y the checklist, the board, and the
 * Placement list show. It is never recomputed here.
 *
 * Find Placement is offered under exactly the PLACEMENT-05A rule: the student
 * is Ready for Placement, has no live placement, and the staff member may
 * manage placements. It is a link to the existing flow, rendered outside the
 * row's own link; this list assigns nobody.
 */

function Readiness({ student }: { student: PlacementBoardStudent }) {
  const readiness = student.readiness;
  if (!readiness || readiness.requiredTotal === 0) return null;

  const classes = readiness.isReady
    ? "border-ready-line bg-ready-soft text-ready-ink"
    : readiness.reviewedCount === 0
      ? "border-line bg-surface-muted text-ink-muted"
      : "border-attention-line bg-attention-soft text-attention-ink";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-4 py-2 text-[15px] font-medium ${classes}`}
    >
      {readiness.requiredReady} of {readiness.requiredTotal} ready
    </span>
  );
}

function PlanningStudentRow({
  student,
  need,
  canManage,
}: {
  student: PlacementBoardStudent;
  need: StudentNeedSummary | undefined;
  canManage: boolean;
}) {
  const partner = student.currentPlacement?.partner;
  const showPartner =
    partner &&
    (student.placement_status === "placement_assigned" ||
      student.placement_status === "placement_started");
  const attention = studentNeedLabel(need);
  const city = tidyCityName(student.city);
  const findPlacement = canManage && canOfferFindPlacement(student);

  return (
    <li>
      <Link
        href={`/students/${student.id}`}
        className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5 transition-colors hover:border-brand hover:bg-brand-soft/40 sm:p-6 lg:flex-row lg:items-center"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[20px] font-semibold leading-tight text-ink">
              {studentFullName(student)}
            </span>
            <span className="text-[15px] text-ink-muted">
              {student.student_number}
            </span>
          </div>

          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-ink-muted">
            <span>{student.program}</span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={16} aria-hidden="true" />
              {city || "No city on file"}
            </span>
            {showPartner ? (
              <span className="inline-flex items-center gap-1.5 text-ink">
                <Building2 size={16} aria-hidden="true" />
                {partner.name}
              </span>
            ) : null}
          </p>

          {attention ? (
            <p
              className={`mt-2 text-[15px] font-medium ${
                need && need.studentActions > 0
                  ? "text-attention-ink"
                  : "text-info-ink"
              }`}
            >
              {attention}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:w-[22rem] lg:shrink-0 lg:justify-end">
          <PlacementStatusPill status={student.placement_status} />
          <Readiness student={student} />
        </div>

        <span className="flex items-center gap-1 text-[15px] font-medium text-brand-strong lg:shrink-0">
          Open
          <ChevronRight size={18} aria-hidden="true" />
        </span>
      </Link>

      {findPlacement ? (
        <div className="mt-2 pl-5 sm:pl-6">
          <Link
            href={`/placement/find/${student.id}`}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[16px] font-medium text-brand-strong transition-colors hover:bg-brand-soft"
          >
            Find Placement
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </li>
  );
}

export default function PlanningStudentList({
  students,
  needs,
  canManage,
  emptyMessage,
}: {
  students: PlacementBoardStudent[];
  /** Per-student document attention counts, from the batch checklist read. */
  needs: ReadonlyMap<string, StudentNeedSummary>;
  /** Whether the staff member may open Find Placement. */
  canManage: boolean;
  emptyMessage: string;
}) {
  if (students.length === 0) {
    return (
      <div className="rounded-3xl border border-line bg-surface p-8">
        <p className="text-[17px] text-ink-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {students.map((student) => (
        <PlanningStudentRow
          key={student.id}
          student={student}
          need={needs.get(student.id)}
          canManage={canManage}
        />
      ))}
    </ul>
  );
}
