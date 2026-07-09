import { PageHeader } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { listDealAttribution } from "@/lib/data/deals";
import { DealsClient } from "./deals-client";

export const dynamic = "force-dynamic";

// Deals & Atribución — grano deal (vista `deal_attribution`, migración 0014).
// Responde: ¿qué deals concretos componen el pipeline del mes, de qué
// canal/campaña/país vienen, y cuáles nacen de leads captados en 2026 vs
// contactos históricos?
export default async function DealsPage() {
  const deals = await listDealAttribution();
  return (
    <div>
      <PageHeader
        title="Deals & Atribución"
        subtitle="Cada deal (fuente ≠ Offline) con su canal, campaña, país y la cohorte del contacto que lo originó. El pipeline agregado del Overview sale de estas mismas filas."
      />
      <StatusBanner />
      <DealsClient initial={deals} />
    </div>
  );
}
