import { Columns3, List, Map } from "lucide-react";
import Link from "next/link";

/**
 * The three views of the Placement module.
 *
 *   Board           the working columns, PLACEMENT-04
 *   Batch Planning  where a batch's students are, geographically, PLACEMENT-05A
 *   List            the searchable list, PLACEMENT-04
 *
 * Batch Planning lives at its own route because it asks a different question
 * and reads a different working set, but it is the same module: the switch is
 * rendered identically on both routes so moving between them never feels like
 * leaving Placement.
 */
export type PlacementView = "board" | "planning" | "list";

const BASE =
  "inline-flex items-center gap-2 rounded-2xl px-6 py-4 text-[17px] font-semibold transition-colors";
const ON = "bg-brand text-white";
const OFF =
  "border border-line bg-surface text-ink hover:border-brand hover:bg-brand-soft hover:text-brand-strong";

export default function PlacementViewSwitch({
  current,
  boardHref,
  planningHref,
  listHref,
}: {
  current: PlacementView;
  boardHref: string;
  planningHref: string;
  listHref: string;
}) {
  const items = [
    { view: "board" as const, href: boardHref, label: "Board", icon: Columns3 },
    {
      view: "planning" as const,
      href: planningHref,
      label: "Batch Planning",
      icon: Map,
    },
    { view: "list" as const, href: listHref, label: "List", icon: List },
  ];

  return (
    <div
      role="group"
      aria-label="Choose how to view placement"
      className="flex flex-wrap gap-3"
    >
      {items.map(({ view, href, label, icon: Icon }) => (
        <Link
          key={view}
          href={href}
          aria-current={current === view ? "true" : undefined}
          className={`${BASE} ${current === view ? ON : OFF}`}
        >
          <Icon size={22} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </div>
  );
}
