import { PageHeader } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { listCampaigns } from "@/lib/data/campaigns";
import { listCampaignTags } from "@/lib/data/campaign-tags";
import { CampaignDetailClient } from "./campaign-client";

// Campaign Detail — PRD §9 (4).
const DEFAULT_TAGS: Record<string, string[]> = {
  "wb_taller-doble-materialidad": ["Webinar"],
  "alcance-3-con-ia": ["Webinar", "AEO"],
  "esp_mensaje_españa_documento [mofu]": ["MOFU"],
};

export default async function CampaignDetailPage() {
  const [campaigns, dbTags] = await Promise.all([listCampaigns(), listCampaignTags()]);
  // Si Supabase aún no tiene tags, sembramos los del prototipo para que la
  // pantalla muestre algo.
  const tags = Object.keys(dbTags).length === 0 ? DEFAULT_TAGS : dbTags;
  return (
    <div>
      <PageHeader
        title="Campaign Detail"
        subtitle="Detalle por campaña + rollup por etiquetas (p.ej. 'Webinar') para seguir resultados de un conjunto de campañas."
      />
      <StatusBanner />
      <CampaignDetailClient campaigns={campaigns} tags={tags} />
    </div>
  );
}
