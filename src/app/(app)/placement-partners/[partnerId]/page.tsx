import { Globe, MapPin, Pencil, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import PartnerPlacementsSection from "@/components/placement/PartnerPlacementsSection";
import AvailabilitySection from "@/components/partners/AvailabilitySection";
import ContactsSection from "@/components/partners/ContactsSection";
import FollowUpSection from "@/components/partners/FollowUpSection";
import PartnerArchiveButton from "@/components/partners/PartnerArchiveButton";
import PartnerNotesPanel from "@/components/partners/PartnerNotesPanel";
import {
  partnerAreaLabel,
  partnerLocationLabel,
} from "@/components/partners/PartnerList";
import BackLink from "@/components/ui/BackLink";
import StatusPill from "@/components/ui/StatusPill";
import { canManagePartners, getStaffSession } from "@/lib/auth/session";
import {
  availabilityChipLabel,
  contactCountLabel,
  partnerInitials,
} from "@/lib/format";
import {
  getPartner,
  listPartnerContacts,
  listPartnerNotes,
} from "@/lib/partners/queries";
import { listPartnerPlacements } from "@/lib/placement/queries";
import {
  AVAILABILITY_STATUS_TONES,
  RELATIONSHIP_STATUS_LABELS,
  RELATIONSHIP_STATUS_TONES,
} from "@/lib/placement/constants";

export const metadata = {
  title: "Placement Partner",
};

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
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface-muted p-5">
      <p className="text-[15px] text-ink-muted">{label}</p>
      <p className="mt-1 break-words text-[17px] text-ink">
        {value ?? "Not added yet"}
      </p>
    </div>
  );
}

