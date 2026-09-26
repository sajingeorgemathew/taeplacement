import BatchAdmin from "@/components/admin/BatchAdmin";
import BackLink from "@/components/ui/BackLink";
import {
  createBatchAction,
  setBatchPlacementTrackingAction,
  setBatchStatusAction,
  updateBatchAction,
} from "@/lib/batches/actions";
import { getStaffSession, isAdmin } from "@/lib/auth/session";
import { getStudentCounts, listBatches } from "@/lib/students/queries";

export const metadata = {
  title: "Batch Management",
};

export default async function AdminBatchesPage() {
  const [batches, counts, session] = await Promise.all([
    listBatches(),
    getStudentCounts(),
    getStaffSession(),
  ]);

  // Batch Management lists every batch, so it reads the unscoped counts.
  const studentCounts: Record<string, number> = {};
  for (const [batchId, batchCounts] of counts.all.byBatch) {
    studentCounts[batchId] = batchCounts.total;
  }

  return (
    <>
      <BackLink href="/admin" label="Back to Admin" />

      <div className="mb-10">
        <h1 className="text-[36px] font-semibold leading-tight tracking-tight text-ink sm:text-[40px]">
          Batch Management
        </h1>
        <p className="mt-3 max-w-2xl text-[18px] text-ink-muted">
          Create and maintain the batches students are grouped into. Archived
          batches stay available for historical records. Placement Operations
          decides which batches the dashboard counts today; it never changes
          any student.
        </p>
      </div>

      <BatchAdmin
        batches={batches}
        studentCounts={studentCounts}
        canManage={isAdmin(session)}
        createAction={createBatchAction}
        updateAction={updateBatchAction}
        setStatusAction={setBatchStatusAction}
        setTrackingAction={setBatchPlacementTrackingAction}
      />
    </>
  );
}
