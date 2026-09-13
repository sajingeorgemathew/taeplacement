import CityAreaMappingAdmin from "@/components/admin/CityAreaMappingAdmin";
import BackLink from "@/components/ui/BackLink";
import { getStaffSession, isAdmin } from "@/lib/auth/session";
import { listPlacementAreas } from "@/lib/partners/queries";
import { buildCityMappingBoard } from "@/lib/planning/admin";
import {
  listCityAreaMappings,
  listStudentCityUsage,
} from "@/lib/planning/queries";

export const metadata = {
  title: "City to Area Mapping",
};

export default async function AdminCityAreaMappingPage() {
  const [usage, mappings, areas, session] = await Promise.all([
    listStudentCityUsage(),
    listCityAreaMappings(),
    listPlacementAreas(),
    getStaffSession(),
  ]);

  const board = buildCityMappingBoard({ usage, mappings, areas });

  return (
    <>
      <BackLink href="/admin" label="Back to Admin" />

      <div className="mb-10">
        <h1 className="text-[36px] font-semibold leading-tight tracking-tight text-ink sm:text-[40px]">
          City to Area Mapping
        </h1>
        <p className="mt-3 max-w-3xl text-[18px] text-ink-muted">
          Which operational Placement Area does each student city belong to?
          This is the bridge Batch Planning uses to group a batch by area, and
          then to show the placement partners in those areas.
        </p>
      </div>

      <CityAreaMappingAdmin
        board={board}
        activeAreas={areas.filter((area) => area.is_active)}
        canManage={isAdmin(session)}
      />
    </>
  );
}
