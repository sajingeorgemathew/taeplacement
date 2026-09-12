import SignOutButton from "@/components/auth/SignOutButton";
import AppShell from "@/components/layout/AppShell";
import { requireActiveStaff, staffDisplayName } from "@/lib/auth/session";

/**
 * Staff pages read live student data for the signed in user, so nothing in this
 * group is ever prerendered or shared between people.
 */
export const dynamic = "force-dynamic";

/**
 * Every route in this group is staff only. The session is checked here on the
 * server, src/proxy.ts redirects signed out visitors, and Row Level Security
 * blocks anything that gets past both.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireActiveStaff();

  return (
    <AppShell
      staffName={staffDisplayName(session)}
      signOut={<SignOutButton compact />}
    >
      {children}
    </AppShell>
  );
}
