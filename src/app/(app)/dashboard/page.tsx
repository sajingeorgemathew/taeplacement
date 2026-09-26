import { Building2, ClipboardList, PhoneCall, Users } from "lucide-react";
import Link from "next/link";

import ProgramOperationsCard from "@/components/dashboard/ProgramOperationsCard";
import PageHeader from "@/components/ui/PageHeader";
import QuickAccessCard from "@/components/ui/QuickAccessCard";
import StatCard from "@/components/ui/StatCard";
import {
  getPartnerFollowUpsDue,
  getProgramOperationsSummary,
} from "@/lib/dashboard/queries";
import { PROGRAM_OPTIONS } from "@/lib/placement/constants";

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

/**
 * Program-first Placement Operations.
 *
 * The page leads with one card per program, PSW and ECEA, each scoped to the
 * batches staff have switched on in Batch Management. Older batches stay in
 * the database and stay browsable from Students and Placement; they are just
 * not counted here, because they are not today's work.
 */
export default async function DashboardPage() {
  const [programs, followUpsDue] = await Promise.all([
    getProgramOperationsSummary(),
    getPartnerFollowUpsDue(),
  ]);

  return (
    <>
      <PageHeader
        title="Placement Dashboard"
        description="Current placement operations by program. Counts include only students in batches that are tracked in Placement Operations."
      />

      <section aria-labelledby="operations-heading" className="mb-12">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
          <h2
            id="operations-heading"
            className="text-[22px] font-semibold tracking-tight text-ink"
          >
            Placement Operations
          </h2>
          <Link
            href="/admin/batches"
            className="text-[15px] font-medium text-brand-strong hover:underline"
          >
            Choose which batches are tracked
          </Link>
        </div>
        <div className="grid gap-6">
          {PROGRAM_OPTIONS.map((program) => (
            <ProgramOperationsCard key={program} summary={programs[program]} />
          ))}
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

      {/*
        Partner follow-ups are the one piece of "needs attention" data that
        already exists. It keeps its place here, secondary to the program
        summary; the student follow-up system is a later ticket.
      */}
      <section aria-labelledby="needs-attention-heading">
        <h2
          id="needs-attention-heading"
          className="mb-5 text-[22px] font-semibold tracking-tight text-ink"
        >
          Needs Attention
        </h2>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Partner Follow-ups Due"
            value={followUpsDue}
            tone="attention"
            icon={PhoneCall}
            href="/placement-partners"
          />
        </div>
      </section>
    </>
  );
}
