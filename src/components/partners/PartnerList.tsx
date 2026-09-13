import { CalendarClock, ChevronRight, MapPin, MessageSquare, Users } from "lucide-react";
import Link from "next/link";

import StatusPill from "@/components/ui/StatusPill";
import {
  availabilityChipLabel,
  compactIntakeDate,
  contactCountLabel,
  formatDateOnly,
  partnerInitials,
} from "@/lib/format";
import type { PartnerListItem } from "@/lib/partners/queries";
import {
  AVAILABILITY_STATUS_TONES,
  RELATIONSHIP_STATUS_LABELS,
  RELATIONSHIP_STATUS_TONES,
  UNASSIGNED_AREA_LABEL,
} from "@/lib/placement/constants";

/** "Toronto, Ontario", the address when there is no city, or a calm fallback. */
export function partnerLocationLabel(partner: {
  city: string | null;
  province: string | null;
  address_line: string | null;
}): string {
  if (partner.city) {
    return partner.province
      ? `${partner.city}, ${partner.province}`
      : partner.city;
  }
  if (partner.address_line) return partner.address_line;
  if (partner.province) return partner.province;
  return "Location not added yet";
}

/** The area name, or Unassigned when area_id is null or the area is archived. */
export function partnerAreaLabel(partner: PartnerListItem): string {
  if (!partner.area) return UNASSIGNED_AREA_LABEL;
  if (!partner.area.is_active) return `${partner.area.name} (archived area)`;
  return partner.area.name;
}

/**
 * One comfortable partner row. Deliberately not a dense CRM table cell: the
 * whole row is a link and everything on it is readable at a glance.
 */
export default function PartnerRow({ partner }: { partner: PartnerListItem }) {
  const followUp = formatDateOnly(partner.next_follow_up_at);
  const intake = compactIntakeDate(partner);

  return (
    <li>
      <Link
        href={`/placement-partners/${partner.id}`}
        className="flex flex-col gap-5 rounded-3xl border border-line bg-surface p-6 transition-colors hover:border-brand hover:bg-brand-soft/40 sm:p-7 lg:flex-row lg:items-center"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-[18px] font-semibold text-brand-strong">
          {partnerInitials(partner.name)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[21px] font-semibold leading-tight text-ink">
              {partner.name}
            </span>
            {partner.partner_type ? (
              <span className="rounded-full border border-line bg-surface-muted px-3 py-1 text-[14px] font-medium text-ink-muted">
                {partner.partner_type}
              </span>
            ) : null}
          </div>

          <p className="mt-2 flex items-start gap-2 text-[16px] text-ink-muted">
            <MapPin size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">
              {partnerLocationLabel(partner)} - {partnerAreaLabel(partner)}
            </span>
          </p>

          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <Users size={17} aria-hidden="true" />
              {contactCountLabel(partner.contactCount)}
            </span>
            {partner.noteCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare size={17} aria-hidden="true" />
                {partner.noteCount === 1 ? "1 comment" : `${partner.noteCount} comments`}
              </span>
            ) : null}
            {followUp ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock size={17} aria-hidden="true" />
                Follow up {followUp}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:w-[13rem] lg:shrink-0">
          {/* Availability first: it is the question a row is scanned for. The
              intake date rides beside the chip rather than inside it. */}
          <StatusPill
            label={availabilityChipLabel(partner)}
            tone={AVAILABILITY_STATUS_TONES[partner.availability_status]}
          />
          {intake ? (
            <span className="inline-flex items-center gap-1.5 text-[15px] text-ink-muted">
              <CalendarClock size={17} aria-hidden="true" />
              <span className="sr-only">Next intake </span>
              {intake}
            </span>
          ) : null}
          <StatusPill
            label={RELATIONSHIP_STATUS_LABELS[partner.relationship_status]}
            tone={RELATIONSHIP_STATUS_TONES[partner.relationship_status]}
          />
        </div>

        <span className="flex items-center gap-1 text-[16px] font-medium text-brand-strong lg:shrink-0">
          Open Partner
          <ChevronRight size={20} aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

export function PartnerList({
  partners,
  emptyMessage,
}: {
  partners: PartnerListItem[];
  emptyMessage: string;
}) {
  if (partners.length === 0) {
    return (
      <div className="rounded-3xl border border-line bg-surface p-8">
        <p className="text-[17px] text-ink-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {partners.map((partner) => (
        <PartnerRow key={partner.id} partner={partner} />
      ))}
    </ul>
  );
}
