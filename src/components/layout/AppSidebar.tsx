import Link from "next/link";

import { APP_NAME } from "@/lib/navigation";

import NavList from "./NavList";

type AppSidebarProps = {
  onNavigate?: () => void;
};

/**
 * Sidebar contents: application name plus the primary navigation.
 * Rendered in the fixed desktop column and inside the mobile drawer.
 */
export default function AppSidebar({ onNavigate }: AppSidebarProps) {
  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="border-b border-line px-6 py-6">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="block text-[22px] font-semibold tracking-tight text-ink"
        >
          {APP_NAME}
        </Link>
        <p className="mt-1 text-[15px] text-ink-muted">
          Toronto Academy of Education
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <NavList onNavigate={onNavigate} />
      </div>

      <div className="border-t border-line px-6 py-5 text-[15px] text-ink-muted">
        Internal staff tool
      </div>
    </div>
  );
}
