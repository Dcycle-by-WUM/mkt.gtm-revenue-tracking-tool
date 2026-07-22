// Pacing de mes en curso — Overview "Cómo vamos vs Target". Un mes cerrado
// muestra el REAL consolidado; un mes en curso proyecta el total del mes a
// partir de lo consolidado a fecha (pacing lineal simple: real-a-fecha /
// fracción de días transcurridos). Un mes futuro no tiene real todavía.

export type MonthStatus = "past" | "current" | "future";

function ymOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthStatus(month: string, today: Date = new Date()): MonthStatus {
  const todayMonth = ymOf(today);
  if (month < todayMonth) return "past";
  if (month > todayMonth) return "future";
  return "current";
}

/** Días transcurridos / días totales del mes (0-1]. Solo tiene sentido para el mes en curso. */
export function monthPacingFraction(month: string, today: Date = new Date()): number {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return Math.min(today.getDate() / daysInMonth, 1);
}

export function daysElapsedAndTotal(month: string, today: Date = new Date()): { elapsed: number; total: number } {
  const [y, m] = month.split("-").map(Number);
  const total = new Date(y, m, 0).getDate();
  return { elapsed: Math.min(today.getDate(), total), total };
}

/** Proyecta el total de mes a partir de lo consolidado a fecha (pacing lineal). */
export function projectFullMonth(actualToDate: number, month: string, today: Date = new Date()): number {
  const frac = monthPacingFraction(month, today);
  return frac > 0 ? actualToDate / frac : actualToDate;
}
