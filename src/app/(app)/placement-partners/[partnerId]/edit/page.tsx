import { notFound, redirect } from "next/navigation";

import PartnerForm from "@/components/partners/PartnerForm";
import BackLink from "@/components/ui/BackLink";
import { canManagePartners, requireActiveStaff } from "@/lib/auth/session";
import { updatePartnerAction } from "@/lib/partners/actions";
import { getPartner, listPlacementAreas } from "@/lib/partners/queries";

export const metadata = {
  title: "Edit Partner",
};

export default async function EditPartnerPage(
  props: PageProps<"/placement-partners/[partnerId]/edit">,
) {
  const { partnerId } = await props.params;

  const session = await requireActiveStaff();
  if (!canManagePartners(session)) {
    redirect(`/placement-partners/${partnerId}`);
  }

  const [partner, areas] = await Promise.all([
    getPartner(partnerId),
    listPlacementAreas(),
  ]);
  if (!partner) notFound();

  return (
    <>
      <BackLink
        href={`/placement-partners/${partner.id}`}
        label={`Back to ${partner.name}`}
      />

      <div className="mb-10">
        <h1 className="text-[36px] font-semibold leading-tight tracking-tight text-ink sm:text-[40px]">
          Edit Partner
        </h1>
        <p className="mt-3 max-w-2xl text-[18px] text-ink-muted">
          {partner.name}
        </p>
      </div>

      <PartnerForm
        action={updatePartnerAction}
        partner={partner}
        areas={areas}
        submitLabel="Save Partner"
        cancelHref={`/placement-partners/${partner.id}`}
      />
    </>
  );
}
