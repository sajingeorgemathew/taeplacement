import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

type QuickAccessCardProps = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

/** A large card where the whole surface is the link. */
export default function QuickAccessCard({
  title,
  description,
  href,
  icon: Icon,
}: QuickAccessCardProps) {
  return (
    <Link
      href={href}
      className="flex items-start gap-5 rounded-2xl border border-line bg-surface p-7 transition-colors hover:border-brand hover:bg-brand-soft"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
        <Icon size={24} aria-hidden="true" />
      </span>

      <span className="flex-1">
        <span className="block text-[20px] font-semibold text-ink">{title}</span>
        <span className="mt-2 block text-[16px] text-ink-muted">
          {description}
        </span>
      </span>

      <ChevronRight
        size={22}
        aria-hidden="true"
        className="mt-1 shrink-0 text-ink-muted"
      />
    </Link>
  );
}
