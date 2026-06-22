// Heat Score "Pre-Demo" — algoritmo cerrado del Brief §H/§9.
// Puntúa la intención de un contacto antes de pedir demo = señales × recencia.

export type HeatContact = {
  email: string;
  company: string;
  jobTitle: string;
  country: string;
  ownerSdr: string;
  // Señales (campos HubSpot del brief §6/§H)
  numConversionEvents: number;
  recentConversionDate: string | null; // ISO
  recentConversionEventName: string;
  firstConversionEventName: string;
  emailLastOpenDate: string | null; // ISO
  emailOpen: number;
  emailClick: number;
  emailReplied: number;
  pageViews: number;
  linkedinEngagement: "Muy alto" | "Alto" | "Medio" | null;
  // Elegibilidad
  lifecycleStage: string;
  leadStatus: string;
  emailOptout: boolean;
  numContactedNotes: number;
};

export type HeatBand = "🔥 Caliente" | "⚡ Templado" | "🌱 Tibio" | "❄️ Frío";

export type HeatResult = {
  score: number;
  band: HeatBand;
  breakdown: { signal: string; points: number }[];
};

// "Hoy" fijo para que el preview sea determinista (= currentDate del proyecto).
const NOW = new Date("2026-06-12T00:00:00Z");

function daysSince(iso: string | null): number {
  if (!iso) return Infinity;
  return Math.floor((NOW.getTime() - new Date(iso).getTime()) / 86_400_000);
}

// Multiplicador de recencia (días desde el evento) — §H.
function recencyMultiplier(days: number): number {
  if (days <= 3) return 2.0;
  if (days <= 7) return 1.6;
  if (days <= 14) return 1.3;
  if (days <= 30) return 1.0;
  if (days <= 60) return 0.6;
  return 0.3;
}

export function band(score: number): HeatBand {
  if (score >= 70) return "🔥 Caliente";
  if (score >= 50) return "⚡ Templado";
  if (score >= 30) return "🌱 Tibio";
  return "❄️ Frío";
}

export function computeHeat(c: HeatContact): HeatResult {
  const rConv = recencyMultiplier(daysSince(c.recentConversionDate));
  const rEmail = recencyMultiplier(daysSince(c.emailLastOpenDate));
  const bd: { signal: string; points: number }[] = [];
  const add = (signal: string, base: number, mult: number) => {
    const points = base * mult;
    if (points > 0) bd.push({ signal, points: Math.round(points) });
  };

  // Conversiones/descargas × recency_conv
  if (c.numConversionEvents >= 5) add("Conversiones ≥5", 35, rConv);
  else if (c.numConversionEvents >= 3) add("Conversiones ≥3", 30, rConv);
  else if (c.numConversionEvents === 2) add("Conversiones =2", 18, rConv);

  // Email respondido × recency_email
  if (c.emailReplied > 0) add("Email respondido", 25, rEmail);

  // Email opens × recency_email
  if (c.emailOpen >= 10) add("Email opens ≥10", 12, rEmail);
  else if (c.emailOpen >= 5) add("Email opens ≥5", 8, rEmail);
  else if (c.emailOpen >= 3) add("Email opens ≥3", 5, rEmail);

  // Email clicks × recency_email
  if (c.emailClick >= 10) add("Email clicks ≥10", 15, rEmail);
  else if (c.emailClick >= 5) add("Email clicks ≥5", 10, rEmail);
  else if (c.emailClick >= 1) add("Email clicks ≥1", 5, rEmail);

  // Page views × recency_conv
  if (c.pageViews >= 20) add("Page views ≥20", 8, rConv);
  else if (c.pageViews >= 5) add("Page views ≥5", 4, rConv);

  // Webinar / Demo × recency_conv
  const ev = `${c.recentConversionEventName} ${c.firstConversionEventName}`.toLowerCase();
  if (ev.includes("webinar")) add("Webinar", 8, rConv);
  if (ev.includes("demo")) add("Demo", 20, rConv);

  // LinkedIn Ads — empresa engaged (sin recency)
  if (c.linkedinEngagement === "Muy alto") add("LinkedIn engaged (Muy alto)", 15, 1);
  else if (c.linkedinEngagement === "Alto") add("LinkedIn engaged (Alto)", 8, 1);
  else if (c.linkedinEngagement === "Medio") add("LinkedIn engaged (Medio)", 4, 1);

  const score = Math.min(100, Math.round(bd.reduce((s, x) => s + x.points, 0)));
  return { score, band: band(score), breakdown: bd };
}

// Filtros de elegibilidad (§H): quién entra al scoring.
export function isEligible(c: HeatContact): boolean {
  const junkStatus = ["MK NOT QUALIFIED", "NOT QUALIFIED", "Disqualified"];
  const junkStage = ["opportunity", "customer", "subscriber"];
  return (
    c.numConversionEvents >= 2 &&
    !junkStage.includes(c.lifecycleStage.toLowerCase()) &&
    !c.emailOptout &&
    c.numContactedNotes === 0 &&
    !junkStatus.includes(c.leadStatus)
  );
}
