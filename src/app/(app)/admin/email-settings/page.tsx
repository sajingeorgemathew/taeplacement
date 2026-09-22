import EmailSettingsAdmin from "@/components/admin/EmailSettingsAdmin";
import BackLink from "@/components/ui/BackLink";
import { getStaffSession, isAdmin } from "@/lib/auth/session";
import { getPlacementEmailSettings } from "@/lib/documents/email-settings-queries";

export const metadata = {
  title: "Email Settings",
};

/**
 * Academy-wide settings for placement document emails.
 *
 * Read by every active staff member, changed only by an admin. Saving here is
 * a configuration change: it never sends an email.
 */
export default async function AdminEmailSettingsPage() {
  const [settings, session] = await Promise.all([
    getPlacementEmailSettings(),
    getStaffSession(),
  ]);

  return (
    <>
      <BackLink href="/admin" label="Back to Admin" />

      <div className="mb-10">
        <h1 className="text-[36px] font-semibold leading-tight tracking-tight text-ink sm:text-[40px]">
          Email Settings
        </h1>
        <p className="mt-3 max-w-2xl text-[18px] text-ink-muted">
          The common opening message for placement document emails. Use it for
          temporary, student-facing operational notices.
        </p>
      </div>

      <EmailSettingsAdmin settings={settings} canManage={isAdmin(session)} />
    </>
  );
}
