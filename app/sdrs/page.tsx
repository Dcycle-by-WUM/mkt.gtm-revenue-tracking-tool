import { PageHeader } from "@/components/Page";
import { listSdrCalls } from "@/lib/data/sdr-calls";
import { listPipelineTotals } from "@/lib/data/pipeline-totals";
import { SdrsClient } from "./sdrs-client";

// Renderizar en runtime: los datos viven en Supabase (o mock) y queremos que
// las llamadas y el pipe sean siempre frescos (mismo criterio que /overview).
export const dynamic = "force-dynamic";

// SDRs Overview — actividad (llamadas) por comercial y mes vs. pipeline abierto
// por mes. Dos series independientes en paralelo: NO se atribuye pipe por
// comercial (los deals los llevan los AE, que no llaman). Objetivo del equipo:
// menos llamadas, más pipe.
export default async function SdrsPage() {
  const [sdr, pipelineTotals] = await Promise.all([listSdrCalls(), listPipelineTotals()]);
  return (
    <div>
      <PageHeader
        title="SDRs Overview"
        subtitle="Llamadas por comercial y mes frente al pipeline de new business abierto cada mes. Dos series en paralelo (el pipe no se atribuye por comercial); el bloque del dialer sin owner va aparte."
      />
      <SdrsClient sdr={sdr} pipelineTotals={pipelineTotals} />
    </div>
  );
}
