import ModulePlaceholder from "@/components/ui/ModulePlaceholder";
import PageHeader from "@/components/ui/PageHeader";

export const metadata = {
  title: "Placement",
};

export default function PlacementPage() {
  return (
    <>
      <PageHeader
        title="Placement"
        description="The placement board for moving students through the placement process."
      />
      <ModulePlaceholder note="The placement board and placement assignments will be managed here." />
    </>
  );
}
