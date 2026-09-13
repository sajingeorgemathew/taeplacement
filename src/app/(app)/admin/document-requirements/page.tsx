import RequirementAdmin from "@/components/admin/RequirementAdmin";
import BackLink from "@/components/ui/BackLink";
import { getStaffSession, isAdmin } from "@/lib/auth/session";
import {
  countDocumentsByRequirement,
  listDocumentRequirements,
} from "@/lib/documents/queries";

export const metadata = {
  title: "Document Requirements",
};

export default async function AdminDocumentRequirementsPage() {
  const [requirements, usageCounts, session] = await Promise.all([
    listDocumentRequirements(),
    countDocumentsByRequirement(),
    getStaffSession(),
  ]);

  return (
    <>
      <BackLink href="/admin" label="Back to Admin" />

      <div className="mb-10">
        <h1 className="text-[36px] font-semibold leading-tight tracking-tight text-ink sm:text-[40px]">
          Document Requirements
        </h1>
        <p className="mt-3 max-w-2xl text-[18px] text-ink-muted">
          The placement document checklist every student is measured against.
          Required documents decide whether a student is document ready.
        </p>
      </div>

      <RequirementAdmin
        requirements={requirements}
        usageCounts={usageCounts}
        canManage={isAdmin(session)}
      />
    </>
  );
}
