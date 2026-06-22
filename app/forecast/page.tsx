import { PageHeader } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { listCampaigns } from "@/lib/data/campaigns";
import { listTargets } from "@/lib/data/targets";
import { ForecastClient } from "./forecast-client";

export const dynamic = "force-dynamic";

// Pipeline & Forecast vs Objetivos — PRD §9 (5).
export default async function ForecastPage() {
  const [campaigns, targets] = await Promise.all([listCampaigns(), listTargets()]);
  return (
    <div>
      <PageHeader
        title="Pipeline & Forecast vs Objetivos"
        subtitle="Edita los OBJETIVOS por canal/mes/país. El Spend real y el Pipeline real se calculan de los datos reales (Ads/HubSpot) y no son editables."
      />
      <StatusBanner />
      <ForecastClient initialTargets={targets} campaigns={campaigns} />
    </div>
  );
}
