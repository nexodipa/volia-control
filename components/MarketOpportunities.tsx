"use client";

import { useEffect, useMemo, useState } from "react";
import { amountOf, provinceOf, type MarketProcess } from "../lib/market";
import { opportunities, tenderFromProcess } from "../lib/market-opportunities";
import { readStoredArray, STORAGE_KEYS, writeStoredJson } from "../lib/storage";
import { normalizeTender, TENDER_STATUS, type Tender } from "../lib/tenders";

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

  useEffect(() => {
    const timer = window.setTimeout(() => setTenders(readStoredArray<unknown>(STORAGE_KEYS.tenders).map(normalizeTender).filter((t): t is Tender => !!t)), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const byRef = useMemo(() => new Map(tenders.map((t) => [t.ref.toLowerCase(), t])), [tenders]);
  const hiddenIds = useMemo(() => new Set(tenders.map((t) => t.ref)), [tenders]);
  const result = useMemo(() => opportunities(all, { terms, days, hiddenIds }), [all, terms, days, hiddenIds]);
  const followed = tenders.filter((t) => t.status !== "dropped" && t.status !== "won" && t.status !== "lost");
  const dropped = tenders.filter((t) => t.status === "dropped");

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
