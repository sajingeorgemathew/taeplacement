import {
  Building2,
  CalendarClock,
  CheckCircle2,
  MapPin,
  Phone,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AssignmentForm from "@/components/placement/AssignmentForm";
import FindToolbar from "@/components/placement/FindToolbar";
import {
  partnerAreaLabel,
  partnerLocationLabel,
} from "@/components/partners/PartnerList";
import BackLink from "@/components/ui/BackLink";
import StatusPill, {
  DocumentStatusPill,
  PlacementStatusPill,
} from "@/components/ui/StatusPill";
import { canManagePlacements, getStaffSession } from "@/lib/auth/session";
import {
  getStudentPlacementPackage,
  getStudentReadiness,
} from "@/lib/documents/queries";
import {
  availabilityChipLabel,
  contactCountLabel,
  formatDate,
  partnerCountLabel,
  studentFullName,
} from "@/lib/format";
import {
  getPartner,
  listPartners,
  listPlacementAreas,
  type PartnerListItem,
} from "@/lib/partners/queries";
import { AVAILABILITY_STATUS_TONES } from "@/lib/placement/constants";
import {
  findHref,
  findPartnerFiltersFrom,
  findToolbarValuesFrom,
  hasActiveFindFilters,
} from "@/lib/placement/filters";
import {
  getCurrentPlacement,
  getPlacementCountsByPartner,
  getPrimaryContacts,
} from "@/lib/placement/queries";
import type { PartnerContactRow } from "@/lib/supabase/database.types";
import { locationLabel } from "@/lib/students/address";
import { getStudent } from "@/lib/students/queries";

export const metadata = {
  title: "Find Placement",
};

function Panel({
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

export default async function FindPlacementPage(
  props: PageProps<"/placement/find/[studentId]">,
) {
  const { studentId } = await props.params;
  const searchParams = await props.searchParams;
  const values = findToolbarValuesFrom(searchParams);

  const [student, session] = await Promise.all([
    getStudent(studentId),
    getStaffSession(),
  ]);
  if (!student) notFound();

  // Matching is a placement decision, so management never lands on this page at
  // all. The database refuses the write too; this is only the polite version.
  if (!canManagePlacements(session)) redirect(`/students/${student.id}`);

  const [readiness, currentPlacement, packageRecord, areas] = await Promise.all([
    getStudentReadiness(student.id),
    getCurrentPlacement(student.id),
    getStudentPlacementPackage(student.id),
    listPlacementAreas(),
  ]);

  const basePath = `/placement/find/${student.id}`;
  const fullName = studentFullName(student);

  // A student with a live placement is not matched again. Ending the current one
  // is a deliberate step, and which ending applies depends on whether it ever
  // started, so both live on their placement page.
  if (currentPlacement) {
    return (
      <>
        <BackLink href="/placement" label="Back to Placement" />
        <Panel
          title="This student already has a placement"
          description={`${fullName} is already placed at ${currentPlacement.partner?.name ?? "a placement partner"}. Cancel that assignment if it never started, or finish the placement if it did, before matching them somewhere else. Unless it completes their placement requirement, they come straight back here.`}
        >
          <Link
            href={`/students/${student.id}/placement`}
            className="inline-flex rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
          >
            Open Current Placement
          </Link>
        </Panel>
      </>
    );
  }

  // Once a partner is chosen the page becomes the confirmation step, so the
  // whole partner network is not read again just to render a form.
  const chosen = values.partner ? await getPartner(values.partner) : null;

  let partners: PartnerListItem[] = [];
  let placedCounts = new Map<string, number>();
  let primaryContacts = new Map<string, PartnerContactRow>();

  if (!chosen) {
    [partners, placedCounts, primaryContacts] = await Promise.all([
      listPartners(findPartnerFiltersFrom(values)),
      getPlacementCountsByPartner(),
      getPrimaryContacts(),
    ]);
  }

  const filtered = hasActiveFindFilters(values);

  const studentContext = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-line bg-surface-muted p-5">
        <p className="text-[15px] text-ink-muted">Batch</p>
        <p className="mt-1 text-[18px] text-ink">
          {student.batch?.name ?? "No batch assigned"}
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-surface-muted p-5">
        <p className="text-[15px] text-ink-muted">City</p>
        <p className="mt-1 break-words text-[18px] text-ink">
          {locationLabel(student)}
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-surface-muted p-5">
        <p className="text-[15px] text-ink-muted">Document Readiness</p>
        <p className="mt-1 text-[18px] text-ink">
          {readiness.requiredReady} of {readiness.requiredTotal} ready
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-surface-muted p-5">
        <p className="text-[15px] text-ink-muted">Final Placement Package</p>
        <p className="mt-1 text-[18px] text-ink">
          {packageRecord ? "Uploaded" : "Not uploaded"}
        </p>
      </div>
    </div>
  );

  return (
    <>
      <BackLink href="/placement" label="Back to Placement" />

      <div className="mb-8">
        <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-ink sm:text-[38px]">
          Find Placement
        </h1>
        <p className="mt-3 max-w-2xl text-[18px] text-ink-muted">
          Choose a placement partner for {fullName}. Nothing is matched
          automatically; the decision is yours.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <Panel title={fullName}>
          <div className="mb-6 flex flex-wrap gap-2">
            <PlacementStatusPill
              status={student.placement_status}
              size="large"
            />
            <DocumentStatusPill status={student.document_status} size="large" />
            <span className="inline-flex items-center rounded-full border border-line bg-surface-muted px-5 py-2.5 text-[16px] font-medium text-ink-muted">
              {student.student_number}
            </span>
          </div>
          {studentContext}
        </Panel>

        {chosen ? (
          <Panel
            title="Confirm the assignment"
            description="Dates and the note are optional. You can add them later from the student's placement page."
          >
            <AssignmentForm
              studentId={student.id}
              studentName={fullName}
              partnerId={chosen.id}
              partnerName={chosen.name}
              changePartnerHref={findHref(basePath, values, { partner: "" })}
            />
          </Panel>
        ) : (
          <Panel
            title="Placement Partners"
            description="Search the partner network and pick one. Partners with unknown or upcoming availability are still listed: an unverified partner is not a closed one."
          >
            <FindToolbar
              basePath={basePath}
              values={values}
              areas={areas.filter((area) => area.is_active)}
            />

            <p className="mt-6 text-[16px] text-ink-muted">
              {filtered
                ? `Showing ${partnerCountLabel(partners.length)} for the current search.`
                : `Showing all ${partnerCountLabel(partners.length)}.`}
            </p>

            {partners.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-line bg-surface-muted p-7">
                <p className="text-[17px] text-ink-muted">
                  No partners match this search. Try clearing the filters.
                </p>
              </div>
            ) : (
              <ul className="mt-5 grid gap-4 xl:grid-cols-2">
                {partners.map((partner) => {
                  const primary = primaryContacts.get(partner.id);
                  const placed = placedCounts.get(partner.id) ?? 0;
                  const intake =
                    partner.availability_status === "upcoming"
                      ? formatDate(partner.next_intake_date)
                      : null;
                  const available =
                    partner.availability_status === "available_now";

                  return (
                    <li key={partner.id}>
                      <Link
                        href={findHref(basePath, values, {
                          partner: partner.id,
                        })}
                        className={`flex h-full flex-col rounded-3xl border bg-surface p-6 transition-colors hover:border-brand hover:bg-brand-soft/40 ${
                          available
                            ? "border-ready-line ring-1 ring-ready-line"
                            : "border-line"
                        }`}
                      >
                        <span className="flex items-start justify-between gap-4">
                          <span className="min-w-0 text-[20px] font-semibold leading-snug text-ink">
                            {partner.name}
                          </span>
                          {available ? (
                            <CheckCircle2
                              size={22}
                              aria-hidden="true"
                              className="mt-1 shrink-0 text-ready-ink"
                            />
                          ) : null}
                        </span>

                        <span className="mt-2 flex items-start gap-2 text-[16px] text-ink-muted">
                          <MapPin
                            size={18}
                            aria-hidden="true"
                            className="mt-0.5 shrink-0"
                          />
                          <span className="min-w-0 break-words">
                            {partnerLocationLabel(partner)} -{" "}
                            {partnerAreaLabel(partner)}
                          </span>
                        </span>

                        <span className="mt-3 flex flex-wrap items-center gap-2">
                          <StatusPill
                            label={availabilityChipLabel(partner)}
                            tone={
                              AVAILABILITY_STATUS_TONES[
                                partner.availability_status
                              ]
                            }
                          />
                          {intake ? (
                            <span className="inline-flex items-center gap-1.5 text-[15px] text-ink-muted">
                              <CalendarClock size={17} aria-hidden="true" />
                              Next intake {intake}
                            </span>
                          ) : null}
                        </span>

                        <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] text-ink-muted">
                          <span className="inline-flex items-center gap-1.5">
                            <Users size={17} aria-hidden="true" />
                            {contactCountLabel(partner.contactCount)}
                          </span>
                          {placed > 0 ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Building2 size={17} aria-hidden="true" />
                              {placed === 1
                                ? "1 student here now"
                                : `${placed} students here now`}
                            </span>
                          ) : null}
                        </span>

                        {primary ? (
                          <span className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-surface-muted px-3 py-2.5 text-[15px] text-ink">
                            <Phone
                              size={17}
                              aria-hidden="true"
                              className="mt-0.5 shrink-0 text-ink-muted"
                            />
                            <span className="min-w-0 break-words">
                              {primary.full_name}
                              {primary.job_title ? ` - ${primary.job_title}` : ""}
                            </span>
                          </span>
                        ) : (
                          <span className="mt-3 block text-[15px] text-ink-muted">
                            No primary contact marked yet
                          </span>
                        )}

                        <span className="mt-4 inline-flex items-center text-[16px] font-semibold text-brand-strong">
                          Choose this partner
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        )}
      </div>
    </>
  );
}
