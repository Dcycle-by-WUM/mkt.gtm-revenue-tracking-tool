import { PageHeader } from "@/components/Page";
import { listCampaigns } from "@/lib/data/campaigns";
import { listCountryGroups } from "@/lib/data/regions";
import { listTargets } from "@/lib/data/targets";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

// Dashboard inicial — vista de un vistazo (rediseño jul-2026). Resume inversión,
// pipeline, ROI y embudo del mes/YTD y enlaza al detalle. Los datos vienen de la
// capa `lib/data/*` (Supabase si vivo, mock si no).
export default async function DashboardPage() {
  const [campaigns, , targets] = await Promise.all([
    listCampaigns(),
    listCountryGroups(),
    listTargets(),
  ]);
  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Cómo va el motor GTM de un vistazo: inversión paid, pipeline generado, ROI y embudo — con el detalle a un clic."
      />
      <DashboardClient campaigns={campaigns} targets={targets} />
    </div>
  );
}
