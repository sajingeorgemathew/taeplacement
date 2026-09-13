import {
  CalendarClock,
  ChevronRight,
  CircleAlert,
  MapPin,
  Phone,
  Users,
} from "lucide-react";
import Link from "next/link";

import { partnerLocationLabel } from "@/components/partners/PartnerList";
import StatusPill from "@/components/ui/StatusPill";
import {
  availabilityChipLabel,
  contactCountLabel,
  formatDate,
  formatDateOnly,
} from "@/lib/format";
import type { PartnerListItem } from "@/lib/partners/queries";
import { AVAILABILITY_STATUS_TONES } from "@/lib/placement/constants";
import { isFollowUpDue } from "@/lib/planning/batch";
import type { PartnerContactRow } from "@/lib/supabase/database.types";

/**
 * A placement partner as Area planning sees it.
 *
 * Availability is the question this list exists to answer, so Available Now
 * gets a green outline and sorts to the top. Unknown partners are NEVER hidden
 * or pushed out of sight: an unverified partner is not a closed one, and those
 * are often exactly the rows that need a phone call before the batch starts.
 *
 * The follow-up indicator reuses the existing next_follow_up_at on the partner
 * record. There is no second follow-up model, no reminder, and no notification:
 * this only says a date staff already set has arrived.
 */
function PlanningPartnerRow({
  partner,
  primaryContact,
  today,
}: {
  partner: PartnerListItem;
  primaryContact: PartnerContactRow | undefined;
  today: Date;
}) {
  const available = partner.availability_status === "available_now";
  const intake =
    partner.availability_status === "upcoming"
      ? formatDate(partner.next_intake_date)
      : null;
  const followUp = formatDateOnly(partner.next_follow_up_at);
  const due = isFollowUpDue(partner.next_follow_up_at, today);

  return (
    <li>
      <Link
        href={`/placement-partners/${partner.id}`}
        className={`flex flex-col gap-5 rounded-3xl border bg-surface p-6 transition-colors hover:border-brand hover:bg-brand-soft/40 sm:p-7 lg:flex-row lg:items-center ${
          available ? "border-ready-line ring-1 ring-ready-line" : "border-line"
        }`}
      >
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
              {partnerLocationLabel(partner)}
            </span>
          </p>

          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <Users size={17} aria-hidden="true" />
              {contactCountLabel(partner.contactCount)}
            </span>
            {followUp ? (
              <span
                className={`inline-flex items-center gap-1.5 ${
                  due ? "font-medium text-warning-ink" : ""
                }`}
              >
                {due ? (
                  <CircleAlert size={17} aria-hidden="true" />
                ) : (
                  <CalendarClock size={17} aria-hidden="true" />
                )}
                Follow up {followUp}
                {due ? " - Due" : ""}
              </span>
            ) : null}
          </p>

          {primaryContact ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-surface-muted px-3 py-2.5 text-[15px] text-ink">
              <Phone
                size={17}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-ink-muted"
              />
              <span className="min-w-0 break-words">
                {primaryContact.full_name}
                {primaryContact.job_title ? ` - ${primaryContact.job_title}` : ""}
              </span>
            </p>
          ) : (
            <p className="mt-3 text-[15px] text-ink-muted">
              No primary contact marked yet
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:w-[15rem] lg:shrink-0">
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
        </div>

        <span className="flex items-center gap-1 text-[16px] font-medium text-brand-strong lg:shrink-0">
          Open Partner
          <ChevronRight size={20} aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

export default function PlanningPartnerList({
  partners,
  primaryContacts,
  emptyMessage,
  today,
}: {
  partners: PartnerListItem[];
  primaryContacts: Map<string, PartnerContactRow>;
  emptyMessage: string;
  today: Date;
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
        <PlanningPartnerRow
          key={partner.id}
          partner={partner}
          primaryContact={primaryContacts.get(partner.id)}
          today={today}
        />
      ))}
    </ul>
  );
}
