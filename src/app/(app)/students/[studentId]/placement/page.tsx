import { Building2, MapPin, Search } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import CancelAssignmentButton from "@/components/placement/CancelAssignmentButton";
import FinishPlacementForm from "@/components/placement/FinishPlacementForm";
import PlacementDatesForm from "@/components/placement/PlacementDatesForm";
import PlacementHistory from "@/components/placement/PlacementHistory";
import StartPlacementButton from "@/components/placement/StartPlacementButton";
import { partnerLocationLabel } from "@/components/partners/PartnerList";
import BackLink from "@/components/ui/BackLink";
import StatusPill, {
  DocumentStatusPill,
  PlacementStatusPill,
} from "@/components/ui/StatusPill";
import { canManagePlacements, getStaffSession } from "@/lib/auth/session";
import { getStudentReadiness } from "@/lib/documents/queries";
import {
  availabilityChipLabel,
  formatDate,
  formatTimestamp,
  studentFullName,
} from "@/lib/format";
import { placementAttention, todayKey } from "@/lib/placement/attention";
import {
  AVAILABILITY_STATUS_TONES,
  PLACEMENT_RECORD_STATUS_LABELS,
  PLACEMENT_RECORD_STATUS_TONES,
} from "@/lib/placement/constants";
import { formatCreditedHours, totalCreditedHours } from "@/lib/placement/hours";
import {
  getCurrentPlacement,
  listStudentPlacements,
} from "@/lib/placement/queries";
import { getStudent } from "@/lib/students/queries";

