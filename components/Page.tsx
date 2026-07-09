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
        <span className="mb-2 inline-block rounded bg-[var(--subtle)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">
          Preview · Roadmap {phase}
        </span>
      )}
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">{subtitle}</p>
    </div>
  );
}

// Banner para pantallas en pausa de negocio. La sección se mantiene
// accesible (modelo de datos, código, queries) pero se avisa al usuario
// de que no está activa.
export function OnHoldBanner({ area }: { area: string }) {
  return (
    <div className="mb-6 rounded-lg border border-[var(--warn-border)] bg-[var(--warn-bg)] px-4 py-3 text-sm text-[var(--warn-text)]">
      <strong className="uppercase tracking-wide">On hold</strong> · {area} está en pausa
      por decisión de negocio. La pantalla y el modelo de datos siguen
      funcionando para futuras iteraciones, pero el equipo no está priorizando
      esta área ahora mismo.
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
    <div className="card p-5">
      {title && (
        <div className="mb-3 text-xs uppercase tracking-wide text-[var(--muted)]">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}
