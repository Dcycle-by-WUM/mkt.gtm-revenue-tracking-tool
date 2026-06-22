import { PageHeader } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { listCampaigns } from "@/lib/data/campaigns";
import { OverviewClient } from "./overview-client";

// Overview "Cómo vamos" — PRD §9 (2). Server Component que delega los datos
// (Supabase si vivo, mock si no) y los pasa al Client interactivo.
export default async function OverviewPage() {
  const initial = await listCampaigns();
  return (
    <div>
      <PageHeader
        title="Overview — Cómo vamos"
        subtitle="Funnel paid unificado. Filtra por país/mes y monta tablas dinámicas que se recalculan solas."
      />
      <StatusBanner />
      <OverviewClient initial={initial} />
    </div>
  );
}