export const metadata = {
  title: "Student Placement",
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-7 sm:p-8">
      <h2 className="text-[24px] font-semibold tracking-tight text-ink">
        {title}
      </h2>
      {description ? (
        <p className="mt-2 text-[16px] text-ink-muted">{description}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Detail({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string | null;
  /** The one or two dates that matter most in the state the placement is in. */
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        emphasis
          ? "border-ready-line bg-ready-soft"
          : "border-line bg-surface-muted"
      }`}
    >
      <p className={`text-[15px] ${emphasis ? "text-ready-ink/80" : "text-ink-muted"}`}>
        {label}
      </p>
      <p
        className={`mt-1 break-words ${
          emphasis
            ? "text-[19px] font-semibold text-ready-ink"
            : "text-[17px] text-ink"
        }`}
      >
        {value ?? "Not recorded"}
      </p>
    </div>
  );
}

/** The tinted line that says what the dates on an active placement mean today. */
const ATTENTION_CLASSES = {
  info: "border-info-line bg-info-soft text-info-ink",
  ready: "border-ready-line bg-ready-soft text-ready-ink",
  warning: "border-warning-line bg-warning-soft text-warning-ink",
  attention: "border-attention-line bg-attention-soft text-attention-ink",
  neutral: "border-line bg-surface-muted text-ink-muted",
};

/**
 * One student's placement, in full.
 *
 * The student page carries a short Placement summary; this is where the whole
 * story lives: their overall placement requirement, the current placement with
 * its dates and note, every placement that came before it, and the hours all of
 * them together have credited.
 */
export default async function StudentPlacementPage(
  props: PageProps<"/students/[studentId]/placement">,
) {
  const { studentId } = await props.params;

  const student = await getStudent(studentId);
  if (!student) notFound();

  const [current, history, readiness, session] = await Promise.all([
    getCurrentPlacement(student.id),
    listStudentPlacements(student.id),
    getStudentReadiness(student.id),
    getStaffSession(),
  ]);

  const canManage = canManagePlacements(session);
  const fullName = studentFullName(student);
  const partner = current?.partner ?? null;
  // The current placement is already shown in full above, so history below it is
  // everything else.
  const past = history.filter((placement) => placement.id !== current?.id);
  // Across every placement that was not cancelled, current one included. A
  // student who did 120 hours at one partner and 180 at another has 300.
  const creditedHours = formatCreditedHours(totalCreditedHours(history));
  const requirementComplete =
    student.placement_status === "placement_completed";
  // The two endings are reached from two different places, and which one is
  // offered is the whole point of this refinement. An ASSIGNED placement has
  // not happened yet, so it can be started or cancelled. A STARTED one has, so
  // it can only be finished: a student who was actually there was not
  // "cancelled", and their hours have to be credited somewhere.
  const notStarted = current?.status === "assigned";
  const started = current?.status === "started";
  const attention = current
    ? placementAttention(current, todayKey())
    : null;

  return (
    <>
      <BackLink href={`/students/${student.id}`} label={`Back to ${fullName}`} />

      <div className="mb-8">
        <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-ink sm:text-[38px]">
          Placement
        </h1>
        <p className="mt-3 text-[18px] text-ink-muted">
          {fullName} - {student.student_number}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <PlacementStatusPill
            status={student.placement_status}
            size="large"
          />
          <DocumentStatusPill status={student.document_status} size="large" />
          <span className="inline-flex items-center rounded-full border border-line bg-surface-muted px-5 py-2.5 text-[16px] font-medium text-ink-muted">
            {readiness.requiredReady} of {readiness.requiredTotal} documents
            ready
          </span>
          {creditedHours ? (
            <span className="inline-flex items-center rounded-full border border-ready-line bg-ready-soft px-5 py-2.5 text-[16px] font-medium text-ready-ink">
              {creditedHours} credited
            </span>
          ) : null}
        </div>
        <p className="mt-4 max-w-2xl text-[16px] text-ink-muted">
          The pill above is {fullName}&apos;s OVERALL placement requirement.
          Each placement below has a status of its own, because a student may
          complete part of their placement at one partner and the rest at
          another.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {current && partner ? (
          <Section
            title={started ? "Active Placement" : "Current Assignment"}
            description={
              started
                ? "This student is at this partner right now. Finishing it is the action at the bottom of this section."
                : "This placement has been arranged but has not started yet."
            }
          >
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    href={`/placement-partners/${partner.id}`}
                    className="text-[24px] font-semibold leading-snug text-ink hover:text-brand-strong"
                  >
                    {partner.name}
                  </Link>
                  <p className="mt-2 flex items-start gap-2 text-[17px] text-ink-muted">
                    <MapPin
                      size={19}
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
                    label={PLACEMENT_RECORD_STATUS_LABELS[current.status]}
                    tone={PLACEMENT_RECORD_STATUS_TONES[current.status]}
                    size="large"
                  />
                  <StatusPill
                    label={availabilityChipLabel(partner)}
                    tone={
                      AVAILABILITY_STATUS_TONES[partner.availability_status]
                    }
                    size="large"
                  />
                </div>
              </div>

              {attention ? (
                <p
                  className={`rounded-2xl border px-5 py-4 text-[16px] ${ATTENTION_CLASSES[attention.tone]}`}
                >
                  <span className="font-semibold">{attention.label}.</span>{" "}
                  {attention.description}
                </p>
              ) : null}

              {/* The two dates that matter are different in the two states. An
                  assigned placement is about when it is meant to START; a
                  started one about when it actually DID and when it should end. */}
              <div className="grid gap-4 sm:grid-cols-2">
                {started ? (
                  <>
                    <Detail
                      label="Actual Start Date"
                      value={formatDate(current.actual_start_date)}
                      emphasis
                    />
                    <Detail
                      label="Planned End Date"
                      value={formatDate(current.planned_end_date)}
                      emphasis
                    />
                    <Detail
                      label="Planned Start Date"
                      value={formatDate(current.planned_start_date)}
                    />
                  </>
                ) : (
                  <>
                    <Detail
                      label="Planned Start Date"
                      value={formatDate(current.planned_start_date)}
                    />
                    <Detail
                      label="Planned End Date"
                      value={formatDate(current.planned_end_date)}
                    />
                  </>
                )}
                <Detail
                  label="Assigned Date"
                  value={formatTimestamp(current.assigned_at)}
                />
                <Detail label="Assigned By" value={current.assignedByName} />
                {current.actual_end_date ? (
                  <Detail
                    label="Actual End Date"
                    value={formatDate(current.actual_end_date)}
                  />
                ) : null}
                <div className="sm:col-span-2">
                  <Detail
                    label="Assignment Note"
                    value={current.assignment_note}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/placement-partners/${partner.id}`}
                  className="inline-flex items-center gap-2 rounded-2xl border border-line px-6 py-4 text-[17px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
                >
                  <Building2 size={20} aria-hidden="true" />
                  Open Partner
                </Link>
              </div>

              {canManage ? (
                <>
                  <PlacementDatesForm
                    placementId={current.id}
                    plannedStartDate={current.planned_start_date}
                    plannedEndDate={current.planned_end_date}
                    assignmentNote={current.assignment_note}
                  />
                  <div className="flex flex-col gap-4 border-t border-line pt-7">
                    <p className="text-[16px] text-ink-muted">
                      {notStarted
                        ? "This placement has not started yet. Start it when the student actually begins, or cancel the assignment if it is not going ahead."
                        : "This placement has started. Finishing it records what happened here, and asks whether it completes the student's whole placement requirement."}
                    </p>

                    {notStarted ? (
                      <>
                        <StartPlacementButton
                          placementId={current.id}
                          studentName={fullName}
                          studentNumber={student.student_number}
                          partnerName={partner.name}
                          plannedStartDate={current.planned_start_date}
                        />
                        <CancelAssignmentButton
                          placementId={current.id}
                          studentName={fullName}
                          partnerName={partner.name}
                        />
                      </>
                    ) : (
                      <FinishPlacementForm
                        placementId={current.id}
                        studentName={fullName}
                        studentNumber={student.student_number}
                        partnerName={partner.name}
                        actualStartDate={current.actual_start_date}
                        plannedEndDate={current.planned_end_date}
                      />
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </Section>
        ) : (
          <Section
            title={
              requirementComplete
                ? "Placement Completed"
                : "No current placement"
            }
            description={
              requirementComplete
                ? "This student has finished their placement requirement."
                : "This student is not placed anywhere right now."
            }
          >
            <div className="rounded-2xl border border-line bg-surface-muted p-6">
              <p className="text-[15px] text-ink-muted">Placement status</p>
              <p className="mt-2 text-[24px] font-semibold text-ink">
                {requirementComplete
                  ? "Placement requirement complete"
                  : readiness.isReady
                    ? "Documents are complete"
                    : `${readiness.requiredReady} of ${readiness.requiredTotal} documents ready`}
              </p>
              <p className="mt-3 text-[16px] text-ink-muted">
                {requirementComplete
                  ? "Their placement requirement is finished. Their placements are below."
                  : student.placement_status === "ready_for_placement"
                    ? "This student is ready to be matched with a placement partner."
                    : student.placement_status === "on_hold"
                      ? (student.placement_hold_reason ??
                        "This student is on hold.")
                      : "Finish their document checklist before matching them with a partner."}
              </p>
            </div>

            {canManage &&
            student.placement_status === "ready_for_placement" ? (
              <Link
                href={`/placement/find/${student.id}`}
                className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
              >
                <Search size={20} aria-hidden="true" />
                Find Placement
              </Link>
            ) : null}
          </Section>
        )}

        <Section
          title="Placement History"
          description="Every placement this student has had, whether it completed, ended early, or was cancelled. Records are kept and never deleted."
        >
          <PlacementHistory
            placements={past}
            emptyMessage={
              current
                ? "No earlier placements. This is their first."
                : "This student has no placement history yet."
            }
          />

          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-3 rounded-2xl border border-line bg-surface-muted p-6">
            <p className="text-[17px] font-medium text-ink">
              Total Credited Placement Hours
            </p>
            <p className="text-[22px] font-semibold text-ink">
              {creditedHours ?? "None credited yet"}
            </p>
            <p className="w-full text-[15px] text-ink-muted">
              The sum of the hours staff accepted for each placement, cancelled
              assignments excluded. There is no hour tracking behind this
              number.
            </p>
          </div>
        </Section>
      </div>
    </>
  );
}
