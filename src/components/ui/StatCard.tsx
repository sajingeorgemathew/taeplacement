import type { LucideIcon } from "lucide-react";
import Link from "next/link";

/**
 * The operational tones, used with their established meanings and no others:
 * green is ready, blue is a live placement in progress, coral is work somebody
 * owes. The brand navy is deliberately absent here, because a count is
 * operational information rather than branding.
 */
type StatTone = "ready" | "info" | "attention";

const TONE_CLASSES: Record<
  StatTone,
  { card: string; icon: string; value: string }
> = {
  ready: {
    card: "border-ready-line bg-ready-soft",
    icon: "bg-white text-ready-ink",
    value: "text-ready-ink",
  },
  info: {
    card: "border-info-line bg-info-soft",
    icon: "bg-white text-info-ink",
    value: "text-info-ink",
  },
  attention: {
    card: "border-attention-line bg-attention-soft",
    icon: "bg-white text-attention-ink",
    value: "text-attention-ink",
  },
};

type StatCardProps = {
  label: string;
  /** A real count. Zero is shown as 0, never as a dash. */
  value: number;
  tone: StatTone;
  icon: LucideIcon;
  /** Optional list view this count belongs to. */
  href?: string;
};

/**
 * One large, easy to scan summary number on the Dashboard.
 *
 * Deliberately just a label, a number, and an icon: the count is the point, and
 * the Dashboard is not an analytics page.
 */
export default function StatCard({
  label,
  value,
  tone,
  icon: Icon,
  href,
}: StatCardProps) {
  const classes = TONE_CLASSES[tone];

  /*
    The label gets the full width of the card and the icon sits beside the
    number instead of beside the label. Four of these across a desktop screen
    leaves a label roughly twenty characters wide, and sharing that row with an
    icon is what forces "Partner Follow-ups Due" to break at its own hyphen.
  */
  const body = (
    <>
      <p className="text-[16px] font-semibold text-ink">{label}</p>
      <div className="mt-5 flex items-end justify-between gap-3">
        <p className={`text-[44px] font-semibold leading-none ${classes.value}`}>
          {value}
        </p>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${classes.icon}`}
        >
          <Icon size={20} aria-hidden="true" />
        </span>
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`block rounded-2xl border p-6 transition-shadow hover:shadow-sm ${classes.card}`}
      >
        {body}
      </Link>
    );
  }

  return <div className={`rounded-2xl border p-6 ${classes.card}`}>{body}</div>;
}
