import { Mail } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import BatchDocumentGrid from "@/components/documents/BatchDocumentGrid";
import BatchViewSwitch from "@/components/students/BatchViewSwitch";
import { StudentList } from "@/components/students/StudentRow";
import StudentToolbar from "@/components/students/StudentToolbar";
import BackLink from "@/components/ui/BackLink";
import {
  canManageDocuments,
  getStaffSession,
  isActiveStaff,
} from "@/lib/auth/session";
import {
  batchViewFrom,
  buildBatchDocumentGrid,
} from "@/lib/documents/batch-grid";
import { readBatchGridData } from "@/lib/documents/batch-grid-queries";
import { listStudentReadiness } from "@/lib/documents/queries";
import { formatDate, studentCountLabel } from "@/lib/format";
import {
  NEEDS_PLACEMENT_STATUSES,
  PLACEMENT_READY_STATUS,
} from "@/lib/placement/constants";
import {
  studentFiltersFrom,
  studentHref,
  toolbarValuesFrom,
} from "@/lib/students/filters";
import { getBatch, listStudents } from "@/lib/students/queries";

export const metadata = {
  title: "Batch",
};

/**
 * One batch, in one of two views. PLACEMENT-07B.1.
 *
 *   Document Grid   (default) the whole batch's placement document checklist
 *                   as a matrix: one student per row, one active requirement
 *                   per column, editable in place.
 *   Student Cards   the original StudentList.
 *
 * The header, the three summary tiles, the search, and the reminder link are
 * the same in both views. The search narrows the ROWS of the grid; the
 * requirement columns never change, and no student outside this batch is ever
 * listed.
 */
export default async function BatchPage(
  props: PageProps<"/students/batches/[batchId]">,
) {
  const { batchId } = await props.params;
  const searchParams = await props.searchParams;
  const values = toolbarValuesFrom(searchParams);
  const view = batchViewFrom(values.view);

  const batch = await getBatch(batchId);
  if (!batch) notFound();

  const basePath = `/students/batches/${batch.id}`;

  const [students, readinessByStudent, session] = await Promise.all([
    listStudents({ ...studentFiltersFrom(values), batchId: batch.id }),
    listStudentReadiness(),
    getStaffSession(),
  ]);

  const canEmail = canManageDocuments(session);
  const canManage = canManageDocuments(session);
  // Every active staff member may edit a student and may add a general note,
  // the same rule the student form and the 0001 policies apply.
  const canEditStudents = isActiveStaff(session);

  // The grid's bulk reads happen only when the grid is shown. A fixed number
  // of queries for the whole batch, built into the matrix in memory.
  const grid =
    view === "grid"
      ? await (async () => {
          const read = await readBatchGridData(
            students.map((student) => student.id),
          );
          return buildBatchDocumentGrid({
            students,
            requirements: read.requirements,
            rows: read.rows,
            readiness: readinessByStudent,
            notes: read.notes,
            authorNames: read.authorNames,
          });
        })()
      : null;

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

        <div className="mb-5">
          <BatchViewSwitch
            current={view}
            gridHref={studentHref(basePath, values, { view: "grid" })}
            cardsHref={studentHref(basePath, values, { view: "cards" })}
          />
        </div>

        <div className="mb-7">
          <StudentToolbar
            basePath={basePath}
            values={values}
            searchPlaceholder="Search within this batch"
          />
        </div>

        {grid ? (
          <>
            {grid.missingCellCount > 0 ? (
              <div className="mb-4 rounded-2xl border border-info-line bg-info-soft px-6 py-4">
                <p className="text-[15px] text-info-ink">
                  {grid.studentsMissingRows === 1
                    ? "1 student is"
                    : `${grid.studentsMissingRows} students are`}{" "}
                  missing a checklist row for a requirement added after their
                  checklist was created. Those cells show Not Initialized.
                  Open the student&apos;s documents page and choose Add Missing
                  Documents to create them; nothing is created by viewing this
                  grid.
                </p>
              </div>
            ) : null}

            <BatchDocumentGrid
              grid={grid}
              canManageDocuments={canManage}
              canEditStudents={canEditStudents}
              canAddNotes={canEditStudents}
              emptyMessage="No students in this batch match the current search."
            />
          </>
        ) : (
          <StudentList
            students={students}
            readinessByStudent={readinessByStudent}
            emptyMessage="No students in this batch match the current search."
          />
        )}
      </section>
    </>
  );
}
