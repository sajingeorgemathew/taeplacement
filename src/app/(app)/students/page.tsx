import { CircleAlert, CircleCheck, Plus, Users } from "lucide-react";
import Link from "next/link";

import BatchCard, { ReturningCard } from "@/components/students/BatchCard";
import { StudentList } from "@/components/students/StudentRow";
import SummaryBlock from "@/components/students/SummaryBlock";
import StudentToolbar from "@/components/students/StudentToolbar";
import { listStudentReadiness } from "@/lib/documents/queries";
import { studentCountLabel } from "@/lib/format";
import {
  hasActiveFilters,
  studentFiltersFrom,
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

export default async function StudentsPage(props: PageProps<"/students">) {
  const searchParams = await props.searchParams;
  const values = toolbarValuesFrom(searchParams);

  const [batches, counts, students, readinessByStudent] = await Promise.all([
    listBatches(),
    getStudentCounts(),
    listStudents(studentFiltersFrom(values)),
    listStudentReadiness(),
  ]);

  const activeBatches = batches.filter((batch) => batch.status === "active");
  const filtered = hasActiveFilters(values);

  return (
    <>
      <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[38px] font-semibold leading-tight tracking-tight text-ink sm:text-[42px]">
            Students
          </h1>
          <p className="mt-3 max-w-2xl text-[18px] text-ink-muted">
            View students by batch and keep placement readiness easy to follow.
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
            note="Active student records across every batch."
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
            href="/students?placement=ready_for_placement"
          />
        </div>
      </section>

      <section aria-labelledby="batches-heading" className="mb-12">
        <h2
          id="batches-heading"
          className="mb-2 text-[26px] font-semibold tracking-tight text-ink"
        >
          Cohorts and Batches
        </h2>
        <p className="mb-6 text-[17px] text-ink-muted">
          Open a batch to work through its students.
        </p>

        {activeBatches.length === 0 && counts.returning === 0 ? (
          <div className="rounded-3xl border border-line bg-surface p-8">
            <p className="text-[17px] text-ink-muted">
              No active batches yet. An admin can create the first batch in Batch
              Management.
            </p>
            <Link
              href="/admin/batches"
              className="mt-5 inline-flex rounded-2xl border border-line px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
            >
              Open Batch Management
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {activeBatches.map((batch) => (
              <BatchCard
                key={batch.id}
                batch={batch}
                counts={counts.byBatch.get(batch.id)}
              />
            ))}
            <ReturningCard total={counts.returning} />
          </div>
        )}
      </section>

      <section aria-labelledby="roster-heading">
        <h2
          id="roster-heading"
          className="mb-2 text-[26px] font-semibold tracking-tight text-ink"
        >
          Students Across Batches
        </h2>
        <p className="mb-6 text-[17px] text-ink-muted">
          {filtered
            ? `Showing ${studentCountLabel(students.length)} for the current search and filters.`
            : `Showing all ${studentCountLabel(students.length)}.`}
        </p>

        <div className="mb-7">
          <StudentToolbar basePath="/students" values={values} batches={batches} />
        </div>

        <StudentList
          students={students}
          readinessByStudent={readinessByStudent}
          emptyMessage={
            filtered
              ? "No students match this search. Try clearing the filters."
              : "No students yet. Use Add Student to create the first record."
          }
        />
      </section>
    </>
  );
}
