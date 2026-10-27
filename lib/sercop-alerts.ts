// Alerta de procesos nuevos del SERCOP. Consulta la interfaz pública de Contrataciones Abiertas
// (datosabiertos.compraspublicas.gob.ec), se queda con lo que parece médico, recuerda lo ya visto en D1
// (tabla shared_records, colección "sercop_seen") y envía por Gmail solo lo nuevo.
import { alertsConfigured, APP_URL, type AlertConfig, type AlertDb } from "./alert-sender.ts";
import { ecuadorToday } from "./alert-digest.ts";

export const SERCOP_API = "https://datosabiertos.compraspublicas.gob.ec/PLATAFORMA/api/search_ocds";
export const SEARCH_TERMS = [
  "dispositivos médicos", "insumos médicos", "material de osteosíntesis", "osteosíntesis", "implantes", "traumatología",
  "prótesis", "material quirúrgico", "insumos hospitalarios", "ortopedia", "suturas",
];
const FETCH_BUDGET = 36; // el plan gratuito de Workers permite 50 subpeticiones por ejecución
const MAX_PAGES_PER_TERM = 5;
const MAX_IN_EMAIL = 40;

export type SercopRow = {
  id: number; ocid: string; year: number; month: number; internal_type: string | null; region: string | null; locality: string | null;
  buyer: string | null; amount: string | null; date: string | null; title: string | null; description: string | null; budget: string | null;
};

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MEDICAL = /medic|quirurg|implant|osteosint|traumat|ortoped|protesis|sutura|cirug|hospital|clinic|sanitari|esteril|ortesis|placa|tornillo|cateter|jeringa|gasa|guante|insumo.*salud|dispositivo/;
const HEALTH_BUYER = /hospital|iess|ministerio de salud|clinica|salud|instituto ecuatoriano de seguridad social/;
const SUPPLY = /insumo|material|dispositivo|equipo|adquisicion|suministro|provision/;
const NOISE = /agua potable|reforest|vehicul|caminero|desratiz|limpieza|aseo|combustible|alimentacion|cloro|computacion|laboratorio de la planta|construccion|asfalt|mantenimiento de/;

export function isMedical(row: Pick<SercopRow, "title" | "description" | "buyer">): boolean {
  const text = plain(`${row.title ?? ""} ${row.description ?? ""}`);
  if (!text.trim()) return false;
  if (NOISE.test(text)) return false;
  if (MEDICAL.test(text)) return true;
  return HEALTH_BUYER.test(plain(row.buyer ?? "")) && SUPPLY.test(text);
}

export function parsePage(json: unknown): { rows: SercopRow[]; pages: number } {
  const j = (json ?? {}) as { pages?: unknown; data?: unknown };
  const rows = (Array.isArray(j.data) ? j.data : []).filter((r): r is SercopRow => !!r && typeof (r as SercopRow).ocid === "string");
  return { rows, pages: Number.isFinite(Number(j.pages)) ? Number(j.pages) : 1 };
}

/** ¿Se publicó este mes o el anterior? Evita avisar de procesos viejos que apenas aparecen en la búsqueda. */
export function isRecent(row: Pick<SercopRow, "year" | "month">, today: string): boolean {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  if (row.year !== y) return false;
  return row.month >= Math.max(1, m - 1);
}

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Cada consulta al SERCOP tarda unos 20 s, así que se hacen en paralelo y con tiempo máximo. */
const REQUEST_TIMEOUT_MS = 50_000;

