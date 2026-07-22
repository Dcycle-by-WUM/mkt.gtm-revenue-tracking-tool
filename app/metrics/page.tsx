import { PageHeader } from "@/components/Page";
import { listCampaigns } from "@/lib/data/campaigns";
import { listCountryGroups } from "@/lib/data/regions";
import { MetricsClient } from "./metrics-client";

// Renderizar en runtime: si fuera estático, los flags de `integrations` se
// hornean al build y un cambio de env vars no se refleja hasta el siguiente
// build. Con datos en Supabase queremos que los KPIs sean siempre frescos.
export const dynamic = "force-dynamic";

// MKTG Metrics y Spend por Canal y País — antes vivía en Overview; se movió
// aquí para dejar Overview centrado en "cómo vamos vs target" (PRD §9 (2)).
export default async function MetricsPage() {
  const [initial, groups] = await Promise.all([listCampaigns(), listCountryGroups()]);
  return (
    <div>
      <PageHeader
        title="MKTG Metrics y Spend por Canal y País"
        subtitle="Funnel unificado paid + orgánico. Filtra por región/país/mes y baja al detalle con la tabla dinámica."
      />
      <MetricsClient initial={initial} groups={groups} />
    </div>
  );
}
