/** Shared empty state for modules that are planned but not built yet. */
export default function ModulePlaceholder({ note }: { note: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-8">
      <p className="text-[17px] text-ink-muted">{note}</p>
      <p className="mt-4 text-[16px] text-ink-muted">
        This module will be built in a later ticket.
      </p>
    </div>
  );
}
