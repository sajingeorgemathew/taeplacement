import { ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";

import { ReadinessCount } from "@/components/documents/ReadinessSummary";
import {
  DocumentStatusPill,
  PlacementStatusPill,
} from "@/components/ui/StatusPill";
import type { DocumentReadiness } from "@/lib/documents/queries";
import { studentFullName } from "@/lib/format";
import { locationLabel } from "@/lib/students/address";
import type { StudentListItem } from "@/lib/students/queries";

/**
 * A large, comfortable student row. Deliberately not a dense table cell: the
 * whole row is a link and the important state is readable at a glance.
 */
export default function StudentRow({
  student,
  readiness,
}: {
  student: StudentListItem;
  /** "9/13 documents". Omitted when the caller does not read readiness. */
  readiness?: DocumentReadiness;
}) {
  const location = locationLabel(student);

  return (
    <li>
      <Link
        href={`/students/${student.id}`}
        className="flex flex-col gap-5 rounded-3xl border border-line bg-surface p-6 transition-colors hover:border-brand hover:bg-brand-soft/40 sm:p-7 lg:flex-row lg:items-center"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[21px] font-semibold leading-tight text-ink">
              {studentFullName(student)}
            </span>
            <span className="text-[16px] text-ink-muted">
              {student.student_number}
            </span>
            {student.is_returning ? (
              <span className="rounded-full border border-line bg-surface-muted px-3 py-1 text-[14px] font-medium text-ink-muted">
                Returning
              </span>
            ) : null}
          </div>

          <p className="mt-2 text-[16px] text-ink-muted">
            {student.batch?.name ?? "No batch assigned"} - {student.program}
          </p>

          <p className="mt-1 flex items-start gap-2 text-[15px] text-ink-muted">
            <MapPin size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">{location}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:w-[22rem] lg:shrink-0">
          <PlacementStatusPill status={student.placement_status} />
          <DocumentStatusPill status={student.document_status} />
          <ReadinessCount readiness={readiness} />
        </div>

        <span className="flex items-center gap-1 text-[16px] font-medium text-brand-strong lg:shrink-0">
          Open Student
          <ChevronRight size={20} aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

/** Calm empty state for any student list. */
export function StudentListEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-8">
      <p className="text-[17px] text-ink-muted">{message}</p>
    </div>
  );
}

export function StudentList({
  students,
  emptyMessage,
  readinessByStudent,
}: {
  students: StudentListItem[];
  emptyMessage: string;
  /** Read once for the whole list rather than once per row. */
  readinessByStudent?: Map<string, DocumentReadiness>;
}) {
  if (students.length === 0) {
    return <StudentListEmpty message={emptyMessage} />;
  }

  return (
    <ul className="flex flex-col gap-4">
      {students.map((student) => (
        <StudentRow
          key={student.id}
          student={student}
          readiness={readinessByStudent?.get(student.id)}
        />
      ))}
    </ul>
  );
}
