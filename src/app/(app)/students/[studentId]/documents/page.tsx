import { notFound } from "next/navigation";

import DocumentChecklist from "@/components/documents/DocumentChecklist";
import FinalPlacementPackage from "@/components/documents/FinalPlacementPackage";
import ReadinessSummary from "@/components/documents/ReadinessSummary";
import SendStatusEmailButton from "@/components/documents/SendStatusEmailButton";
import StudentEmailHistory from "@/components/documents/StudentEmailHistory";
import BackLink from "@/components/ui/BackLink";
import { getStaffSession, canManageDocuments } from "@/lib/auth/session";
import { listStudentEmailHistory } from "@/lib/documents/email-queries";
import {
  getStudentChecklist,
  getStudentPlacementPackage,
  getStudentReadiness,
  listDocumentRequirements,
} from "@/lib/documents/queries";
import { studentFullName } from "@/lib/format";
import { getStudent } from "@/lib/students/queries";

export const metadata = {
  title: "Placement Documents",
};

export default async function StudentDocumentsPage(
  props: PageProps<"/students/[studentId]/documents">,
) {
  const { studentId } = await props.params;

  const student = await getStudent(studentId);
  if (!student) notFound();

  const [
    items,
    readiness,
    activeRequirements,
    placementPackage,
    emailHistory,
    session,
  ] = await Promise.all([
    getStudentChecklist(student.id),
    getStudentReadiness(student.id),
    listDocumentRequirements({ activeOnly: true }),
    getStudentPlacementPackage(student.id),
    listStudentEmailHistory(student.id),
    getStaffSession(),
  ]);

  const canManage = canManageDocuments(session);
  const fullName = studentFullName(student);
  const incomplete = items.filter(
    (item) =>
      item.document.status !== "received" &&
      item.document.status !== "not_applicable",
  );

  return (
    <>
      <BackLink href={`/students/${student.id}`} label="Back to Student" />

      <div className="mb-8 rounded-3xl border border-line bg-surface p-7 sm:p-8">
        <div className="flex flex-col gap-7 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-ink sm:text-[38px]">
              {fullName}
            </h1>
            <p className="mt-2 text-[18px] text-ink-muted">
              {student.student_number} - {student.program}
            </p>
            <p className="mt-1 text-[17px] text-ink-muted">
              {student.batch?.name ?? "No batch assigned"}
            </p>
          </div>

          <div className="w-full max-w-md rounded-2xl border border-line bg-surface-muted p-6 xl:shrink-0">
            <h2 className="text-[17px] font-semibold text-ink-muted">
              Placement Documents
            </h2>
            <div className="mt-4">
              <ReadinessSummary
                readiness={readiness}
                documentStatus={student.document_status}
                size="large"
              />
            </div>

            {/*
              Emailing a student is the same permission as changing their
              documents. Management sees the Email History below but no send
              button, and the action and Row Level Security both say so again.
            */}
            {canManage ? (
              <div className="mt-6 border-t border-line pt-6">
                <SendStatusEmailButton
                  studentId={student.id}
                  studentName={fullName}
                  studentEmail={student.email}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <section aria-labelledby="checklist-heading">
        <h2
          id="checklist-heading"
          className="mb-2 text-[26px] font-semibold tracking-tight text-ink"
        >
          Document Checklist
        </h2>
        <p className="mb-7 text-[17px] text-ink-muted">
          {incomplete.length === 0
            ? "Every document on this checklist is received or marked N/A."
            : `${incomplete.length} of ${items.length} documents still need attention.`}
        </p>

        <DocumentChecklist
          studentId={student.id}
          items={items}
          canManage={canManage}
          missingCount={Math.max(activeRequirements.length - items.length, 0)}
        />
      </section>

      {/*
        The one file this application stores per student. It sits after the
        checklist because it is the last step: statuses first, then the merged
        PDF an admin prepares outside TAE Placement.
      */}
      <div className="mt-10">
        <FinalPlacementPackage
          studentId={student.id}
          placementPackage={placementPackage}
          canManage={canManage}
        />
      </div>

      {/*
        The permanent record of what this student was actually told, kept here
        rather than in the Resend dashboard. Every entry is the snapshot that was
        sent, so it never changes when the checklist does.
      */}
      <section aria-labelledby="email-history-heading" className="mt-10">
        <h2
          id="email-history-heading"
          className="mb-2 text-[26px] font-semibold tracking-tight text-ink"
        >
          Email History
        </h2>
        <p className="mb-7 max-w-3xl text-[17px] text-ink-muted">
          Every placement document email sent to this student. Opening one shows
          exactly what was sent at the time, not a rebuild from today&apos;s
          checklist.
        </p>

        <StudentEmailHistory items={emailHistory} />
      </section>
    </>
  );
}
