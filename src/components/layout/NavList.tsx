"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActiveNavItem, primaryNavigation } from "@/lib/navigation";

type NavListProps = {
  /** Called after a link is chosen, so the mobile drawer can close itself. */
  onNavigate?: () => void;
};

/**
 * The primary navigation links.
 * Shared by the desktop sidebar and the mobile drawer so the list is defined once.
 */
export default function NavList({ onNavigate }: NavListProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="px-3 py-4">
      <ul className="flex flex-col gap-1">
        {primaryNavigation.map((item) => {
          const Icon = item.icon;
          const active = isActiveNavItem(item, pathname);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[17px] font-medium transition-colors ${
                  active
                    ? "bg-brand-soft text-brand-strong"
                    : "text-ink-muted hover:bg-surface-muted hover:text-ink"
                }`}
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.2 : 1.9}
                  aria-hidden="true"
                  className="shrink-0"
                />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
