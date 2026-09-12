type PageHeaderProps = {
  title: string;
  description?: string;
};

/** Large page title and one short line of plain-language context. */
export default function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="mb-10">
      <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-ink sm:text-[34px]">
        {title}
      </h1>
      {description ? (
        <p className="mt-3 max-w-2xl text-[17px] text-ink-muted">{description}</p>
      ) : null}
    </div>
  );
}
