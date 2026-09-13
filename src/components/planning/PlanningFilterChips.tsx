import Link from "next/link";

/**
 * The filter row inside an Area drill-down.
 *
 * Plain links rather than client state, so the chosen filter is in the URL like
 * every other view in the application: shareable, bookmarkable, and correct
 * after a reload. Each chip carries its own count, so a planner can see that a
 * filter is empty before clicking it.
 *
 * A chip with a count of zero is still shown, greyed but present. Hiding it
 * would make "no Unknown partners here" indistinguishable from "this filter
 * does not exist".
 */
export type PlanningChip = {
  key: string;
  label: string;
  count: number;
  href: string;
  active: boolean;
};

export default function PlanningFilterChips({
  legend,
  chips,
}: {
  legend: string;
  chips: PlanningChip[];
}) {
  return (
    <div role="group" aria-label={legend} className="flex flex-wrap gap-3">
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          aria-current={chip.active ? "true" : undefined}
          className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-3 text-[16px] font-medium transition-colors ${
            chip.active
              ? "border-brand bg-brand text-white"
              : chip.count === 0
                ? "border-line bg-surface text-ink-muted hover:border-brand hover:text-brand-strong"
                : "border-line bg-surface text-ink hover:border-brand hover:bg-brand-soft hover:text-brand-strong"
          }`}
        >
          {chip.label}
          <span
            className={`rounded-full px-2.5 py-0.5 text-[14px] font-semibold ${
              chip.active ? "bg-white/20 text-white" : "bg-surface-muted text-ink-muted"
            }`}
          >
            {chip.count}
          </span>
        </Link>
      ))}
    </div>
  );
}