export async function collectCandidates(fetcher: Fetcher, year: number, today: string) {
  const found = new Map<string, SercopRow>();
  let used = 0, truncated = false, failures = 0;
  const get = async (term: string, page: number) => {
    used += 1;
    try {
      const res = await fetcher(`${SERCOP_API}?year=${year}&search=${encodeURIComponent(term)}&page=${page}`);
      if (!res.ok) { failures += 1; return null; }
      const parsed = parsePage(await res.json());
      for (const r of parsed.rows) if (isRecent(r, today) && isMedical(r)) found.set(r.ocid, r);
      return parsed.pages;
    } catch { failures += 1; return null; }
  };
  // Ola 1: la primera página de cada término, todas a la vez.
  const firstPages = await Promise.all(SEARCH_TERMS.map((t) => get(t, 1)));
  // Ola 2: páginas siguientes, repartidas por turnos entre términos hasta agotar el presupuesto.
  const plan: [string, number][] = [];
  for (let page = 2; page <= MAX_PAGES_PER_TERM; page += 1) {
    SEARCH_TERMS.forEach((t, i) => { if ((firstPages[i] ?? 1) >= page) plan.push([t, page]); });
  }
  const room = Math.max(0, FETCH_BUDGET - SEARCH_TERMS.length);
  if (plan.length > room) truncated = true;
  await Promise.all(plan.slice(0, room).map(([t, p]) => get(t, p)));
  if (firstPages.some((p) => (p ?? 1) > MAX_PAGES_PER_TERM)) truncated = true;
  return { rows: [...found.values()].sort((a, b) => b.id - a.id), used, truncated, failures };
}

const money = (v: string | null) => { const n = Number(v); return n > 0 ? `USD ${n.toLocaleString("es-EC", { maximumFractionDigits: 2 })}` : "monto no publicado"; };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const short = (s: string | null, n = 220) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export function buildSercopDigest(rows: SercopRow[], today: string, first: boolean, truncated: boolean) {
  const shown = rows.slice(0, MAX_IN_EMAIL);
  const line = (r: SercopRow) => `${r.title || r.ocid} · ${short(r.buyer, 80)} (${r.region ?? "—"}) · ${r.internal_type ?? "proceso"} · ${money(r.amount ?? r.budget)}\n   ${short(r.description)}`;
  const head = first ? `Primera revisión: ${rows.length} proceso(s) médico(s) publicados este mes o el anterior` : `${rows.length} proceso(s) nuevo(s) en el SERCOP`;
  const notes = [rows.length > shown.length ? `Se muestran ${shown.length} de ${rows.length}; el resto está en Mercado SERCOP.` : "", truncated ? "La búsqueda se cortó por límite de consultas: puede haber más procesos que no se revisaron." : "", "Verifique cada proceso en el portal oficial del SERCOP antes de ofertar."].filter(Boolean);
  const subject = `Volia Control · SERCOP: ${rows.length} proceso(s) ${first ? "para revisar" : "nuevo(s)"} (${today})`;
  const text = [head, "", ...shown.map((r, i) => `${i + 1}. ${line(r)}`), "", ...notes, `Abrir el sistema: ${APP_URL}`].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2933"><h2 style="margin:0 0 12px">${esc(head)}</h2><ol style="padding-left:20px">${shown.map((r) => `<li style="margin-bottom:10px"><strong>${esc(r.title || r.ocid)}</strong><br>${esc(short(r.buyer, 80))} · ${esc(r.region ?? "—")} · ${esc(r.internal_type ?? "proceso")} · ${esc(money(r.amount ?? r.budget))}<br><span style="color:#44564c">${esc(short(r.description))}</span></li>`).join("")}</ol>${notes.map((n) => `<p style="color:#44564c">${esc(n)}</p>`).join("")}<p><a href="${esc(APP_URL)}">Abrir el sistema</a></p></div>`;
  return { subject, text, html };
}

export type SercopResult = { ok: boolean; sent: boolean; message: string; found?: number; fresh?: number; truncated?: boolean };

type SeenDb = AlertDb & { batch(statements: unknown[]): Promise<unknown> };
const COLLECTION = "sercop_seen";

export type SercopLast = { at: string; ok: boolean; sent: boolean; message: string };

export async function readLastSercop(db: AlertDb): Promise<SercopLast | null> {
  try {
    const row = (await db.prepare("SELECT data FROM shared_records WHERE collection = 'sercop_meta' AND record_id = 'last'").all<{ data: string }>()).results[0];
    return row ? (JSON.parse(row.data) as SercopLast) : null;
  } catch { return null; }
}

