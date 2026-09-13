import { FileText, Mail, MapPin, Pencil, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import ReadinessSummary from "@/components/documents/ReadinessSummary";
import StudentPlacementSection from "@/components/placement/StudentPlacementSection";
import NotesPanel from "@/components/students/NotesPanel";
import BackLink from "@/components/ui/BackLink";
import {
  DocumentStatusPill,
  PlacementDocumentStatusPill,
  PlacementStatusPill,
} from "@/components/ui/StatusPill";
import { canManagePlacements, getStaffSession } from "@/lib/auth/session";
import {
  getStudentChecklist,
  getStudentReadiness,
} from "@/lib/documents/queries";
import { studentFullName, studentInitials } from "@/lib/format";
import {
  getCurrentPlacement,
  listStudentPlacements,
} from "@/lib/placement/queries";
import { locationLabel } from "@/lib/students/address";
import { getStudent, listStudentNotes } from "@/lib/students/queries";
import type { StudentListItem } from "@/lib/students/queries";

export const metadata = {
  title: "Student",
};

/** Keep the student page calm: the full checklist lives on its own page. */
const INCOMPLETE_PREVIEW = 4;

/** The logical parent route for this student, used by the Back action. */
function parentFor(student: StudentListItem): { href: string; label: string } {
  if (student.batch) {
    return {
      href: `/students/batches/${student.batch.id}`,
      label: `Back to ${student.batch.name}`,
    };
  }
  if (student.is_returning) {
    return {
      href: "/students/returning",
      label: "Back to Previous / Returning Students",
    };
  }
  return { href: "/students", label: "Back to Students" };
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-7 sm:p-8">
      <h2 className="text-[24px] font-semibold tracking-tight text-ink">
        {title}
      </h2>
      {description ? (
        <p className="mt-2 text-[16px] text-ink-muted">{description}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-line bg-surface-muted p-5">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-ink-muted">
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[15px] text-ink-muted">{label}</p>
        <p className="mt-1 break-words text-[17px] text-ink">
          {value ?? "Not on file"}
        </p>
      </div>
    </div>
  );
}

export default async function StudentPage(
  props: PageProps<"/students/[studentId]">,
) {
  const { studentId } = await props.params;

  const student = await getStudent(studentId);
  if (!student) notFound();

  const [notes, readiness, checklist, placement, placements, session] =
    await Promise.all([
      listStudentNotes(student.id),
      getStudentReadiness(student.id),
      getStudentChecklist(student.id),
      getCurrentPlacement(student.id),
      listStudentPlacements(student.id),
      getStaffSession(),
    ]);

  const canManage = canManagePlacements(session);

  const incomplete = checklist.filter(
    (item) =>
      item.document.status !== "received" &&
      item.document.status !== "not_applicable",
  );

  const fullName = studentFullName(student);
  const parent = parentFor(student);
  const address = [student.address_line, student.postal_code]
    .filter(Boolean)
    .join(" - ");

  return (
    <>
      <BackLink href={parent.href} label={parent.label} />

      <nav aria-label="Breadcrumb" className="mb-6">
        <ol className="flex flex-wrap items-center gap-2 text-[15px] text-ink-muted">
          <li>
            <Link href="/students" className="hover:text-ink">
              Students
            </Link>
          </li>
          {student.batch ? (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href={`/students/batches/${student.batch.id}`}
                  className="hover:text-ink"
                >
                  {student.batch.name}
                </Link>
              </li>
            </>
          ) : null}
          <li aria-hidden="true">/</li>
          <li className="text-ink">{fullName}</li>
        </ol>
      </nav>

      <div className="mb-8 rounded-3xl border border-line bg-surface p-7 sm:p-8">
        <div className="flex flex-col gap-7 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-[22px] font-semibold text-brand-strong">
              {studentInitials(student)}
            </span>

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
              <p className="mt-1 flex items-start gap-2 text-[16px] text-ink-muted">
                <MapPin
                  size={18}
                  aria-hidden="true"
                  className="mt-1 shrink-0"
                />
                <span className="min-w-0 break-words">
                  {locationLabel(student)}
                </span>
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <PlacementStatusPill
                  status={student.placement_status}
                  size="large"
                />
                <DocumentStatusPill
                  status={student.document_status}
                  size="large"
                />
                {student.is_returning ? (
                  <span className="inline-flex items-center rounded-full border border-line bg-surface-muted px-5 py-2.5 text-[16px] font-medium text-ink-muted">
                    Returning Student
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 xl:shrink-0">
            <NotesPanel
              studentId={student.id}
              studentName={fullName}
              notes={notes}
            />
            <Link
              href={`/students/${student.id}/edit`}
              className="inline-flex items-center gap-2 rounded-2xl border border-line px-6 py-4 text-[17px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
            >
              <Pencil size={20} aria-hidden="true" />
              Edit Student
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Contact Information">
          <div className="flex flex-col gap-4">
            <DetailRow icon={Phone} label="Phone" value={student.phone} />
            <DetailRow icon={Mail} label="Email" value={student.email} />
            <DetailRow
              icon={MapPin}
              label="Address"
              value={address || null}
            />
          </div>
        </Section>

        <div className="flex flex-col gap-6">
          <Section title="Placement Documents">
            <ReadinessSummary
              readiness={readiness}
              documentStatus={student.document_status}
            />

            {incomplete.length > 0 ? (
              <div className="mt-6 rounded-2xl border border-line bg-surface-muted p-6">
                <p className="text-[15px] text-ink-muted">Still outstanding</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {incomplete.slice(0, INCOMPLETE_PREVIEW).map((item) => (
                    <li
                      key={item.document.id}
                      className="flex flex-wrap items-center justify-between gap-3 text-[16px] text-ink"
                    >
                      <span className="min-w-0 break-words">
                        {item.requirement.short_name ?? item.requirement.name}
                      </span>
                      <PlacementDocumentStatusPill
                        status={item.document.status}
                      />
                    </li>
                  ))}
                </ul>
                {incomplete.length > INCOMPLETE_PREVIEW ? (
                  <p className="mt-3 text-[16px] text-ink-muted">
                    and {incomplete.length - INCOMPLETE_PREVIEW} more
                  </p>
                ) : null}
              </div>
            ) : null}

            <Link
              href={`/students/${student.id}/documents`}
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
            >
              <FileText size={20} aria-hidden="true" />
              View Documents
            </Link>
          </Section>

          <Section
            title="Placement"
            description="Their overall placement requirement, where they are placed now, and every placement that came before."
          >
            <StudentPlacementSection
              student={student}
              placement={placement}
              history={placements}
              canManage={canManage}
            />
          </Section>
        </div>
      </div>
    </>
  );
}
