import { notFound } from "next/navigation";

import StudentForm from "@/components/students/StudentForm";
import BackLink from "@/components/ui/BackLink";
import { studentFullName } from "@/lib/format";
import { updateStudentAction } from "@/lib/students/actions";
import { getStudent, listBatches } from "@/lib/students/queries";

export const metadata = {
  title: "Edit Student",
};

export default async function EditStudentPage(
  props: PageProps<"/students/[studentId]/edit">,
) {
  const { studentId } = await props.params;

  const [student, batches] = await Promise.all([
    getStudent(studentId),
    listBatches(),
  ]);

  if (!student) notFound();

  return (
    <>
      <BackLink
        href={`/students/${student.id}`}
        label={`Back to ${studentFullName(student)}`}
      />

      <div className="mb-10">
        <h1 className="text-[36px] font-semibold leading-tight tracking-tight text-ink sm:text-[40px]">
          Edit Student
        </h1>
        <p className="mt-3 max-w-2xl text-[18px] text-ink-muted">
          {studentFullName(student)} - {student.student_number}
        </p>
      </div>

      <StudentForm
        action={updateStudentAction}
        student={student}
        batches={batches}
        submitLabel="Save Changes"
        cancelHref={`/students/${student.id}`}
      />
    </>
  );
}
