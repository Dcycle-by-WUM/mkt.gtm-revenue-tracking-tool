// Atribución de país — PRD §8.2.
//
//  LinkedIn: el país se determina por `campaignGroupName` (grupo), NUNCA por
//  campaign_name. Una campaña `..._LONDRES_...` dentro de un grupo UK SOLO
//  se captura por el grupo.
//
//  Google: país por sufijo (`-es`, `-de`, `-fr`, `-en`/EN…).
//
//  Overrides: patrones explícitos (MEX_, US [BOFU], [UK], -ESP, legacy)
//  guardados en `country_overrides`. Pides ayuda en vez de adivinar
//  (DECISIONES.md #2).

import { listCountryOverrides } from "@/lib/data/overrides";

// Patrones del grupo LinkedIn — la regla de oro.
const LINKEDIN_GROUP_PATTERNS: { regex: RegExp; country: string }[] = [
  { regex: /(^|[_\s])UK([_\s]|$)/i, country: "UK" },
  { regex: /(^|[_\s])ESP([_\s]|$)/i, country: "ES" },
  { regex: /(^|[_\s])DE([_\s]|$)/i, country: "DE" },
  { regex: /(^|[_\s])FR([_\s]|$)/i, country: "FR" },
  { regex: /(^|[_\s])US([_\s]|$)/i, country: "US" },
  { regex: /(^|[_\s])MEX([_\s]|$)/i, country: "MX" },
  { regex: /(^|[_\s])IT([_\s]|$)/i, country: "IT" },
];

// Sufijos de Google.
const GOOGLE_SUFFIX_PATTERNS: { suffix: string; country: string }[] = [
  { suffix: "-es", country: "ES" },
  { suffix: "-de", country: "DE" },
  { suffix: "-fr", country: "FR" },
  { suffix: "-it", country: "IT" },
  { suffix: "-uk", country: "UK" },
  { suffix: "-us", country: "US" },
  { suffix: "-mx", country: "MX" },
  { suffix: "-en", country: "—" },                 // EN no es país; va a "Sin país / Multi"
];

export const NO_COUNTRY = "Sin país / Multi";

export type CountrySource = "group" | "suffix" | "override" | "unknown";
export type CountryGuess = { country: string; source: CountrySource };

export function deriveCountryLinkedIn(group: string | null): CountryGuess {
  if (!group) return { country: NO_COUNTRY, source: "unknown" };
  for (const p of LINKEDIN_GROUP_PATTERNS) {
    if (p.regex.test(group)) return { country: p.country, source: "group" };
  }
  return { country: NO_COUNTRY, source: "unknown" };
}

export function deriveCountryGoogle(campaign: string): CountryGuess {
  if (!campaign) return { country: NO_COUNTRY, source: "unknown" };
  const lower = campaign.toLowerCase();
  for (const p of GOOGLE_SUFFIX_PATTERNS) {
    if (lower.endsWith(p.suffix)) {
      return p.country === "—"
        ? { country: NO_COUNTRY, source: "unknown" }
        : { country: p.country, source: "suffix" };
    }
  }
  return { country: NO_COUNTRY, source: "unknown" };
}

// Aplica un override por patrón (MEX_, US [BOFU], [UK]…) al texto base.
function matchOverride(text: string, overrides: Record<string, string>): string | null {
  for (const [pattern, country] of Object.entries(overrides)) {
    if (text.toLowerCase().includes(pattern.toLowerCase())) return country;
  }
  return null;
}

// Determina el país final dado canal + nombre + grupo.
export async function deriveCountry(
  channel: "LinkedIn" | "Google",
  campaignName: string,
  campaignGroup: string | null,
): Promise<CountryGuess> {
  const overrides = await listCountryOverrides();

  // 1) Override gana — sobre el grupo (LinkedIn) o sobre la campaña (Google).
  const target = channel === "LinkedIn" ? campaignGroup ?? campaignName : campaignName;
  const overridden = matchOverride(target, overrides);
  if (overridden) return { country: overridden, source: "override" };

  // 2) Regla canónica del canal.
  if (channel === "LinkedIn") return deriveCountryLinkedIn(campaignGroup);
  return deriveCountryGoogle(campaignName);
}
