// Procesos de contratación a los que Volia decide dar seguimiento (desde el aviso del SERCOP o a mano):
// estados, avisos de fecha límite y estadísticas. Funciones puras para poder probarlas sin navegador.
import { daysUntil } from "./business-alerts.ts";

export type TenderStatus = "interested" | "preparing" | "offered" | "won" | "lost" | "dropped";

export type Tender = {
  id: string;
  /** Código del proceso en el SERCOP (por ejemplo SIE-HG-AM-2026-036-2764). */
  ref: string;
  title: string;
  buyer: string;
  province: string;
  /** Presupuesto referencial en USD (0 si no se conoce). */
  amount: number;
  /** Fecha límite para ofertar (AAAA-MM-DD) o vacío. */
  deadline: string;
  status: TenderStatus;
  /** Lo que ofertó Volia y lo que cerró el ganador, para aprender del descuento real. */
  ourPrice: number;
  winnerPrice: number;
  winner: string;
  notes: string;
  createdAt: string;
};

export const TENDER_STATUS: Record<TenderStatus, { label: string; tone: "blue" | "yellow" | "green" | "red" | "gray"; open: boolean }> = {
  interested: { label: "Por revisar", tone: "gray", open: true },
  preparing: { label: "Preparando oferta", tone: "yellow", open: true },
  offered: { label: "Oferta presentada", tone: "blue", open: true },
  won: { label: "Adjudicado a Volia", tone: "green", open: false },
  lost: { label: "Perdido", tone: "red", open: false },
  dropped: { label: "Descartado", tone: "gray", open: false },
};
export const TENDER_ORDER: TenderStatus[] = ["interested", "preparing", "offered", "won", "lost", "dropped"];

export function isTenderStatus(value: unknown): value is TenderStatus {
  return typeof value === "string" && value in TENDER_STATUS;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const money = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; };
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

/** Deja un registro (venga del navegador, del servidor o de un respaldo) con el formato esperado. */
export function normalizeTender(raw: unknown): Tender | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id, 80);
  if (!id) return null;
  return {
    id, ref: text(r.ref, 80), title: text(r.title, 400), buyer: text(r.buyer, 160), province: text(r.province, 60),
    amount: money(r.amount), deadline: isoDate(r.deadline), status: isTenderStatus(r.status) ? r.status : "interested",
    ourPrice: money(r.ourPrice), winnerPrice: money(r.winnerPrice), winner: text(r.winner, 160), notes: text(r.notes, 1000), createdAt: text(r.createdAt, 40),
  };
}

/** Datos que trae el enlace del correo: ?seguir=CÓDIGO&d=descripción&c=entidad&m=monto&r=provincia. */
export function tenderFromParams(search: string): Partial<Tender> | null {
  const params = new URLSearchParams(search);
  const ref = text(params.get("seguir"), 80);
  if (!ref) return null;
  return { ref, title: text(params.get("d"), 400) || ref, buyer: text(params.get("c"), 160), amount: money(params.get("m")), province: text(params.get("r"), 60) };
}

export function followLink(appUrl: string, row: { ref: string; title?: string | null; buyer?: string | null; amount?: number | string | null; province?: string | null }): string {
  const q = new URLSearchParams({ seguir: row.ref });
  if (row.title) q.set("d", row.title.replace(/\s+/g, " ").trim().slice(0, 160));
  if (row.buyer) q.set("c", row.buyer.replace(/\s+/g, " ").trim().slice(0, 100));
  if (Number(row.amount) > 0) q.set("m", String(Number(row.amount)));
  if (row.province) q.set("r", row.province.slice(0, 40));
  return `${appUrl}/?${q.toString()}`;
}

export type TenderReminder = { id: string; ref: string; title: string; buyer: string; deadline: string; days: number; status: TenderStatus };

/** Procesos abiertos sin presentar cuya fecha límite está cerca. Entre semana avisa a 3, 1 y 0 días; el lunes, todo lo de los próximos 7. */
export function deadlineReminders(tenders: Tender[], today: string, full: boolean): TenderReminder[] {
  return tenders
    .filter((t) => (t.status === "interested" || t.status === "preparing") && t.deadline)
    .map((t) => ({ id: t.id, ref: t.ref, title: t.title, buyer: t.buyer, deadline: t.deadline, days: daysUntil(t.deadline, today), status: t.status }))
    .filter((t) => (full ? t.days >= -1 && t.days <= 7 : [3, 1, 0, -1].includes(t.days)))
    .sort((a, b) => a.days - b.days);
}

export type TenderStats = {
  total: number;
  byStatus: Record<TenderStatus, number>;
  open: number;
  /** Suma del presupuesto de lo que sigue abierto. */
  inPlay: number;
  wonAmount: number;
  /** Ganados sobre (ganados + perdidos); null si todavía no hay resultados. */
  winRate: number | null;
  decided: number;
  /** Mediana de (precio ofertado / presupuesto) en lo ya resuelto; null sin datos. */
  typicalOfferRatio: number | null;
};

export function tenderStats(tenders: Tender[]): TenderStats {
  const byStatus = Object.fromEntries(TENDER_ORDER.map((s) => [s, 0])) as Record<TenderStatus, number>;
  for (const t of tenders) byStatus[t.status] += 1;
  const open = tenders.filter((t) => TENDER_STATUS[t.status].open);
  const decided = byStatus.won + byStatus.lost;
  const ratios = tenders.filter((t) => (t.status === "won" || t.status === "lost") && t.ourPrice > 0 && t.amount > 0).map((t) => t.ourPrice / t.amount).sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  return {
    total: tenders.length, byStatus, open: open.length, inPlay: open.reduce((s, t) => s + t.amount, 0),
    wonAmount: tenders.filter((t) => t.status === "won").reduce((s, t) => s + (t.ourPrice || t.amount), 0),
    winRate: decided ? byStatus.won / decided : null, decided,
    typicalOfferRatio: ratios.length ? (ratios.length % 2 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2) : null,
  };
}

/** Ordena: primero lo abierto con fecha límite más cercana, luego lo abierto sin fecha y al final lo cerrado (lo más reciente primero). */
export function sortTenders(tenders: Tender[]): Tender[] {
  const rank = (t: Tender) => (TENDER_STATUS[t.status].open ? (t.deadline ? 0 : 1) : 2);
  return [...tenders].sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? a.deadline.localeCompare(b.deadline) : b.createdAt.localeCompare(a.createdAt)));
}
