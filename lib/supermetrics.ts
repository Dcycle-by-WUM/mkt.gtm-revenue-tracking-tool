// Ingesta de paid vía Supermetrics API — Brief §5.
// LinkedIn Ads (LIA) y Google Ads (AW) están AUTENTICADOS en Supermetrics;
// este módulo se activa cuando SUPERMETRICS_API_KEY esté en el entorno.
//
// Invariante crítico (§7.3): para LinkedIn, el país se deriva del
// `campaignGroupName` (grupo), NUNCA del `campaignName`.

const SUPERMETRICS_ENDPOINT = "https://api.supermetrics.com/enterprise/v2/query/data/json";

export type PaidSpendRow = {
  source: "LinkedIn" | "Google";
  platformCampaignId: string;
  campaignGroupName: string | null; // solo LinkedIn; base para el país
  campaignName: string;
  date: string; // YYYY-MM-DD
  spend: number;
  currency: string;
  impressions: number;
  clicks: number;
};

// Campos por fuente, según el brief §5.
const FIELDS = {
  LinkedIn: ["date", "campaignGroupName", "campaignName", "spend", "impressions", "clicks"],
  // Google Ads: asset_level=Campaign + dimensión día.
  Google: ["date", "campaign", "cost", "impressions", "clicks"],
} as const;

function requireKey(): string {
  const key = process.env.SUPERMETRICS_API_KEY;
  if (!key) {
    throw new Error(
      "SUPERMETRICS_API_KEY no configurada. Añádela en el env de Netlify (team Dcycle).",
    );
  }
  return key;
}

/**
 * Lee spend por día × campaña de Supermetrics.
 * Esqueleto: cuando llegue el token se completa el mapeo del payload real
 * (data_source ids LIA/AW) y la paginación. Idempotente aguas abajo por
 * `(source, platform_campaign_id, date)` (§5).
 */
export async function fetchPaidSpend(params: {
  source: "LinkedIn" | "Google";
  startDate: string;
  endDate: string;
}): Promise<PaidSpendRow[]> {
  const apiKey = requireKey();
  const body = {
    ds_id: params.source === "LinkedIn" ? "LIA" : "AW",
    fields: FIELDS[params.source],
    start_date: params.startDate,
    end_date: params.endDate,
    api_key: apiKey,
  };

  const res = await fetch(SUPERMETRICS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Supermetrics ${params.source} error ${res.status}: ${await res.text()}`);
  }

  // TODO: mapear res.data al shape PaidSpendRow una vez validado field_discovery.
  return [];
}
