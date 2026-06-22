// Ingesta de paid vía Supermetrics API — PRD §5/§6.
// LinkedIn Ads (LIA) y Google Ads (AW) están AUTENTICADOS en Supermetrics;
// este módulo arranca en cuanto SUPERMETRICS_API_KEY esté en el entorno.
//
// Invariante crítico (§8.2): para LinkedIn, el país se deriva del
// `campaignGroupName` (grupo), NUNCA del `campaignName`.
//
// El mapeo del payload sigue el formato JSON de Supermetrics
// (response.data → array de filas, cada una con los campos pedidos en `fields`).

const SUPERMETRICS_ENDPOINT =
  "https://api.supermetrics.com/enterprise/v2/query/data/json";

export type PaidSpendRow = {
  source: "LinkedIn" | "Google";
  platformCampaignId: string;
  campaignGroupName: string | null;          // solo LinkedIn; base para el país
  campaignName: string;
  date: string;                              // YYYY-MM-DD
  spend: number;
  currency: string;
  impressions: number;
  clicks: number;
};

// Campos por fuente — PRD §6.1.
// LinkedIn requiere `campaignGroupName` (regla de oro). Si Supermetrics no lo
// expone, hay que ir a la LinkedIn Marketing API directa.
const LIA_FIELDS = [
  "date",
  "campaign_id",
  "campaign_group_name",
  "campaign_name",
  "spend",
  "impressions",
  "clicks",
];
const AW_FIELDS = [
  "date",
  "campaign_id",
  "campaign",
  "cost",
  "impressions",
  "clicks",
];

function requireKey(): string {
  const key = process.env.SUPERMETRICS_API_KEY;
  if (!key) {
    throw new Error(
      "SUPERMETRICS_API_KEY no configurada. Añádela en el env de Netlify (team Dcycle).",
    );
  }
  return key;
}

function requireTeam(): string {
  const team = process.env.SUPERMETRICS_TEAM_ID;
  if (!team) {
    throw new Error(
      "SUPERMETRICS_TEAM_ID no configurada. Añádela en el env de Netlify (team Dcycle).",
    );
  }
  return team;
}

type SmRow = Record<string, unknown>;

// Mapea defensivamente una fila del JSON de Supermetrics al shape interno.
function mapRow(source: "LinkedIn" | "Google", r: SmRow): PaidSpendRow | null {
  const date = String(r["date"] ?? r["Date"] ?? "").slice(0, 10);
  if (!date) return null;

  const num = (v: unknown): number => (v == null || v === "" ? 0 : Number(v) || 0);

  if (source === "LinkedIn") {
    const id = String(r["campaign_id"] ?? r["Campaign ID"] ?? "");
    const name = String(r["campaign_name"] ?? r["Campaign Name"] ?? "");
    const group = String(
      r["campaign_group_name"] ?? r["Campaign Group Name"] ?? "",
    );
    if (!id || !name) return null;
    return {
      source: "LinkedIn",
      platformCampaignId: id,
      campaignGroupName: group || null,
      campaignName: name,
      date,
      spend: num(r["spend"] ?? r["Spend"]),
      currency: String(r["currency"] ?? r["Currency"] ?? "EUR"),
      impressions: num(r["impressions"] ?? r["Impressions"]),
      clicks: num(r["clicks"] ?? r["Clicks"]),
    };
  }

  // Google Ads
  const id = String(r["campaign_id"] ?? r["Campaign ID"] ?? "");
  const name = String(r["campaign"] ?? r["Campaign"] ?? "");
  if (!id || !name) return null;
  return {
    source: "Google",
    platformCampaignId: id,
    campaignGroupName: null,                  // no aplica en Google
    campaignName: name,
    date,
    spend: num(r["cost"] ?? r["Cost"]),
    currency: String(r["currency"] ?? r["Currency"] ?? "EUR"),
    impressions: num(r["impressions"] ?? r["Impressions"]),
    clicks: num(r["clicks"] ?? r["Clicks"]),
  };
}

export async function fetchPaidSpend(params: {
  source: "LinkedIn" | "Google";
  startDate: string;
  endDate: string;
}): Promise<PaidSpendRow[]> {
  const apiKey = requireKey();
  const teamId = requireTeam();
  const fields = params.source === "LinkedIn" ? LIA_FIELDS : AW_FIELDS;

  const body = {
    api_key: apiKey,
    team_id: teamId,
    ds_id: params.source === "LinkedIn" ? "LIA" : "AW",
    fields,
    date_range_type: "custom",
    start_date: params.startDate,
    end_date: params.endDate,
    settings: {
      currency: "EUR",
      ...(params.source === "Google" ? { asset_level: "Campaign" } : {}),
    },
  };

  const res = await fetch(SUPERMETRICS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `Supermetrics ${params.source} error ${res.status}: ${await res.text()}`,
    );
  }

  const json = (await res.json()) as { data?: SmRow[]; error?: { message?: string } };
  if (json.error) {
    throw new Error(`Supermetrics ${params.source} API error: ${json.error.message ?? "unknown"}`);
  }
  return (json.data ?? [])
    .map((r) => mapRow(params.source, r))
    .filter((x): x is PaidSpendRow => x !== null);
}
