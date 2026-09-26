import { CircleAlert, CircleCheck, Plus, Users } from "lucide-react";
import Link from "next/link";

import ProgramOverviewGrid, {
  BatchRowList,
  ReturningRow,
} from "@/components/students/ProgramOverview";
import { StudentList } from "@/components/students/StudentRow";
import StudentToolbar from "@/components/students/StudentToolbar";
import SummaryBlock from "@/components/ui/SummaryBlock";
import { getProgramOperationsSummary } from "@/lib/dashboard/queries";
import { listStudentReadiness } from "@/lib/documents/queries";
import { studentCountLabel } from "@/lib/format";
import { BATCH_STATUS_LABELS } from "@/lib/placement/constants";
import {
  buildProgramOverview,
  historicalBatches,
  isCurrentOperationsScope,
} from "@/lib/placement/operations";
import {
  hasActiveFilters,
  studentHref,
  studentRosterFiltersFrom,
  studentScopeFrom,
  toolbarValuesFrom,
} from "@/lib/students/filters";
import {
  getStudentCounts,
  listBatches,
  listStudents,
} from "@/lib/students/queries";

export const metadata = {
  title: "Students",
};

const BASE_PATH = "/students";

/**
 * Students, current operations first.
 *
 * The default roster is the same population the dashboard counts: active
 * students in active batches tracked in Placement Operations. Show All
 * Students widens it to the broader active roster, and the ordinary filters
 * work inside whichever scope is chosen. Nothing is deleted, deactivated,
 * archived, or changed by either view.
 *
 * The overview above the roster is PROGRAM first: PSW and ECEA side by side,
 * each with its tracked batches as compact rows.
 */
export default async function StudentsPage(props: PageProps<"/students">) {
  const searchParams = await props.searchParams;
  const values = toolbarValuesFrom(searchParams);
  const scope = studentScopeFrom(values);
  const currentOperations = isCurrentOperationsScope(scope);

  const [batches, scopedCounts, programSummary, students, readinessByStudent] =
    await Promise.all([
      listBatches(),
      getStudentCounts(),
      // The dashboard's own per-program summary, so the program count here is
      // the same number the dashboard shows.
      getProgramOperationsSummary(),
      listStudents(studentRosterFiltersFrom(values)),
      listStudentReadiness(),
    ]);

  const counts = currentOperations ? scopedCounts.current : scopedCounts.all;
  const filtered = hasActiveFilters(values);

  const studentCountByBatch = new Map(
    [...scopedCounts.current.byBatch].map(([id, batch]) => [id, batch.total]),
  );
  const programs = buildProgramOverview(
    batches,
    programSummary,
    studentCountByBatch,
  );

  // Batches outside current operations, offered only under Show All Students.
  // Their counts are the active roster of each batch, from the same read.
  const otherBatches = currentOperations
    ? []
    : historicalBatches(batches).map((batch) => ({
        ...batch,
        studentCount: scopedCounts.all.byBatch.get(batch.id)?.total ?? 0,
      }));

  const scopeNote = currentOperations
    ? "in current placement operations"
    : "across every batch";

  return (
    <>
      <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[38px] font-semibold leading-tight tracking-tight text-ink sm:text-[42px]">
            Students
          </h1>
          <p className="mt-3 max-w-2xl text-[18px] text-ink-muted">
            Current placement operations by program. Open a batch to work
            through its students.
          </p>
        </div>

        <Link
          href="/students/new"
          className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
        >
          <Plus size={22} aria-hidden="true" />
          Add Student
        </Link>
      </div>

      <section aria-labelledby="summary-heading" className="mb-12">
        <h2 id="summary-heading" className="sr-only">
          Placement summary
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          <SummaryBlock
            label="Total Students"
            value={counts.total}
            note={`Active student records ${scopeNote}.`}
            tone="info"
            icon={Users}
          />
          <SummaryBlock
            label="Students Needing Placement"
            value={counts.needingPlacement}
            note="Needs review, documents pending, or waiting on a placement."
            tone="attention"
            icon={CircleAlert}
          />
          <SummaryBlock
            label="Placement Ready"
            value={counts.placementReady}
            note="Ready for placement right now."
            tone="ready"
            icon={CircleCheck}
            href={studentHref(BASE_PATH, values, {
              placement: "ready_for_placement",
            })}
          />
        </div>
      </section>

      <section aria-labelledby="programs-heading" className="mb-12">
        <h2
          id="programs-heading"
          className="mb-2 text-[26px] font-semibold tracking-tight text-ink"
        >
          Programs
        </h2>
        <p className="mb-6 text-[17px] text-ink-muted">
          PSW and ECEA, with the batches tracked in Placement Operations under
          each. Batches that are not tracked, and archived batches, are under
          Show All Students and in Batch Management.
        </p>

        <ProgramOverviewGrid programs={programs} />

        <div className="mt-5 flex flex-col gap-2">
          <ReturningRow total={scopedCounts.all.returning} />
        </div>

        {!currentOperations ? (
          <div className="mt-8">
            <h3 className="mb-2 text-[20px] font-semibold tracking-tight text-ink">
              Batches not in current operations
            </h3>
            <p className="mb-4 text-[16px] text-ink-muted">
              Active batches that are not tracked in Placement Operations, and
              archived batches. Nothing here has been deleted or changed.
            </p>
            {otherBatches.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line bg-surface px-5 py-4 text-[16px] text-ink-muted">
                Every batch is tracked in Placement Operations.
              </p>
            ) : (
              <BatchRowList
                batches={otherBatches.map((batch) => ({
                  ...batch,
                  name:
                    batch.status === "archived"
                      ? `${batch.name} (${BATCH_STATUS_LABELS[batch.status]})`
                      : batch.name,
                }))}
              />
            )}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="roster-heading">
        <h2
          id="roster-heading"
          className="mb-2 text-[26px] font-semibold tracking-tight text-ink"
        >
          {currentOperations ? "Students in Current Operations" : "All Students"}
        </h2>
        <p className="mb-6 text-[17px] text-ink-muted">
          {filtered
            ? `Showing ${studentCountLabel(students.length)} ${scopeNote} for the current search and filters.`
            : `Showing all ${studentCountLabel(students.length)} ${scopeNote}.`}
        </p>

        <div className="mb-7">
          <StudentToolbar
            basePath={BASE_PATH}
            values={values}
            batches={batches}
            showScopeSwitch
          />
        </div>

        <StudentList
          students={students}
          readinessByStudent={readinessByStudent}
          emptyMessage={
            filtered
              ? "No students match this search. Try clearing the filters."
              : currentOperations
                ? "No students are in current placement operations yet. Switch a batch on in Batch Management, or choose Show All Students."
                : "No students yet. Use Add Student to create the first record."
          }
        />
      </section>
    </>
  );
}
