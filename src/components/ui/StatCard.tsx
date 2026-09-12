type StatCardProps = {
  label: string;
  /** Placeholder until real placement data exists. */
  value: string;
};

/** Large, easy to scan summary number. */
export default function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-7">
      <p className="text-[17px] font-medium text-ink-muted">{label}</p>
      <p className="mt-3 text-[40px] font-semibold leading-none text-ink">
        {value}
      </p>
    </div>
  );
}
