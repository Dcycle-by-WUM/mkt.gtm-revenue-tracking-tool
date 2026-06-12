// Placeholder para pantallas de fases posteriores del roadmap (§11).
export function PhaseStub({
  title,
  phase,
  description,
}: {
  title: string;
  phase: string;
  description: string;
}) {
  return (
    <div>
      <div className="mb-2 inline-block rounded bg-white/10 px-2 py-1 text-xs text-[var(--muted)]">
        Roadmap {phase}
      </div>
      <h1 className="mb-2 text-2xl font-semibold">{title}</h1>
      <p className="max-w-2xl text-sm text-[var(--muted)]">{description}</p>
      <div className="mt-6 rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
        Pantalla planificada. Se implementa en la fase {phase} del roadmap.
      </div>
    </div>
  );
}
