import { LogOut } from "lucide-react";

import { signOutAction } from "@/lib/auth/actions";

/** Signs the staff member out and returns them to /login. */
export default function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className={
          compact
            ? "flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-[15px] font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            : "flex items-center gap-2 rounded-2xl border border-line px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:bg-surface-muted"
        }
      >
        <LogOut size={compact ? 18 : 20} aria-hidden="true" />
        <span>Sign Out</span>
      </button>
    </form>
  );
}
