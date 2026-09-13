import AreaAdmin from "@/components/admin/AreaAdmin";
import BackLink from "@/components/ui/BackLink";
import { getStaffSession, isAdmin } from "@/lib/auth/session";
import {
  getAreaUsageCounts,
  listPlacementAreas,
} from "@/lib/partners/queries";

export const metadata = {
  title: "Placement Areas",
};

export default async function AdminPlacementAreasPage() {
  const [areas, usageCounts, session] = await Promise.all([
    listPlacementAreas(),
    getAreaUsageCounts(),
    getStaffSession(),
  ]);

  return (
    <>
      <BackLink href="/admin" label="Back to Admin" />

      <div className="mb-10">
        <h1 className="text-[36px] font-semibold leading-tight tracking-tight text-ink sm:text-[40px]">
          Placement Areas
        </h1>
        <p className="mt-3 max-w-2xl text-[18px] text-ink-muted">
          The areas placement partners are grouped into. These are operational
          clusters, not geographic truth, and they drive the columns on the Area
          Board.
        </p>
      </div>

      <AreaAdmin
        areas={areas}
        usageCounts={usageCounts}
        canManage={isAdmin(session)}
      />
    </>
  );
}
