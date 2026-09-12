"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";

type AppShellProps = {
  children: React.ReactNode;
  /** Name of the signed in staff member, shown in the header. */
  staffName: string;
  /** Server rendered sign out control. */
  signOut: React.ReactNode;
};

/**
 * Application shell: fixed sidebar on desktop, slide-out drawer on small screens,
 * a page header, and the main content area.
 */
export default function AppShell({ children, staffName, signOut }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-72 lg:border-r lg:border-line">
        <AppSidebar />
      </div>

      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 bg-ink/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="fixed inset-y-0 left-0 z-50 flex w-[85%] max-w-sm flex-col border-r border-line bg-surface shadow-lg"
          >
            <div className="flex justify-end border-b border-line px-4 py-3">
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-xl px-4 py-3 text-[16px] font-medium text-ink hover:bg-surface-muted"
              >
                <X size={22} aria-hidden="true" />
                <span>Close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AppSidebar onNavigate={() => setMenuOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Main column */}
      <div className="lg:pl-72">
        <AppHeader
          onOpenMenu={() => setMenuOpen(true)}
          staffName={staffName}
          signOut={signOut}
        />
        <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}
