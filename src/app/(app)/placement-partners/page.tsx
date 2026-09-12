import ModulePlaceholder from "@/components/ui/ModulePlaceholder";
import PageHeader from "@/components/ui/PageHeader";

export const metadata = {
  title: "Placement Partners",
};

export default function PlacementPartnersPage() {
  return (
    <>
      <PageHeader
        title="Placement Partners"
        description="LTCs and other placement partner accounts."
      />
      <ModulePlaceholder note="Placement partner accounts, contacts, and available spots will be managed here." />
    </>
  );
}
