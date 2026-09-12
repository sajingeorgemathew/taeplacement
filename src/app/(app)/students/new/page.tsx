import StudentForm from "@/components/students/StudentForm";
import BackLink from "@/components/ui/BackLink";
import { createStudentAction } from "@/lib/students/actions";
import { listBatches } from "@/lib/students/queries";

export const metadata = {
  title: "Add Student",
};

export default async function NewStudentPage() {
  const batches = await listBatches();

  return (
    <>
      <BackLink href="/students" label="Back to Students" />

      <div className="mb-10">
        <h1 className="text-[36px] font-semibold leading-tight tracking-tight text-ink sm:text-[40px]">
          Add Student
        </h1>
        <p className="mt-3 max-w-2xl text-[18px] text-ink-muted">
          Create a new student record. Placement and document status can be
          updated at any time.
        </p>
      </div>

      <StudentForm
        action={createStudentAction}
        batches={batches}
        submitLabel="Add Student"
        cancelHref="/students"
      />
    </>
  );
}
