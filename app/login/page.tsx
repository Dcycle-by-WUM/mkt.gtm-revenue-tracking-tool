import Link from "next/link";

// Login stub — PRD §9 (1). El SSO Google Workspace se enchufa cuando estén
// los OAuth credentials (DECISIONES.md). Mientras tanto, acceso abierto desde
// cualquier pantalla; esta página queda como placeholder informativo.
export default function LoginPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--panel)] p-8">
        <h1 className="mb-2 text-2xl font-semibold">Entra a Dcycle · GTM</h1>
        <p className="mb-6 text-sm text-[var(--muted)]">
          Acceso por SSO de <strong>Google Workspace</strong> (dominio <code>@dcycle.io</code>).
          El SSO se enchufará en cuanto entren los credenciales OAuth.
        </p>

        <button
          disabled
          className="mb-4 w-full rounded-md border border-[var(--border)] bg-white/5 px-4 py-2 text-sm text-[var(--muted)] cursor-not-allowed"
          title="Pendiente de credenciales OAuth"
        >
          <span className="mr-2">🔒</span> Entrar con Google (próximamente)
        </button>

        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          Mientras tanto el acceso es <strong>abierto full-admin</strong> para que el
          equipo pueda revisar la app. Cuando se active el SSO, los roles
          (admin/marketing/sdr/solo-lectura) se aplican vía RLS de Supabase.
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-[var(--accent)] underline">
            Entrar al dashboard →
          </Link>
        </div>
      </div>
    </div>
  );
}
