import { PageHeader, OnHoldBanner } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { listAccounts } from "@/lib/data/accounts";
import { listNotes } from "@/lib/data/notes";
import { AccountsClient } from "./accounts-client";

export const dynamic = "force-dynamic";

// ABM — Cuentas — PRD §9 (7).
export default async function AbmAccountsPage() {
  const [accounts, notes] = await Promise.all([listAccounts(), listNotes("account")]);
  return (
    <div>
      <PageHeader
        title="ABM — Cuentas"
        subtitle="Cuentas-objetivo con Heat Score, SDR e impacto de ads. Edita objetivo ABM, SDR y notas."
      />
      <OnHoldBanner area="ABM" />
      <StatusBanner />
      <AccountsClient initial={accounts} notes={notes} />
    </div>
  );
}
