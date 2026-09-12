import { Layers } from "lucide-react";

import ModulePlaceholder from "@/components/ui/ModulePlaceholder";
import PageHeader from "@/components/ui/PageHeader";
import QuickAccessCard from "@/components/ui/QuickAccessCard";

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

      <section aria-labelledby="admin-tools-heading" className="mb-12">
        <h2
          id="admin-tools-heading"
          className="mb-5 text-[22px] font-semibold tracking-tight text-ink"
        >
          Configuration
        </h2>
        <QuickAccessCard
          title="Batch Management"
          description="Create, edit, archive, and reactivate student batches."
          href="/admin/batches"
          icon={Layers}
        />
      </section>

      <ModulePlaceholder note="Placement areas, staff access, and other configurable options will be managed here." />
    </>
  );
}
