import { redirect } from "next/navigation";

import SignOutButton from "@/components/auth/SignOutButton";
import { getStaffSession, isActiveStaff } from "@/lib/auth/session";

export const metadata = {
  title: "Account Pending",
};

/**
 * Shown when a staff member can sign in but has not been activated yet.
 * Their account cannot read any student information until an admin activates it.
 */
export default async function AccountPendingPage() {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (isActiveStaff(session)) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-lg rounded-3xl border border-line bg-surface p-8 sm:p-10">
        <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-ink">
          Account not active yet
        </h1>
        <p className="mt-4 text-[17px] text-ink-muted">
          You are signed in as {session.email ?? "this account"}, but an admin
          has not activated staff access yet. Student information stays hidden
          until that happens.
        </p>
        <div className="mt-8">
          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
