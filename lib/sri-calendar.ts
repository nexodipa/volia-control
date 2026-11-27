// Vencimiento de la declaración mensual del SRI (IVA y retenciones en la fuente) según el noveno dígito del RUC.
// Fechas del calendario tributario: dígito 1 = día 10, 2 = 12, 3 = 14, 4 = 16, 5 = 18, 6 = 20, 7 = 22, 8 = 24, 9 = 26, 0 = 28.
// Si el día cae en fin de semana o feriado, pasa al siguiente día hábil; si eso cambia de mes, se adelanta al último día hábil anterior.
// Solo incluye los feriados nacionales de fecha fija: el día exacto de cada mes siempre se confirma en el SRI.

export const VOLIA_RUC = "1793206800001";

const DUE_DAY: Record<string, number> = { "1": 10, "2": 12, "3": 14, "4": 16, "5": 18, "6": 20, "7": 22, "8": 24, "9": 26, "0": 28 };

/** Feriados nacionales de fecha fija (mes-día). */
const FIXED_HOLIDAYS = new Set(["01-01", "05-01", "05-24", "08-10", "10-09", "11-02", "11-03", "12-25"]);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (date: string) => new Date(`${date}T12:00:00Z`);
const addDays = (date: string, n: number) => iso(new Date(at(date).getTime() + n * 86_400_000));

export function isBusinessDay(date: string, extraHolidays: string[] = []): boolean {
  const dow = at(date).getUTCDay();
  return dow !== 0 && dow !== 6 && !FIXED_HOLIDAYS.has(date.slice(5)) && !extraHolidays.includes(date);
}

export function ninthDigit(ruc: string): string | null {
  const digits = ruc.replace(/\D/g, "");
  return digits.length >= 9 ? digits[8] : null;
}

/** Fecha límite (AAAA-MM-DD) de la declaración mensual que se presenta en el mes de `year`-`month` (1 a 12). */
export function sriDueDate(ruc: string, year: number, month: number, extraHolidays: string[] = []): string | null {
  const digit = ninthDigit(ruc);
  const day = digit === null ? undefined : DUE_DAY[digit];
  if (!day) return null;
  const nominal = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  let forward = nominal;
  while (!isBusinessDay(forward, extraHolidays)) forward = addDays(forward, 1);
  if (forward.slice(0, 7) === nominal.slice(0, 7)) return forward;
  let back = nominal;
  while (!isBusinessDay(back, extraHolidays)) back = addDays(back, -1);
  return back;
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export type SriReminder = { due: string; days: number; period: string };

/** Próxima declaración mensual pendiente desde `today` (el vencimiento de este mes, o el del siguiente si ya pasó). */
export function nextSriDue(ruc: string, today: string, extraHolidays: string[] = []): SriReminder | null {
  const [y, m] = today.split("-").map(Number);
  for (const [yy, mm] of [[y, m], [m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1]] as const) {
    const due = sriDueDate(ruc, yy, mm, extraHolidays);
    if (!due || due < today) continue;
    const days = Math.round((at(due).getTime() - at(today).getTime()) / 86_400_000);
    const prev = mm === 1 ? 12 : mm - 1;
    return { due, days, period: `${MONTHS[prev - 1]} de ${mm === 1 ? yy - 1 : yy}` };
  }
  return null;
}

/** Líneas del resumen diario. Lunes (informe completo): desde 10 días antes. Resto: a los 7, 3, 1 y 0 días. */
export function sriDigest(ruc: string, today: string, full: boolean, extraHolidays: string[] = []): { total: number; lines: string[] } {
  const next = nextSriDue(ruc, today, extraHolidays);
  if (!next) return { total: 0, lines: [] };
  const show = full ? next.days <= 10 : [7, 3, 1, 0].includes(next.days);
  if (!show) return { total: 0, lines: [] };
  const when = next.days === 0 ? "vence hoy" : next.days === 1 ? "vence mañana" : `vence en ${next.days} días (${next.due})`;
  return {
    total: 1,
    lines: [
      `Declaración mensual de IVA y retenciones en la fuente de ${next.period}: ${when}.`,
      "La fecha sale del noveno dígito del RUC y de los feriados nacionales fijos; confírmela en el SRI. Si ya la presentó, ignore este aviso.",
    ],
  };
}
