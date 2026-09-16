import { Mail } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StudentList } from "@/components/students/StudentRow";
import StudentToolbar from "@/components/students/StudentToolbar";
import BackLink from "@/components/ui/BackLink";
import { canManageDocuments, getStaffSession } from "@/lib/auth/session";
import { listStudentReadiness } from "@/lib/documents/queries";
import { formatDate, studentCountLabel } from "@/lib/format";
import {
  NEEDS_PLACEMENT_STATUSES,
  PLACEMENT_READY_STATUS,
} from "@/lib/placement/constants";
import { studentFiltersFrom, toolbarValuesFrom } from "@/lib/students/filters";
import { getBatch, listStudents } from "@/lib/students/queries";

export const metadata = {
  title: "Batch",
};

export default async function BatchPage(
  props: PageProps<"/students/batches/[batchId]">,
) {
  const { batchId } = await props.params;
  const searchParams = await props.searchParams;
  const values = toolbarValuesFrom(searchParams);

  const batch = await getBatch(batchId);
  if (!batch) notFound();

  const [students, readinessByStudent, session] = await Promise.all([
    listStudents({ ...studentFiltersFrom(values), batchId: batch.id }),
    listStudentReadiness(),
    getStaffSession(),
  ]);

  const canEmail = canManageDocuments(session);

  const needingPlacement = students.filter((student) =>
    NEEDS_PLACEMENT_STATUSES.includes(student.placement_status),
  ).length;
  const placementReady = students.filter(
    (student) => student.placement_status === PLACEMENT_READY_STATUS,
  ).length;

  const startDate = formatDate(batch.start_date);

  return (
    <>
      <BackLink href="/students" label="Back to Students" />

      <div className="mb-10">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[36px] font-semibold leading-tight tracking-tight text-ink sm:text-[40px]">
            {batch.name}
          </h1>
          {batch.status === "archived" ? (
            <span className="rounded-full border border-line bg-surface-muted px-4 py-2 text-[15px] font-medium text-ink-muted">
              Archived
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-[18px] text-ink-muted">
          {batch.program}
          {batch.schedule_label ? ` - ${batch.schedule_label}` : ""}
          {startDate ? ` - starts ${startDate}` : ""}
        </p>

        {/*
          Bulk document reminders live behind a review screen, scoped to this
          batch. There is deliberately no roster-wide equivalent of this link
          anywhere in the application.
        */}
        {canEmail ? (
          <Link
            href={`/students/batches/${batch.id}/document-reminders`}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-6 py-4 text-[17px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
          >
            <Mail size={20} aria-hidden="true" />
            Send Document Reminders
          </Link>
        ) : null}
      </div>

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-line bg-surface p-6">
          <p className="text-[16px] text-ink-muted">Students in batch</p>
          <p className="mt-3 text-[34px] font-semibold leading-none text-ink">
            {students.length}
          </p>
        </div>
        <div className="rounded-3xl border border-attention-line bg-attention-soft p-6">
          <p className="text-[16px] font-medium text-attention-ink">
            Needing placement
          </p>
          <p className="mt-3 text-[34px] font-semibold leading-none text-attention-ink">
            {needingPlacement}
          </p>
        </div>
        <div className="rounded-3xl border border-ready-line bg-ready-soft p-6">
          <p className="text-[16px] font-medium text-ready-ink">Placement ready</p>
          <p className="mt-3 text-[34px] font-semibold leading-none text-ready-ink">
            {placementReady}
          </p>
        </div>
      </div>

      <section aria-labelledby="batch-students-heading">
        <h2
          id="batch-students-heading"
          className="mb-2 text-[26px] font-semibold tracking-tight text-ink"
        >
          Students
        </h2>
        <p className="mb-6 text-[17px] text-ink-muted">
          {studentCountLabel(students.length)} shown.
        </p>

        <div className="mb-7">
          <StudentToolbar
            basePath={`/students/batches/${batch.id}`}
            values={values}
            searchPlaceholder="Search within this batch"
          />
        </div>

        <StudentList
          students={students}
          readinessByStudent={readinessByStudent}
          emptyMessage="No students in this batch match the current search."
        />
      </section>
    </>
  );
}
