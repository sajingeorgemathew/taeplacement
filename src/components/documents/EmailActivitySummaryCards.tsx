import { CircleAlert, CircleCheck, Mail, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import {
  emailActivityHref,
  type EmailActivityValues,
} from "@/lib/documents/email-activity";
import type { EmailActivitySummary } from "@/lib/documents/email-queries";
import type { StudentEmailStatusGroup } from "@/lib/placement/constants";

/**
 * The four blocks above the Email Activity list.
 *
 * They are the summary AND the quick filters, which is one decision rather than
 * two: the same four numbers rendered twice, once to read and once to click,
 * would mean two places to keep true and a screen that says 214 twice.
 *
 * What they count is the CURRENT search, batch, type, and date scope, with the
 * status filter deliberately left out - that is what lets a staff member
 * standing on Needs Attention see, and reach, the Delivered ones beside it. The
 * page says so in a line above them, because a number labelled only "Delivered"
 * beside an active filter is a number that misleads.
 *
 * The three group definitions are the shared ones. In Progress covers Preparing,
 * Accepted by Resend, Sent, and Delivery Delayed, and it is never worded as
 * anything but on its way: the whole point of the accepted / sent / delivered
 * split is that a provider taking a message is not a student receiving it.
 */

const TONE_CLASSES = {
  brand: {
    card: "border-line bg-surface",
    active: "border-brand ring-2 ring-brand",
    icon: "bg-brand-soft text-brand-strong",
    value: "text-ink",
    label: "text-ink",
    note: "text-ink-muted",
  },
  info: {
    card: "border-info-line bg-info-soft",
    active: "border-info ring-2 ring-info",
    icon: "bg-white text-info-ink",
    value: "text-info-ink",
    label: "text-info-ink",
    note: "text-info-ink/80",
  },
  ready: {
    card: "border-ready-line bg-ready-soft",
    active: "border-ready ring-2 ring-ready",
    icon: "bg-white text-ready-ink",
    value: "text-ready-ink",
    label: "text-ready-ink",
    note: "text-ready-ink/80",
  },
  attention: {
    card: "border-attention-line bg-attention-soft",
    active: "border-attention ring-2 ring-attention",
    icon: "bg-white text-attention-ink",
    value: "text-attention-ink",
    label: "text-attention-ink",
    note: "text-attention-ink/80",
  },
} as const;

type CardTone = keyof typeof TONE_CLASSES;

type ActivityCard = {
  /** Empty string is the All card, which clears the status filter. */
  group: StudentEmailStatusGroup | "";
  label: string;
  value: number;
  note: string;
  tone: CardTone;
  icon: LucideIcon;
};

export default function EmailActivitySummaryCards({
  basePath,
  values,
  summary,
}: {
  basePath: string;
  values: EmailActivityValues;
  summary: EmailActivitySummary;
}) {
  const cards: ActivityCard[] = [
    {
      group: "",
      label: "Total Emails",
      value: summary.total,
      note: "Every placement document email in this view.",
      tone: "brand",
      icon: Mail,
    },
    {
      group: "delivered",
      label: "Delivered",
      value: summary.delivered,
      note: "The recipient mail server accepted the message.",
      tone: "ready",
      icon: CircleCheck,
    },
    {
      group: "in_progress",
      label: "In Progress",
      value: summary.inProgress,
      note: "Preparing, accepted, sent, or delayed. Not yet delivered.",
      tone: "info",
      icon: Send,
    },
    {
      group: "needs_attention",
      label: "Needs Attention",
      value: summary.needsAttention,
      note: "Bounced, failed, or marked as spam. Staff should follow up.",
      tone: "attention",
      icon: CircleAlert,
    },
  ];

  return (
    <div
      role="group"
      aria-label="Filter emails by delivery outcome"
      className="grid gap-5 md:grid-cols-2 xl:grid-cols-4"
    >
      {cards.map((card) => {
        const classes = TONE_CLASSES[card.tone];
        // The All card is current when nothing narrows the status at all, so a
        // hand written URL carrying an exact status does not leave every card
        // looking unselected.
        const active =
          card.group === ""
            ? !values.group && !values.status
            : values.group === card.group;
        const Icon = card.icon;

        return (
          <Link
            key={card.label}
            href={emailActivityHref(basePath, values, {
              group: card.group,
              status: "",
            })}
            aria-current={active ? "true" : undefined}
            className={`block rounded-3xl border p-7 transition-shadow hover:shadow-sm ${
              classes.card
            } ${active ? classes.active : ""}`}
          >
            <div className="flex items-start justify-between gap-4">
              <p className={`text-[17px] font-semibold ${classes.label}`}>
                {card.label}
              </p>
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${classes.icon}`}
              >
                <Icon size={22} aria-hidden="true" />
              </span>
            </div>
            <p
              className={`mt-5 text-[40px] font-semibold leading-none ${classes.value}`}
            >
              {card.value}
            </p>
            <p className={`mt-4 text-[15px] ${classes.note}`}>{card.note}</p>
          </Link>
        );
      })}
    </div>
  );
}
