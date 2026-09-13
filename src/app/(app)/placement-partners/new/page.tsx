import { redirect } from "next/navigation";

import PartnerForm from "@/components/partners/PartnerForm";
import BackLink from "@/components/ui/BackLink";
import { canManagePartners, requireActiveStaff } from "@/lib/auth/session";
import { createPartnerAction } from "@/lib/partners/actions";
import { listPlacementAreas } from "@/lib/partners/queries";

export const metadata = {
  title: "Add Partner",
};

export default async function NewPartnerPage() {
  const session = await requireActiveStaff();
  // Management reads the partner network but does not create records.
  if (!canManagePartners(session)) redirect("/placement-partners");

  const areas = await listPlacementAreas();

  return (
    <>
      <BackLink href="/placement-partners" label="Back to Placement Partners" />

      <div className="mb-10">
        <h1 className="text-[36px] font-semibold leading-tight tracking-tight text-ink sm:text-[40px]">
          Add Partner
        </h1>
        <p className="mt-3 max-w-2xl text-[18px] text-ink-muted">
          Only the partner name is required. Address, area, and contacts can all
          be filled in later.
        </p>
      </div>

      <PartnerForm
        action={createPartnerAction}
        areas={areas}
        submitLabel="Create Partner"
        cancelHref="/placement-partners"
      />
    </>
  );
}
