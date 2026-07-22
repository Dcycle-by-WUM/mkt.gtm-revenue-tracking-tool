import { PageHeader } from "@/components/Page";
import { listCampaigns } from "@/lib/data/campaigns";
import { listCountryGroups } from "@/lib/data/regions";
import { listTargets } from "@/lib/data/targets";
import { OverviewClient } from "./overview-client";

// Renderizar en runtime: si fuera estático, los flags de `integrations` se
// hornean al build y un cambio de env vars no se refleja hasta el siguiente
// build. Con datos en Supabase queremos que los KPIs sean siempre frescos.
export const dynamic = "force-dynamic";

// Overview "Cómo vamos vs Target" — PRD §9 (2). Server Component que delega
// los datos (Supabase si vivo, mock si no) y los pasa al Client interactivo.
// El funnel completo por canal/país se movió a /metrics.
export default async function OverviewPage() {
  const [campaigns, groups, targets] = await Promise.all([
    listCampaigns(),
    listCountryGroups(),
    listTargets(),
  ]);
  return (
    <div>
      <PageHeader
        title="Overview — Cómo vamos vs Target"
        subtitle="Objetivo vs resultado por mes: Spain, Rest of Intl + DACH y Total. El mes en curso se proyecta a fin de mes; los cerrados muestran el real consolidado."
      />
      <OverviewClient campaigns={campaigns} targets={targets} groups={groups} />
    </div>
  );
}
