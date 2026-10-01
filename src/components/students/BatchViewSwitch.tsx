import { LayoutList, Table2 } from "lucide-react";
import Link from "next/link";

import type { BatchView } from "@/lib/documents/batch-grid";

/**
 * The two views of one batch. PLACEMENT-07B.1.
 *
 *   Document Grid   one student per row, one active requirement per column.
 *                   The default.
 *   Student Cards   the original StudentList, unchanged.
 *
 * Both are the same batch page with ?view= in the URL, so the search and
 * every filter carry across.
 */
const BASE =
  "inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-[16px] font-semibold transition-colors";
const ON = "bg-brand text-white";
const OFF =
  "border border-line bg-surface text-ink hover:border-brand hover:bg-brand-soft hover:text-brand-strong";

export default function BatchViewSwitch({
  current,
  gridHref,
  cardsHref,
}: {
  current: BatchView;
  gridHref: string;
  cardsHref: string;
}) {
  const items = [
    { view: "grid" as const, href: gridHref, label: "Document Grid", icon: Table2 },
    {
      view: "cards" as const,
      href: cardsHref,
      label: "Student Cards",
      icon: LayoutList,
    },
  ];

  return (
    <div
      role="group"
      aria-label="Choose how to view this batch"
      className="flex flex-wrap gap-3"
    >
      {items.map(({ view, href, label, icon: Icon }) => (
        <Link
          key={view}
          href={href}
          aria-current={current === view ? "true" : undefined}
          className={`${BASE} ${current === view ? ON : OFF}`}
        >
          <Icon size={20} aria-hidden="true" />
          {label}
        </Link>
      ))}
    </div>
  );
}
