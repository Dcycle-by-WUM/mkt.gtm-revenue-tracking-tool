import { PageHeader } from "@/components/Page";
import { listCampaigns } from "@/lib/data/campaigns";
import { listNotes } from "@/lib/data/notes";
import { listCountryGroups } from "@/lib/data/regions";
import { PaidClient } from "./paid-client";

export const dynamic = "force-dynamic";

// Paid Media Performance — PRD §9 (3).
export default async function PaidPage() {
  const [initial, notes, groups] = await Promise.all([listCampaigns(), listNotes("campaign"), listCountryGroups()]);
  return (
    <div>
      <PageHeader
        title="Paid Media Performance"
        subtitle="Canal × campaña con todas las métricas (§8.4). Filtra por país/mes/canal y deja una nota por campaña."
      />
      <PaidClient initial={initial} groups={groups} notes={notes} />
    </div>
  );
}
