"use client";

import { useEffect, useMemo, useState } from "react";
import { amountOf, provinceOf, type MarketProcess } from "../lib/market";
import { opportunities, tenderFromProcess } from "../lib/market-opportunities";
import { readStoredArray, STORAGE_KEYS, writeStoredJson } from "../lib/storage";
import { normalizeTender, TENDER_STATUS, type Tender } from "../lib/tenders";

type LiveRow = { ocid: string; title: string | null; description: string | null; buyer: string | null; region: string | null; amount: string | null; budget: string | null; internal_type: string | null; fit: "alta" | "media" | "fuera" };
type LiveState = { rows: LiveRow[]; last: { at: string; ok: boolean; message: string } | null } | null | "error";

const money = (v: number) => (v > 0 ? new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v) : "Monto no publicado");
const METHOD: Record<MarketProcess["m"], string> = { SIE: "Subasta inversa", LIC: "Licitación", CAT: "Catálogo", BSU: "Bienes únicos", OTRO: "Otro" };
const SMALL = new Set(["de", "del", "la", "las", "los", "el", "y", "en", "e"]);
const title = (s: string) => s.toLowerCase().replace(/(^|\s)(\S+)/g, (_m, sp: string, w: string) => sp + (SMALL.has(w) && sp ? w : w.charAt(0).toUpperCase() + w.slice(1)));
const sentence = (s: string) => { const t = s.replace(/\s+/g, " ").trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
const uid = () => `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default function MarketOpportunities({ all, terms, onExplore }: { all: MarketProcess[]; terms: string[]; onExplore: () => void }) {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [days, setDays] = useState(21);
  const [shown, setShown] = useState(8);
  const [open, setOpen] = useState<string | null>(null);
  const [live, setLive] = useState<LiveState>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setTenders(readStoredArray<unknown>(STORAGE_KEYS.tenders).map(normalizeTender).filter((t): t is Tender => !!t)), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/sercop-alerts?rows=1", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (alive) setLive({ rows: Array.isArray(j.rows) ? j.rows : [], last: j.last ?? null }); })
      .catch(() => { if (alive) setLive("error"); });
    return () => { alive = false; };
  }, []);

  const byRef = useMemo(() => new Map(tenders.map((t) => [t.ref.toLowerCase(), t])), [tenders]);
  const hiddenIds = useMemo(() => new Set(tenders.map((t) => t.ref)), [tenders]);
  const result = useMemo(() => opportunities(all, { terms, days, hiddenIds }), [all, terms, days, hiddenIds]);
  const followed = tenders.filter((t) => t.status !== "dropped" && t.status !== "won" && t.status !== "lost");
  const dropped = tenders.filter((t) => t.status === "dropped");

  const liveItems = useMemo(() => (live && live !== "error" ? live.rows.filter((r) => r.fit !== "fuera" && !hiddenIds.has(r.title || r.ocid)) : []), [live, hiddenIds]);
  const addLive = (r: LiveRow, status: Tender["status"]) => {
    const ref = r.title || r.ocid;
    if (byRef.has(ref.toLowerCase())) return;
    const amount = Number(r.budget ?? r.amount) || 0;
    save([{ id: uid(), ref, title: (r.description ?? ref).replace(/\s+/g, " ").trim().slice(0, 300), buyer: (r.buyer ?? "").trim(), province: r.region ? title(r.region) : "", amount, deadline: "", status, ourPrice: 0, winnerPrice: 0, winner: "", notes: "", createdAt: new Date().toISOString() }, ...tenders]);
  };
  const save = (next: Tender[]) => { setTenders(next); writeStoredJson(STORAGE_KEYS.tenders, next); };
  const add = (p: MarketProcess, status: Tender["status"]) => {
    if (byRef.has(p.id.toLowerCase())) return;
    save([{ id: uid(), deadline: "", status, ourPrice: 0, winnerPrice: 0, winner: "", notes: "", createdAt: new Date().toISOString(), ...tenderFromProcess(p) }, ...tenders]);
  };
  const restore = (t: Tender) => save(tenders.filter((x) => x.id !== t.id));

  return <div className="op-wrap">
    <div className="op-summary" aria-label="Resumen">
      <div><strong>{result.items.length}</strong><span>por revisar, de {result.window} procesos nuevos</span></div>
      <div><strong>{followed.length}</strong><span>en seguimiento en Licitaciones</span></div>
      <div><strong>{dropped.length}</strong><span>descartados{dropped.length ? "" : " (nada por ahora)"}</span></div>
    </div>


    {live && live !== "error" && <section className="op-live" aria-label="Revisión diaria del SERCOP">
      <div className="op-live-head">
        <h3>Nuevos en el SERCOP</h3>
        <small>{live.last ? `Última revisión: ${new Date(live.last.at).toLocaleString("es-EC", { dateStyle: "medium", timeStyle: "short" })}. Se revisa sola de lunes a viernes a las 08:00.` : "Aún no hay revisiones · se hace sola de lunes a viernes a las 08:00"}</small>
      </div>
      {liveItems.length === 0 ? <p className="op-empty">No hay procesos nuevos que encajen con nuestros productos desde la última revisión.</p> : <ol className="op-list">
        {liveItems.slice(0, 6).map((r) => <li key={r.ocid} className={`op-card fit-${r.fit}`}>
          <div className="op-head"><small>{r.title || r.ocid} · {r.internal_type ?? "Proceso"}{r.region ? ` · ${title(r.region)}` : ""}</small><span className={`op-fit fit-${r.fit}`}>{r.fit === "alta" ? "Encaje alto" : "Encaje medio"}</span></div>
          <h3>{sentence(r.description ?? r.title ?? "").slice(0, 220)}</h3>
          <p className="op-buyer">{title(r.buyer ?? "")} · <strong>{money(Number(r.budget ?? r.amount) || 0)}</strong></p>
          <div className="op-actions"><button type="button" className="primary-button" onClick={() => addLive(r, "interested")}>Dar seguimiento</button><button type="button" className="text-button" onClick={() => addLive(r, "dropped")}>No me interesa</button></div>
        </li>)}
      </ol>}
    </section>}

    <div className="op-toolbar">
      <label>Mostrar lo publicado en los últimos
        <select value={days} onChange={(e) => { setDays(Number(e.target.value)); setShown(8); }}><option value={14}>14 días</option><option value={21}>21 días</option><option value={45}>45 días</option><option value={90}>90 días</option></select>
      </label>
      <button type="button" className="text-button" onClick={onExplore}>Explorar todo el mercado</button>
    </div>

    {result.items.length === 0 && <p className="op-empty">No hay procesos nuevos que encajen con nuestros productos en este período. Amplíe los días o explore todo el mercado.</p>}

    <ol className="op-list">
      {result.items.slice(0, shown).map((o) => {
        const { p } = o;
        const isOpen = open === p.id;
        return <li key={p.id} className={`op-card fit-${o.fit}`}>
          <div className="op-head">
            <small>{p.id} · {METHOD[p.m]}{provinceOf(p) ? ` · ${provinceOf(p)}` : ""} · {p.d.slice(0, 10)}</small>
            <span className={`op-fit fit-${o.fit}`}>{o.fit === "alta" ? "Encaje alto" : "Encaje medio"}</span>
          </div>
          <h3>{sentence(p.t).slice(0, 220)}{p.t.length > 220 ? "…" : ""}</h3>
          <p className="op-buyer">{title(p.b)} · <strong>{money(amountOf(p))}</strong>{p.o ? ` · ${p.o} ${p.o === 1 ? "oferente" : "oferentes"}` : ""}</p>
          <ul className="op-reasons">{o.reasons.slice(0, isOpen ? 6 : 2).map((r) => <li key={r}>{r}</li>)}</ul>
          {isOpen && <p className="op-full">{sentence(p.t)}</p>}
          <div className="op-actions">
            <button type="button" className="primary-button" onClick={() => add(p, "interested")}>Dar seguimiento</button>
            <button type="button" className="text-button" onClick={() => add(p, "dropped")}>No me interesa</button>
            <button type="button" className="text-button" onClick={() => setOpen(isOpen ? null : p.id)}>{isOpen ? "Ver menos" : "Ver más"}</button>
          </div>
        </li>;
      })}
    </ol>
    {result.items.length > shown && <button type="button" className="secondary-button op-more" onClick={() => setShown(shown + 8)}>Ver más oportunidades ({result.items.length - shown} restantes)</button>}

    {dropped.length > 0 && <details className="op-dropped"><summary>Descartados ({dropped.length})</summary>
      <ul>{dropped.slice(0, 30).map((t) => <li key={t.id}><span>{t.ref} · {sentence(t.title).slice(0, 90)}</span><button type="button" className="text-button" onClick={() => restore(t)}>Recuperar</button></li>)}</ul>
    </details>}
    <p className="op-note">Al dar seguimiento, el proceso aparece en Licitaciones ({TENDER_STATUS.interested.label.toLowerCase()}) para registrar fecha límite, oferta y resultado. Los descartados no vuelven a aparecer aquí.</p>
  </div>;
}
