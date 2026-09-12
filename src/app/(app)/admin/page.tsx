import ModulePlaceholder from "@/components/ui/ModulePlaceholder";
import PageHeader from "@/components/ui/PageHeader";

export const metadata = {
  title: "Admin",
};

export default function AdminPage() {
  return (
    <>
      <PageHeader
        title="Admin"
        description="Settings for placement areas, staff access, and configurable options."
      />
      <ModulePlaceholder note="Configurable placement options and small team administration will be managed here." />
    </>
  );
}
