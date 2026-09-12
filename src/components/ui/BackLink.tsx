import { ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * Required on every deeper operational page. Always points at a logical parent
 * route rather than relying on browser history.
 */
export default function BackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="mb-6 inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-[16px] font-medium text-brand-strong transition-colors hover:bg-brand-soft"
    >
      <ArrowLeft size={20} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