/** Ejecuta la revisión y deja anotado el resultado para mostrarlo en Inicio (no cuenta si es prueba). */
export async function runAndRecordSercop(db: SeenDb, cfg: AlertConfig | undefined, opts: { fetcher?: Fetcher; now?: Date } = {}): Promise<SercopResult> {
  const result = await runSercopCheck(db, cfg, opts).catch((e): SercopResult => ({ ok: false, sent: false, message: `Error inesperado: ${e instanceof Error ? e.message : "desconocido"}` }));
  try {
    const stmt = db.prepare("INSERT OR REPLACE INTO shared_records (collection, record_id, data, updated_at, deleted, updated_by) VALUES ('sercop_meta', 'last', ?, ?, 0, 'sercop-alert')") as unknown as { bind(...v: unknown[]): unknown };
    const at = new Date().toISOString();
    await db.batch([stmt.bind(JSON.stringify({ at, ok: result.ok, sent: result.sent, message: result.message } satisfies SercopLast), at)]);
  } catch { /* anotar el resultado es opcional */ }
  return result;
}

export async function runSercopCheck(db: SeenDb, cfg: AlertConfig | undefined, opts: { fetcher?: Fetcher; now?: Date; dryRun?: boolean } = {}): Promise<SercopResult> {
  const today = ecuadorToday(opts.now);
  const fetcher: Fetcher = opts.fetcher ?? ((u) => fetch(u, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }));
  const { rows, truncated, failures, used } = await collectCandidates(fetcher, Number(today.slice(0, 4)), today);
  if (!rows.length && failures >= used) return { ok: false, sent: false, message: "No se pudo consultar el SERCOP (la interfaz no respondió). Se reintenta en la próxima ejecución." };
  const seen = new Set((await db.prepare("SELECT record_id FROM shared_records WHERE collection = 'sercop_seen'").all<{ record_id: string }>()).results.map((r) => r.record_id));
  const first = seen.size === 0;
  const fresh = rows.filter((r) => !seen.has(r.ocid));
  if (opts.dryRun) return { ok: true, sent: false, message: `Prueba sin enviar: ${rows.length} médicos del mes, ${fresh.length} nuevos${truncated ? " (búsqueda incompleta)" : ""}.`, found: rows.length, fresh: fresh.length, truncated };
  if (!fresh.length) return { ok: true, sent: false, message: `Sin procesos nuevos (${rows.length} revisados).`, found: rows.length, fresh: 0, truncated };
  if (!alertsConfigured(cfg)) return { ok: false, sent: false, message: "Las alertas por correo no están configuradas.", found: rows.length, fresh: fresh.length, truncated };
  const mail = buildSercopDigest(fresh, today, first, truncated);
  const res = await fetch(cfg.url, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret: cfg.secret, subject: mail.subject, text: mail.text, html: mail.html }) });
  let body: { ok?: boolean; error?: string } = {};
  try { body = await res.json(); } catch { /* respuesta no JSON */ }
  if (!res.ok || !body.ok) return { ok: false, sent: false, message: `El script de Gmail respondió con error${body.error ? `: ${body.error}` : ` (HTTP ${res.status})`}. Los procesos no se marcaron como vistos.`, found: rows.length, fresh: fresh.length, truncated };
  // Solo se marcan como vistos DESPUÉS de que el correo salió: si falla, mañana se reintenta.
  const stamp = new Date().toISOString();
  const stmts = fresh.map((r) => (db.prepare("INSERT OR REPLACE INTO shared_records (collection, record_id, data, updated_at, deleted, updated_by) VALUES (?, ?, ?, ?, 0, 'sercop-alert')") as unknown as { bind(...v: unknown[]): unknown }).bind(COLLECTION, r.ocid, JSON.stringify({ t: short(r.title, 80), b: short(r.buyer, 80) }), stamp));
  for (let i = 0; i < stmts.length; i += 40) await db.batch(stmts.slice(i, i + 40));
  return { ok: true, sent: true, message: `Correo enviado con ${fresh.length} proceso(s) ${first ? "para revisar" : "nuevo(s)"}.`, found: rows.length, fresh: fresh.length, truncated };
}
