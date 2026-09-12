import type { LucideIcon } from "lucide-react";
import Link from "next/link";

type SummaryTone = "info" | "attention" | "ready";

const TONE_CLASSES: Record<
  SummaryTone,
  { card: string; icon: string; value: string; label: string; note: string }
> = {
  info: {
    card: "border-info-line bg-info-soft",
    icon: "bg-white text-info-ink",
    value: "text-info-ink",
    label: "text-info-ink",
    note: "text-info-ink/80",
  },
  attention: {
    card: "border-attention-line bg-attention-soft",
    icon: "bg-white text-attention-ink",
    value: "text-attention-ink",
    label: "text-attention-ink",
    note: "text-attention-ink/80",
  },
  ready: {
    card: "border-ready-line bg-ready-soft",
    icon: "bg-white text-ready-ink",
    value: "text-ready-ink",
    label: "text-ready-ink",
    note: "text-ready-ink/80",
  },
};

type SummaryBlockProps = {
  label: string;
  value: number;
  note: string;
  tone: SummaryTone;
  icon: LucideIcon;
  /** Optional filtered view of the student list. */
  href?: string;
};

/** One of the three large live operational blocks on the Students page. */
export default function SummaryBlock({
  label,
  value,
  note,
  tone,
  icon: Icon,
  href,
}: SummaryBlockProps) {
  const classes = TONE_CLASSES[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-4">
        <p className={`text-[17px] font-semibold ${classes.label}`}>{label}</p>
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${classes.icon}`}
        >
          <Icon size={22} aria-hidden="true" />
        </span>
      </div>
      <p className={`mt-5 text-[40px] font-semibold leading-none ${classes.value}`}>
        {value}
      </p>
      <p className={`mt-4 text-[15px] ${classes.note}`}>{note}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`block rounded-3xl border p-7 transition-shadow hover:shadow-sm ${classes.card}`}
      >
        {body}
      </Link>
    );
  }

  return <div className={`rounded-3xl border p-7 ${classes.card}`}>{body}</div>;
}
