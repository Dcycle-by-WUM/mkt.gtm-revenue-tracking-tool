export function PageHeader({
  title,
  subtitle,
  phase,
}: {
  title: string;
  subtitle: string;
  phase?: string;
}) {
  return (
    <div className="mb-6">
      {phase && (
        <span className="mb-2 inline-block rounded bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
          Preview · Roadmap {phase}
        </span>
      )}
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">{subtitle}</p>
    </div>
  );
}

export function Panel({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
      {title && (
        <div className="mb-3 text-xs uppercase tracking-wide text-[var(--muted)]">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
