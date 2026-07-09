import { PageHeader } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { listCampaigns } from "@/lib/data/campaigns";
import { listCountryOverrides } from "@/lib/data/overrides";
import { listCountryGroups } from "@/lib/data/regions";
import { ExplorerClient } from "./explorer-client";

export const dynamic = "force-dynamic";

// Explorer / Desglose libre — PRD §9 (6).
export default async function ExplorerPage() {
  const [campaigns, overrides, groups] = await Promise.all([
    listCampaigns(),
    listCountryOverrides(),
    listCountryGroups(),
  ]);
  return (
    <div>
      <PageHeader
        title="Explorer / Desglose libre (pivot)"
        subtitle="Pivota por Canal / País / Campaña / Mes. Revisa y corrige las campañas sin país; los overrides se persisten en Supabase."
      />
      <StatusBanner />
      <ExplorerClient campaigns={campaigns} groups={groups} overrides={overrides} />
    </div>
  );
}
