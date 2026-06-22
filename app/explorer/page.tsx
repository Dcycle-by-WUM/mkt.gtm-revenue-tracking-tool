import { PageHeader } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { listCampaigns } from "@/lib/data/campaigns";
import { listCountryOverrides } from "@/lib/data/overrides";
import { ExplorerClient } from "./explorer-client";

export const dynamic = "force-dynamic";

// Explorer / Desglose libre — PRD §9 (6).
export default async function ExplorerPage() {
  const [campaigns, overrides] = await Promise.all([
    listCampaigns(),
    listCountryOverrides(),
  ]);
  return (
    <div>
      <PageHeader
        title="Explorer / Desglose libre (pivot)"
        subtitle="Pivota por Canal / País / Campaña / Mes. Revisa y corrige las campañas sin país; los overrides se persisten en Supabase."
      />
      <StatusBanner />
      <ExplorerClient campaigns={campaigns} overrides={overrides} />
    </div>
  );
}
