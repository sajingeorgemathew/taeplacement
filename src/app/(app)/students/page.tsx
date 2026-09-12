import ModulePlaceholder from "@/components/ui/ModulePlaceholder";
import PageHeader from "@/components/ui/PageHeader";

export const metadata = {
  title: "Students",
};

export default function StudentsPage() {
  return (
    <>
      <PageHeader
        title="Students"
        description="Student records, batches, and placement readiness."
      />
      <ModulePlaceholder note="Students, batches, and placement readiness will be managed here." />
    </>
  );
}
