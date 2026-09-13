import Image from "next/image";
import Link from "next/link";

import { APP_NAME } from "@/lib/navigation";

import NavList from "./NavList";

type AppSidebarProps = {
  onNavigate?: () => void;
};

/**
 * Sidebar contents: the Toronto Academy brand block plus the primary navigation.
 * Rendered in the fixed desktop column and inside the mobile drawer, so the
 * brand block has to stay compact enough to leave room for the nav on a phone.
 */
export default function AppSidebar({ onNavigate }: AppSidebarProps) {
  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="border-b border-brand-line bg-brand-soft px-6 py-6">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="block rounded-xl"
        >
          {/*
            The supplied logo is a navy tile with the wordmark already on it, so
            it is shown as a self-contained mark rather than being recoloured.
          */}
          <Image
            src="/brand/toronto-academy-logo.png"
            alt="Toronto Academy of Education"
            width={1000}
            height={500}
            priority
            className="h-auto w-44 rounded-xl"
          />

          {/* The tan from the logo, used as a rule and nowhere as text. */}
          <span
            aria-hidden="true"
            className="mt-4 block h-[3px] w-10 rounded-full bg-brand-accent"
          />

          <p className="mt-3 text-[20px] font-semibold tracking-tight text-brand-strong">
            {APP_NAME}
          </p>
          <p className="mt-1 text-[14px] leading-snug text-ink-muted">
            Placement Management Desk
          </p>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        <NavList onNavigate={onNavigate} />
      </div>

      <div className="border-t border-line px-6 py-4 text-[13px] leading-snug text-ink-muted">
        <p>Toronto Academy of Education</p>
        <p>Internal Placement System</p>
      </div>
    </div>
  );
}
