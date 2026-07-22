import { PageHeader } from "@/components/Page";
import { listCampaigns } from "@/lib/data/campaigns";
import { listCountryGroups } from "@/lib/data/regions";
import { OverviewClient } from "./overview-client";

// Renderizar en runtime: si fuera estático, los flags de `integrations` se
// hornean al build y un cambio de env vars no se refleja hasta el siguiente
// build. Con datos en Supabase queremos que los KPIs sean siempre frescos.
export const dynamic = "force-dynamic";

// Overview "Cómo vamos" — PRD §9 (2). Server Component que delega los datos
// (Supabase si vivo, mock si no) y los pasa al Client interactivo.
export default async function OverviewPage() {
  const [initial, groups] = await Promise.all([listCampaigns(), listCountryGroups()]);
  return (
    <div>
      <PageHeader
        title="Overview — Cómo vamos"
        subtitle="Funnel unificado paid + orgánico. Filtra por región/país/mes y baja al detalle con la tabla dinámica."
      />
      <OverviewClient initial={initial} groups={groups} />
    </div>
  );
}
