import { PageHeader } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { listCampaigns } from "@/lib/data/campaigns";
import { listNotes } from "@/lib/data/notes";
import { PaidClient } from "./paid-client";

// Paid Media Performance — PRD §9 (3).
export default async function PaidPage() {
  const [initial, notes] = await Promise.all([listCampaigns(), listNotes("campaign")]);
  return (
    <div>
      <PageHeader
        title="Paid Media Performance"
        subtitle="Canal × campaña con todas las métricas (§8.4). Filtra por país/mes/canal y deja una nota por campaña."
      />
      <StatusBanner />
      <PaidClient initial={initial} notes={notes} />
    </div>
  );
}
