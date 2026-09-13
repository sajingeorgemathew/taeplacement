import {
  Building2,
  CalendarClock,
  ClipboardList,
  PhoneCall,
  UserCheck,
  Users,
} from "lucide-react";

import PageHeader from "@/components/ui/PageHeader";
import QuickAccessCard from "@/components/ui/QuickAccessCard";
import StatCard from "@/components/ui/StatCard";
import { getDashboardSummary } from "@/lib/dashboard/queries";

export const metadata = {
  title: "Placement Dashboard",
};

const quickAccess = [
  {
    title: "Students",
    description: "View students, batches, and placement readiness.",
    href: "/students",
    icon: Users,
  },
  {
    title: "Placement Partners",
    description: "View LTCs and other placement partner accounts.",
    href: "/placement-partners",
    icon: Building2,
  },
  {
    title: "Placement Board",
    description: "Manage students through the placement process.",
    href: "/placement",
    icon: ClipboardList,
  },
];

export default async function DashboardPage() {
  const summary = await getDashboardSummary();

  return (
    <>
      <PageHeader
        title="Placement Dashboard"
        description="A simple view of placement operations and what needs attention."
      />

      <section aria-labelledby="summary-heading" className="mb-12">
        <h2 id="summary-heading" className="sr-only">
          Summary
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Ready for Placement"
            value={summary.readyForPlacement}
            tone="ready"
            icon={UserCheck}
            href="/placement"
          />
          <StatCard
            label="Awaiting Start"
            value={summary.awaitingStart}
            tone="info"
            icon={CalendarClock}
            href="/placement"
          />
          <StatCard
            label="On Placement"
            value={summary.onPlacement}
            tone="info"
            icon={ClipboardList}
            href="/placement"
          />
          <StatCard
            label="Partner Follow-ups Due"
            value={summary.followUpsDue}
            tone="attention"
            icon={PhoneCall}
            href="/placement-partners"
          />
        </div>
      </section>

      <section aria-labelledby="quick-access-heading" className="mb-12">
        <h2
          id="quick-access-heading"
          className="mb-5 text-[22px] font-semibold tracking-tight text-ink"
        >
          Quick Access
        </h2>
        <div className="grid gap-5">
          {quickAccess.map((item) => (
            <QuickAccessCard
              key={item.href}
              title={item.title}
              description={item.description}
              href={item.href}
              icon={item.icon}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="needs-attention-heading">
        <h2
          id="needs-attention-heading"
          className="mb-5 text-[22px] font-semibold tracking-tight text-ink"
        >
          Needs Attention
        </h2>
        <div className="rounded-2xl border border-line bg-surface p-8">
          <p className="text-[17px] text-ink-muted">
            Important placement tasks and follow-ups will appear here.
          </p>
        </div>
      </section>
    </>
  );
}
