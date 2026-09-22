import { notFound } from "next/navigation";

import BatchReminderPanel from "@/components/documents/BatchReminderPanel";
import BackLink from "@/components/ui/BackLink";
import { canManageDocuments, getStaffSession } from "@/lib/auth/session";
import { getBatchReminderReview } from "@/lib/documents/email-queries";
import { getCommonOpeningMessage } from "@/lib/documents/email-settings-queries";
import { getBatch } from "@/lib/students/queries";

export const metadata = {
  title: "Send Document Reminders",
};

/**
 * The review screen for one batch's outstanding document reminders.
 *
 * Deliberately a page of its own, reached from the batch, rather than a button
 * on a list. Sending 27 emails is not a quick action and should not sit one
 * accidental click away from a roster: a staff member arrives here on purpose,
 * reads who is included and who is not, and then decides.
 *
 * Bulk sending is BATCH SCOPED everywhere: this route cannot be reached without
 * a batch id, the review is built from that batch, and the send action re-reads
 * the batch membership on the server before emailing anyone.
 */
export default async function BatchDocumentRemindersPage(
  props: PageProps<"/students/batches/[batchId]/document-reminders">,
) {
  const { batchId } = await props.params;

  const batch = await getBatch(batchId);
  if (!batch) notFound();

  const session = await getStaffSession();

  // Management may read placement documents and email history, but sending is
  // the same permission as changing a document. The action checks this again on
  // the server, and Row Level Security checks it a third time.
  if (!canManageDocuments(session)) {
    return (
      <>
        <BackLink
          href={`/students/batches/${batch.id}`}
          label={`Back to ${batch.name}`}
        />
        <div className="rounded-3xl border border-line bg-surface p-8">
          <h1 className="text-[28px] font-semibold tracking-tight text-ink">
            Send Document Reminders
          </h1>
          <p className="mt-3 text-[17px] text-ink-muted">
            Your account can view placement documents but not email students
            about them. Ask a placement manager or an admin.
          </p>
        </div>
      </>
    );
  }

  // The common opening message is resolved HERE, once, when the review screen
  // loads, and becomes the reviewed batch default: shown on the screen, and
  // submitted verbatim with the send. The send action uses the submitted text
  // and does not re-read the Admin setting, so what staff reviewed is what is
  // sent.
  const [review, commonOpeningMessage] = await Promise.all([
    getBatchReminderReview(batch.id),
    getCommonOpeningMessage(),
  ]);

  return (
    <>
      <BackLink
        href={`/students/batches/${batch.id}`}
        label={`Back to ${batch.name}`}
      />

      <div className="mb-8">
        <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-ink sm:text-[38px]">
          Send Document Reminders
        </h1>
        <p className="mt-3 max-w-3xl text-[18px] text-ink-muted">
          One personalized email per student, listing only the placement
          documents they still need to provide. Nothing is sent until you press
          Send.
        </p>
      </div>

      <BatchReminderPanel
        batchId={batch.id}
        batchName={batch.name}
        review={review}
        commonOpeningMessage={commonOpeningMessage}
      />
    </>
  );
}
