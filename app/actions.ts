"use server";

// Server Actions invocables desde Client Components. Cada una resuelve la
// escritura contra Supabase (cuando esté configurado) o se vuelve no-op para
// que el prototipo siga funcionando sin secretos.

import { revalidatePath } from "next/cache";
import { upsertCountryOverride, deleteCountryOverride } from "@/lib/data/overrides";
import { upsertNote, type NoteKind } from "@/lib/data/notes";
import { upsertTarget, deleteTarget } from "@/lib/data/targets";
import { setCampaignTagsByName } from "@/lib/data/campaign-tags";
import { updateAccountAbm } from "@/lib/data/accounts";
import { setActiveHeatWeights, type HeatWeightsDoc } from "@/lib/data/heat-weights";
import { ingestLinkedInAdsCsv, type LinkedInIngestSummary } from "@/lib/data/ad-spend";
import type { ForecastRow } from "@/lib/mock-data";

export async function actionSetCountryOverride(pattern: string, country: string): Promise<void> {
  await upsertCountryOverride(pattern, country);
  revalidatePath("/");
  revalidatePath("/paid");
  revalidatePath("/explorer");
}

export async function actionClearCountryOverride(pattern: string): Promise<void> {
  await deleteCountryOverride(pattern);
  revalidatePath("/");
  revalidatePath("/paid");
  revalidatePath("/explorer");
}

export async function actionUpsertNote(kind: NoteKind, key: string, body: string): Promise<void> {
  await upsertNote(kind, key, body);
}

export async function actionUpsertTarget(t: ForecastRow): Promise<void> {
  await upsertTarget(t);
  revalidatePath("/forecast");
}

export async function actionDeleteTarget(channel: string, month: string, country: string): Promise<void> {
  await deleteTarget(channel, month, country);
  revalidatePath("/forecast");
}

export async function actionSetCampaignTags(campaign: string, tags: string[]): Promise<void> {
  await setCampaignTagsByName(campaign, tags);
  revalidatePath("/campaign-detail");
}

export async function actionUpdateAccount(
  domain: string,
  patch: { isTargetAbm?: boolean; sdr?: string },
): Promise<void> {
  await updateAccountAbm(domain, patch);
  revalidatePath("/abm-accounts");
  revalidatePath("/abm-sdr");
}

export async function actionSetHeatWeights(doc: HeatWeightsDoc, name: string): Promise<void> {
  await setActiveHeatWeights(doc, name);
  revalidatePath("/abm-heat");
  revalidatePath("/admin");
}

export async function actionUploadLinkedInAds(formData: FormData): Promise<LinkedInIngestSummary> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return {
      ok: false,
      error: "No se recibió ningún archivo.",
      rowsParsed: 0,
      campaigns: 0,
      spendRows: 0,
      totalSpend: 0,
      dateRange: null,
      countryBreakdown: {},
      multiCampaigns: [],
    };
  }
  try {
    const buf = await file.arrayBuffer();
    const summary = await ingestLinkedInAdsCsv(buf);
    revalidatePath("/");
    revalidatePath("/paid");
    revalidatePath("/explorer");
    revalidatePath("/data-health");
    revalidatePath("/admin");
    return summary;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      rowsParsed: 0,
      campaigns: 0,
      spendRows: 0,
      totalSpend: 0,
      dateRange: null,
      countryBreakdown: {},
      multiCampaigns: [],
    };
  }
}
