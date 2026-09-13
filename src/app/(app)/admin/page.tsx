import { FileCheck, Layers, Map, MapPin } from "lucide-react";

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
        <div className="grid gap-5 lg:grid-cols-2">
          <QuickAccessCard
            title="Batch Management"
            description="Create, edit, archive, and reactivate student batches."
            href="/admin/batches"
            icon={Layers}
          />
          <QuickAccessCard
            title="Document Requirements"
            description="Maintain the placement document checklist every student is measured against."
            href="/admin/document-requirements"
            icon={FileCheck}
          />
          <QuickAccessCard
            title="Placement Areas"
            description="Add, rename, reorder, and archive the areas placement partners are grouped into."
            href="/admin/placement-areas"
            icon={Map}
          />
          <QuickAccessCard
            title="City to Area Mapping"
            description="Decide which Placement Area each student city belongs to. This is what groups a batch by area in Batch Planning."
            href="/admin/city-area-mapping"
            icon={MapPin}
          />
        </div>
      </section>

      <ModulePlaceholder note="Staff access and other configurable options will be managed here." />
    </>
  );
}
