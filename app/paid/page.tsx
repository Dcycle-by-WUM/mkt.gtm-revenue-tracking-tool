import { PageHeader } from "@/components/Page";
import { listCampaigns } from "@/lib/data/campaigns";
import { listCampaignTags } from "@/lib/data/campaign-tags";
import { listCountryGroups } from "@/lib/data/regions";
import { PaidClient } from "./paid-client";

export const dynamic = "force-dynamic";

// Detalle por Campaña/Canal — PRD §9 (3). Antes "Paid Media Performance";
// absorbe también el etiquetado por campaña que vivía en Campaign Detail
// (§9 (4), eliminado: sus gráficos usaban datos de ejemplo fijos, no la
// campaña seleccionada).
const DEFAULT_TAGS: Record<string, string[]> = {
  "wb_taller-doble-materialidad": ["Webinar"],
  "alcance-3-con-ia": ["Webinar", "AEO"],
  "esp_mensaje_españa_documento [mofu]": ["MOFU"],
};

export default async function PaidPage() {
  const [initial, groups, dbTags] = await Promise.all([
    listCampaigns(),
    listCountryGroups(),
    listCampaignTags(),
  ]);
  // Si Supabase aún no tiene tags, sembramos los del prototipo para que la
  // pantalla muestre algo.
  const tags = Object.keys(dbTags).length === 0 ? DEFAULT_TAGS : dbTags;
  return (
    <div>
      <PageHeader
        title="Detalle por Campaña o Canal"
        subtitle="Canal × campaña con todas las métricas (§8.4). Filtra por país/mes/canal y etiqueta campañas (p.ej. 'Webinar', 'MOFU') para agrupar resultados."
      />
      <PaidClient initial={initial} groups={groups} tags={tags} />
    </div>
  );
}
