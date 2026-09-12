import { StudentList } from "@/components/students/StudentRow";
import StudentToolbar from "@/components/students/StudentToolbar";
import BackLink from "@/components/ui/BackLink";
import { studentCountLabel } from "@/lib/format";
import { studentFiltersFrom, toolbarValuesFrom } from "@/lib/students/filters";
import { listStudents } from "@/lib/students/queries";

export const metadata = {
  title: "Previous / Returning Students",
};

/**
 * Previous / Returning is a view over students.is_returning. It is deliberately
 * not a batch record.
 */
export default async function ReturningStudentsPage(
  props: PageProps<"/students/returning">,
) {
  const searchParams = await props.searchParams;
  const values = toolbarValuesFrom(searchParams);

  const students = await listStudents({
    ...studentFiltersFrom(values),
    returning: "yes",
  });

  return (
    <>
      <BackLink href="/students" label="Back to Students" />

      <div className="mb-10">
        <h1 className="text-[36px] font-semibold leading-tight tracking-tight text-ink sm:text-[40px]">
          Previous / Returning Students
        </h1>
        <p className="mt-3 max-w-2xl text-[18px] text-ink-muted">
          Students marked as returning. They keep their original batch where it
          is known.
        </p>
        <p className="mt-5 text-[34px] font-semibold leading-none text-ink">
          {students.length}
        </p>
        <p className="mt-2 text-[16px] text-ink-muted">
          {studentCountLabel(students.length)} shown.
        </p>
      </div>

      <div className="mb-7">
        <StudentToolbar
          basePath="/students/returning"
          values={values}
          showReturningFilter={false}
          searchPlaceholder="Search returning students"
        />
      </div>

      <StudentList
        students={students}
        emptyMessage="No returning students yet. Mark a student as returning from Edit Student."
      />
    </>
  );
}
