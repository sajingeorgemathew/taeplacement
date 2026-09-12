"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";

import { getSectionLabel } from "@/lib/navigation";

type AppHeaderProps = {
  onOpenMenu: () => void;
  staffName: string;
  signOut: React.ReactNode;
};

/**
 * Top bar: mobile menu button, current section name, the signed in staff
 * member, and Sign Out.
 */
export default function AppHeader({
  onOpenMenu,
  staffName,
  signOut,
}: AppHeaderProps) {
  const pathname = usePathname();
  const section = getSectionLabel(pathname);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="flex items-center gap-4 px-5 py-4 sm:px-8">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          className="flex items-center gap-2 rounded-xl border border-line px-4 py-3 text-[16px] font-medium text-ink hover:bg-surface-muted lg:hidden"
        >
          <Menu size={22} aria-hidden="true" />
          <span>Menu</span>
        </button>

        <p className="flex-1 truncate text-[18px] font-semibold text-ink">
          {section}
        </p>

        <span className="hidden max-w-[16rem] truncate text-[15px] text-ink-muted sm:block">
          {staffName}
        </span>

        {signOut}
      </div>
    </header>
  );
}
