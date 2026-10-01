import { ChevronRight, ClipboardCheck, UserRound } from "lucide-react";
import Link from "next/link";

import {
  NEED_KIND_LABELS,
  staffReviewHeadline,
  studentActionHeadline,
  type BatchDocumentNeeds,
  type NeedKind,
  type RequirementNeed,
} from "@/lib/planning/needs";

/**
 * "What This Batch Needs".
 *
 * Two operational concepts, kept apart on purpose:
 *
 *   Student Action Needed   requested and needs_update. The student owes us
 *                           something. Grouped by requirement, largest first.
 *   Staff Review Needed     not_reviewed. Nobody on staff has looked yet. This
 *                           is OUR queue, and it is never called a missing
 *                           student document.
 *
 * received and not_applicable never appear. Nothing here shows a checklist
 * row's internal note or its student-facing message: the summary is
 * requirement names and student counts, and each count opens the matching
 * students.
 */

function RequirementRows({
  kind,
  requirements,
  href,
  emptyText,
}: {
  kind: NeedKind;
  requirements: RequirementNeed[];
  href: (kind: NeedKind, requirementId: string) => string;
  emptyText: string;
}) {
  if (requirements.length === 0) {
    return <p className="mt-5 text-[16px] text-ink-muted">{emptyText}</p>;
  }

  return (
    <ul className="mt-5 flex flex-col gap-2">
      {requirements.map((need) => (
        <li key={need.requirement.id}>
          <Link
            href={href(kind, need.requirement.id)}
            className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-3.5 transition-colors hover:border-brand hover:bg-brand-soft/40"
          >
            <span className="min-w-0">
              <span className="block text-[17px] font-medium leading-snug text-ink">
                {need.requirement.name}
              </span>
              {!need.requirement.is_required ? (
                <span className="text-[14px] text-ink-muted">Optional</span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-[17px] font-semibold text-ink">
                {need.studentCount === 1
                  ? "1 student"
                  : `${need.studentCount} students`}
              </span>
              <ChevronRight size={20} aria-hidden="true" className="text-ink-muted" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function BatchNeeds({
  needs,
  href,
}: {
  needs: BatchDocumentNeeds;
  /**
   * Where a count leads. With a requirement id: the students who need that
   * requirement. Without: every student with a need of that kind.
   */
  href: (kind: NeedKind, requirementId?: string) => string;
}) {
  const action = needs.action;
  const review = needs.review;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section
        aria-labelledby="needs-action-heading"
        className={`rounded-3xl border p-7 sm:p-8 ${
          action.studentCount > 0
            ? "border-attention-line bg-attention-soft/50"
            : "border-line bg-surface"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h3
              id="needs-action-heading"
              className="flex items-center gap-2.5 text-[22px] font-semibold leading-tight text-ink"
            >
              <UserRound size={22} aria-hidden="true" className="text-attention-ink" />
              {NEED_KIND_LABELS.action}
            </h3>
            <p className="mt-1.5 text-[16px] text-ink-muted">
              Requested, or received and needing an update. The student has
              something to send.
            </p>
          </div>
          <Link
            href={href("action")}
            className="text-right text-[38px] font-semibold leading-none text-attention-ink hover:underline"
          >
            {action.studentCount}
            <span className="sr-only"> students - open them</span>
          </Link>
        </div>

        <p className="mt-4 text-[16px] font-medium text-ink">
          {studentActionHeadline(action.studentCount)}
        </p>

        <RequirementRows
          kind="action"
          requirements={action.requirements}
          href={href}
          emptyText="Nothing is requested or awaiting an update from any student in this batch."
        />
      </section>

      <section
        aria-labelledby="needs-review-heading"
        className={`rounded-3xl border p-7 sm:p-8 ${
          review.studentCount > 0
            ? "border-info-line bg-info-soft/50"
            : "border-line bg-surface"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h3
              id="needs-review-heading"
              className="flex items-center gap-2.5 text-[22px] font-semibold leading-tight text-ink"
            >
              <ClipboardCheck size={22} aria-hidden="true" className="text-info-ink" />
              {NEED_KIND_LABELS.review}
            </h3>
            <p className="mt-1.5 text-[16px] text-ink-muted">
              Checklist items nobody on staff has looked at yet. This is our
              queue, not a missing student document.
            </p>
          </div>
          <Link
            href={href("review")}
            className="text-right text-[38px] font-semibold leading-none text-info-ink hover:underline"
          >
            {review.studentCount}
            <span className="sr-only"> students - open them</span>
          </Link>
        </div>

        <p className="mt-4 text-[16px] font-medium text-ink">
          {staffReviewHeadline(review.studentCount)}
        </p>

        <RequirementRows
          kind="review"
          requirements={review.requirements}
          href={href}
          emptyText="Every checklist item in this batch has been reviewed."
        />
      </section>
    </div>
  );
}
