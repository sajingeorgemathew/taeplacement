import { Mail, MapPin, Pencil, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import NotesPanel from "@/components/students/NotesPanel";
import BackLink from "@/components/ui/BackLink";
import {
  DocumentStatusPill,
  PlacementStatusPill,
} from "@/components/ui/StatusPill";
import { studentFullName, studentInitials } from "@/lib/format";
import {
  DOCUMENT_STATUS_LABELS,
  PLACEMENT_STATUS_LABELS,
} from "@/lib/placement/constants";
import { locationLabel } from "@/lib/students/address";
import { getStudent, listStudentNotes } from "@/lib/students/queries";
import type { StudentListItem } from "@/lib/students/queries";

export const metadata = {
  title: "Student",
};

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

  const notes = await listStudentNotes(student.id);

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
          <Section
            title="Placement Readiness"
            description="Detailed placement documents will be managed in the Documents module."
          >
            <div className="rounded-2xl border border-line bg-surface-muted p-6">
              <p className="text-[15px] text-ink-muted">Document status</p>
              <p className="mt-2 text-[24px] font-semibold text-ink">
                {DOCUMENT_STATUS_LABELS[student.document_status]}
              </p>
              <p className="mt-3 text-[16px] text-ink-muted">
                {student.document_status === "ready"
                  ? "Documents have been reviewed and cleared."
                  : "Update this from Edit Student as documents are checked."}
              </p>
            </div>
          </Section>

          <Section
            title="Placement"
            description="Placement assignment and partner matching come in a later ticket."
          >
            <div className="rounded-2xl border border-line bg-surface-muted p-6">
              <p className="text-[15px] text-ink-muted">Placement status</p>
              <p className="mt-2 text-[24px] font-semibold text-ink">
                {PLACEMENT_STATUS_LABELS[student.placement_status]}
              </p>
              <p className="mt-3 text-[16px] text-ink-muted">
                No placement has been assigned to this student yet.
              </p>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