export default async function PlacementPartnerPage(
  props: PageProps<"/placement-partners/[partnerId]">,
) {
  const { partnerId } = await props.params;

  const partner = await getPartner(partnerId);
  if (!partner) notFound();

  const [contacts, notes, placements, session] = await Promise.all([
    listPartnerContacts(partner.id),
    listPartnerNotes(partner.id),
    listPartnerPlacements(partner.id),
    getStaffSession(),
  ]);

  const canManage = canManagePartners(session);
  const activeContacts = contacts.filter((contact) => contact.is_active);
  const hasLocation = Boolean(
    partner.address_line ||
      partner.city ||
      partner.province ||
      partner.postal_code,
  );
  const website = partner.website?.trim() ?? "";
  const websiteHref = website
    ? website.startsWith("http")
      ? website
      : `https://${website}`
    : null;

  return (
    <>
      <BackLink href="/placement-partners" label="Back to Placement Partners" />

      <div className="mb-8 rounded-3xl border border-line bg-surface p-7 sm:p-8">
        <div className="flex flex-col gap-7 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-[22px] font-semibold text-brand-strong">
              {partnerInitials(partner.name)}
            </span>

            <div className="min-w-0">
              <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-ink sm:text-[38px]">
                {partner.name}
              </h1>
              <p className="mt-2 flex items-start gap-2 text-[18px] text-ink-muted">
                <MapPin
                  size={20}
                  aria-hidden="true"
                  className="mt-1 shrink-0"
                />
                <span className="min-w-0 break-words">
                  {partnerLocationLabel(partner)} - {partnerAreaLabel(partner)}
                </span>
              </p>
              {partner.partner_type ? (
                <p className="mt-1 text-[17px] text-ink-muted">
                  {partner.partner_type}
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                {/* The header chip is the status alone. The intake date, the
                    availability note, and Last Checked are all spelled out in
                    full in Placement Availability below. */}
                <StatusPill
                  label={availabilityChipLabel(partner)}
                  tone={AVAILABILITY_STATUS_TONES[partner.availability_status]}
                  size="large"
                />
                <StatusPill
                  label={
                    RELATIONSHIP_STATUS_LABELS[partner.relationship_status]
                  }
                  tone={RELATIONSHIP_STATUS_TONES[partner.relationship_status]}
                  size="large"
                />
                <span className="inline-flex items-center rounded-full border border-line bg-surface-muted px-5 py-2.5 text-[16px] font-medium text-ink-muted">
                  {contactCountLabel(activeContacts.length)}
                </span>
                {!partner.is_active ? (
                  <span className="inline-flex items-center rounded-full border border-line bg-surface-muted px-5 py-2.5 text-[16px] font-medium text-ink-muted">
                    Archived Partner
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 xl:shrink-0">
            <PartnerNotesPanel
              partnerId={partner.id}
              partnerName={partner.name}
              notes={notes}
            />
            {canManage ? (
              <Link
                href={`/placement-partners/${partner.id}/edit`}
                className="inline-flex items-center gap-2 rounded-2xl border border-line px-6 py-4 text-[17px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
              >
                <Pencil size={20} aria-hidden="true" />
                Edit Partner
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <Section
            title="Placement Availability"
            description="Whether this partner is accepting placements right now, and when their next intake is. This is about the organization, not any one student."
          >
            <AvailabilitySection
              partnerId={partner.id}
              availabilityStatus={partner.availability_status}
              nextIntakeDate={partner.next_intake_date}
              availabilityNote={partner.availability_note}
              availabilityCheckedAt={partner.availability_checked_at}
              canManage={canManage}
            />
          </Section>
        </div>

        <Section
          title="Location"
          description={
            hasLocation
              ? undefined
              : "Location not added yet. Imported partners start without an address."
          }
        >
          {hasLocation ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <DetailRow label="Address" value={partner.address_line} />
              </div>
              <DetailRow label="City" value={partner.city} />
              <DetailRow label="Province" value={partner.province} />
              <DetailRow label="Postal Code" value={partner.postal_code} />
              <DetailRow label="Area" value={partnerAreaLabel(partner)} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailRow label="Area" value={partnerAreaLabel(partner)} />
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-surface-muted p-5">
              <p className="flex items-center gap-2 text-[15px] text-ink-muted">
                <Phone size={17} aria-hidden="true" />
                Main Phone
              </p>
              <p className="mt-1 break-words text-[17px] text-ink">
                {partner.main_phone ?? "Not added yet"}
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-surface-muted p-5">
              <p className="flex items-center gap-2 text-[15px] text-ink-muted">
                <Globe size={17} aria-hidden="true" />
                Website
              </p>
              <p className="mt-1 break-words text-[17px] text-ink">
                {websiteHref ? (
                  <a
                    href={websiteHref}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-brand-strong hover:underline"
                  >
                    {website}
                  </a>
                ) : (
                  "Not added yet"
                )}
              </p>
            </div>
          </div>
        </Section>

        <Section
          title="Follow-up"
          description="When this partner was last contacted, and when to get back to them."
        >
          <FollowUpSection
            partnerId={partner.id}
            lastContactedAt={partner.last_contacted_at}
            nextFollowUpAt={partner.next_follow_up_at}
            canManage={canManage}
          />
        </Section>

        <div className="lg:col-span-2">
          <Section
            title="Contacts"
            description="One partner can have many contacts. Contacts are archived, never deleted."
          >
            <ContactsSection
              partnerId={partner.id}
              contacts={contacts}
              canManage={canManage}
            />
          </Section>
        </div>

        <div className="lg:col-span-2">
          <Section
            title="Current Placements"
            description="Students assigned to or currently on placement at this partner."
          >
            <PartnerPlacementsSection placements={placements} />
          </Section>
        </div>

        <div className="lg:col-span-2">
          <Section
            title="Comments"
            description="Internal notes about this partner. Open the Comments panel at the top of the page to read or add one."
          >
            <div className="flex flex-wrap items-center gap-4">
              <PartnerNotesPanel
                partnerId={partner.id}
                partnerName={partner.name}
                notes={notes}
                panelId="comments-section"
              />
              <p className="text-[16px] text-ink-muted">
                {notes.length === 0
                  ? "No comments yet."
                  : `${notes.length === 1 ? "1 comment" : `${notes.length} comments`} on this partner.`}
              </p>
            </div>
          </Section>
        </div>

        {canManage ? (
          <div className="lg:col-span-2">
            <Section
              title="Partner Record"
              description="Archiving takes a partner off the Area Board and out of List View. Nothing is deleted."
            >
              <div className="flex flex-col gap-4">
                <PartnerArchiveButton
                  partnerId={partner.id}
                  isActive={partner.is_active}
                />
                {partner.legacy_zoho_account_id ? (
                  <p className="text-[15px] text-ink-muted">
                    Migrated from Zoho
                    {partner.legacy_owner_name
                      ? `, originally owned by ${partner.legacy_owner_name}`
                      : ""}
                    .
                  </p>
                ) : null}
              </div>
            </Section>
          </div>
        ) : null}
      </div>
    </>
  );
}
