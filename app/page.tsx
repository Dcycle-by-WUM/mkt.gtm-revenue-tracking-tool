import { PageHeader } from "@/components/Page";
import { listCampaigns } from "@/lib/data/campaigns";
import { listCountryGroups } from "@/lib/data/regions";
import { listTargets } from "@/lib/data/targets";
import { listDealAttribution } from "@/lib/data/deals";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

// Dashboard inicial — vista de un vistazo (rediseño jul-2026). Resume inversión,
// pipeline, ROI y embudo del mes/YTD y enlaza al detalle. Los datos vienen de la
// capa `lib/data/*` (Supabase si vivo, mock si no). Trae también deals para los
// módulos que incorporan métricas de otras secciones.
export default async function DashboardPage() {
  const [campaigns, , targets, deals] = await Promise.all([
    listCampaigns(),
    listCountryGroups(),
    listTargets(),
    listDealAttribution(),
  ]);
  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Cómo va el motor GTM de un vistazo: inversión paid, pipeline generado, ROI y embudo — con el detalle a un clic. Arrastra los módulos para reordenarlos."
      />
      <DashboardClient campaigns={campaigns} targets={targets} deals={deals} />
    </div>
  );
}
