import ModulePlaceholder from "@/components/ui/ModulePlaceholder";
import PageHeader from "@/components/ui/PageHeader";

export const metadata = {
  title: "Activity",
};

export default function ActivityPage() {
  return (
    <>
      <PageHeader
        title="Activity"
        description="Recent placement activity and internal requests."
      />
      <ModulePlaceholder note="A simple record of placement activity and internal requests will appear here." />
    </>
  );
}
