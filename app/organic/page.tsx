import { PageHeader } from "@/components/Page";
import {
  listOrganicTraffic, listAiVisibility, getDomainAuthority, listKeywordRankings, listOrganicLeads,
} from "@/lib/data/organic";
import { OrganicClient } from "./organic-client";

export const dynamic = "force-dynamic";

// Orgánico (SEO) + AEO — PRD §11. Motor AEO prioritario: Microsoft Copilot —
// la mayoría de clientes Dcycle lo usan, y Copilot se nutre del índice de
// Bing (de ahí que el bloque Bing WMT sea salud técnica de indexación).
export default async function OrganicPage() {
  const [traffic, aiVisibility, domainAuthority, keywordRankings, leads] = await Promise.all([
    listOrganicTraffic(),
    listAiVisibility(),
    getDomainAuthority(),
    listKeywordRankings(),
    listOrganicLeads(),
  ]);

  return (
    <div>
      <PageHeader
        title="Orgánico (SEO) + AEO"
        subtitle="SEO non-branded conectado hasta pipeline € y deals, y AEO por motor con Copilot como prioridad (mayoría de clientes lo usan; se nutre del índice de Bing)."
      />
      <p className="mb-6 rounded border border-[var(--warn-border)] bg-[var(--warn-bg)] px-3 py-2 text-xs text-[var(--warn-text)]">
        Fuentes externas (DA: Moz/Ahrefs/Semrush · AI-visibility: Profound/Peec/Otterly/Semrush AI) están &quot;on
        hold&quot; en <code>docs/DECISIONES.md</code> — el proveedor final debe soportar Copilot explícitamente.
        El modelo y las pantallas ya están en su sitio: se enchufan en cuanto se decida la herramienta.
      </p>
      <OrganicClient
        traffic={traffic}
        aiVisibility={aiVisibility}
        domainAuthority={domainAuthority}
        keywordRankings={keywordRankings}
        leads={leads}
      />
    </div>
  );
}
