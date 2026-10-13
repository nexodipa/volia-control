"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv } from "../lib/csv";
import { buyerRanking, compareWithAward, filterProcesses, ourRecord, winnerRanking, type MarketFilter, type MarketProcess } from "../lib/market";

const DATA_URL = "/data/mercado-sercop-2026.json";
const money = (v: number | null) => v === null ? "—" : new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
const METHOD: Record<MarketProcess["m"], string> = { SIE: "Subasta inversa", LIC: "Licitación", CAT: "Catálogo", BSU: "Bienes únicos", OTRO: "Otro" };
const toCents = (s: string) => Math.round((Number(s.replace(",", ".")) || 0) * 100);

export default function MarketCenter() {
  const [data, setData] = useState<{ source: string; processes: MarketProcess[] } | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<MarketFilter>({ category: "todas", query: "", onlyOurs: false });
  const [cmp, setCmp] = useState({ processId: "SIE-MDMQ-2026-2503-41357", cost: "10219.34", price: "19779.24" });

  useEffect(() => {
    let cancelled = false;
    fetch(DATA_URL, { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Error ${r.status}`))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(`No se pudieron cargar los datos de mercado (${e.message}).`); });
    return () => { cancelled = true; };
  }, []);

  const all = useMemo(() => data?.processes ?? [], [data]);
  const visible = useMemo(() => filterProcesses(all, filter), [all, filter]);
  const record = useMemo(() => ourRecord(all), [all]);
  const winners = useMemo(() => winnerRanking(visible, 10), [visible]);
  const buyers = useMemo(() => buyerRanking(visible, 10), [visible]);
  const ours = useMemo(() => all.filter((p) => p.vb).sort((a, b) => (b.a ?? 0) - (a.a ?? 0)), [all]);
  const awardedTotal = visible.reduce((s, p) => s + (p.a ?? 0), 0);
  const withTenderers = visible.filter((p) => p.o > 0);
  const avgTenderers = withTenderers.length ? withTenderers.reduce((s, p) => s + p.o, 0) / withTenderers.length : 0;

  const selected = all.find((p) => p.id === cmp.processId.trim());
  const comparison = selected?.a ? compareWithAward(toCents(cmp.cost), toCents(cmp.price), Math.round(selected.a * 100)) : null;

  const exportCsv = () => downloadCsv([
    ["Proceso", "Fecha", "Comprador", "Método", "Categoría", "Descripción", "Oferentes", "Ganadores", "Monto adjudicado", "Volia ofertó", "Volia ganó"],
    ...visible.map((p) => [p.id, p.d, p.b, METHOD[p.m], p.c, p.t, p.o, p.w, p.a ?? "", p.vb ? "sí" : "no", p.vw ? "sí" : "no"]),
  ], "mercado-sercop-2026.csv");

  if (error) return <section className="business-module"><div className="module-empty">{error}</div></section>;
  if (!data) return <section className="business-module"><div className="module-empty">Cargando procesos de SERCOP…</div></section>;

  return <section className="business-module">
    <div className="module-hero"><div><p className="eyebrow">INTELIGENCIA DE MERCADO</p><h2>Mercado público de insumos y dispositivos médicos</h2><p>Quién compra, quién gana y por cuánto en las contrataciones de 2026, y cómo le fue a Volia en cada proceso donde ofertó.</p></div><div className="hero-actions export-actions"><button className="secondary-button" onClick={exportCsv}>Excel/CSV</button></div></div>

    <div className="business-kpis">
      <article><span>PROCESOS DEL RUBRO</span><strong>{visible.length}</strong><small>Con los filtros actuales</small></article>
      <article><span>MONTO ADJUDICADO</span><strong>{money(awardedTotal)}</strong><small>Según SERCOP</small></article>
      <article><span>OFERENTES PROMEDIO</span><strong>{avgTenderers.toFixed(1)}</strong><small>Competencia por proceso</small></article>
      <article className={record.winRate !== null && record.winRate < 25 ? "warn" : ""}><span>VOLIA 2026</span><strong>{record.won} de {record.won + record.lost}</strong><small>Ganados entre los ya adjudicados · {record.pending} sin adjudicar</small></article>
    </div>

    <section className="business-card"><div className="section-heading"><div><p className="eyebrow">COMPARADOR</p><h3>¿A qué distancia quedó nuestro precio del ganador?</h3></div></div>
      <div className="business-form">
        <label><span>Código del proceso</span><input list="market-our-processes" value={cmp.processId} onChange={(e) => setCmp({ ...cmp, processId: e.target.value })} /></label>
        <label><span>Nuestro costo total (USD)</span><input inputMode="decimal" value={cmp.cost} onChange={(e) => setCmp({ ...cmp, cost: e.target.value })} /></label>
        <label><span>Nuestro precio ofertado (USD)</span><input inputMode="decimal" value={cmp.price} onChange={(e) => setCmp({ ...cmp, price: e.target.value })} /></label>
      </div>
      <datalist id="market-our-processes">{ours.map((p) => <option key={p.id} value={p.id}>{p.b}</option>)}</datalist>
      {!selected && <p className="module-sync-status warn">No encuentro ese proceso en los datos de 2026.</p>}
      {selected && !selected.a && <p className="module-sync-status warn">Ese proceso todavía no tiene monto adjudicado.</p>}
      {selected && comparison && <div className="module-sync-status warn" role="status">
        <strong>{comparison.verdict}</strong>
        <span>Ganó {selected.w} con {money(selected.a)}. Nuestro precio está {comparison.gapPct}% sobre ese monto; el precio ganador nos habría dejado {comparison.awardOverCostPct}% sobre nuestro costo.</span>
      </div>}
      <p className="module-note">Los montos de SERCOP pueden excluir IVA o sumar varios lotes. Confirme con el acta antes de decidir un precio.</p>
    </section>

    <section className="business-card"><div className="section-heading"><div><p className="eyebrow">HISTORIAL</p><h3>Procesos donde ofertó Volia</h3></div></div>
      <div className="inventory-list">{ours.map((p) => <article className="inventory-row" key={p.id}>
        <div className="inventory-name"><span className={`status-dot ${p.vw ? "green" : p.w ? "red" : "yellow"}`}></span><div><strong>{p.id}</strong><small>{p.b} · {METHOD[p.m]} · {p.o} oferentes</small><small>{p.t}</small></div></div>
        <div className="inventory-metrics"><div><span>RESULTADO</span><strong>{p.vw ? "Ganado" : p.w ? "Perdido" : "Sin adjudicar"}</strong><small>{p.vw ? "" : p.w}</small></div><div><span>ADJUDICADO</span><strong>{money(p.a)}</strong></div></div>
      </article>)}</div>
    </section>

    <section className="business-card"><div className="section-heading"><div><p className="eyebrow">FILTROS</p><h3>Explorar el mercado</h3></div>
      <input className="module-search" placeholder="Buscar comprador, producto, proveedor o código" value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} /></div>
      <div className="market-filters">
        {(["todas", "insumos", "trauma"] as const).map((c) => <button key={c} className={filter.category === c ? "primary-button" : "secondary-button"} onClick={() => setFilter({ ...filter, category: c })}>{c === "todas" ? "Todas" : c === "insumos" ? "Insumos y dispositivos" : "Traumatología"}</button>)}
      </div>
    </section>

    <div className="market-columns">
      <section className="business-card"><div className="section-heading"><div><p className="eyebrow">COMPETENCIA</p><h3>Quién gana (por monto)</h3></div></div>
        <ol className="market-ranking">{winners.map((w) => <li key={w.name}><span>{w.name}</span><strong>{money(w.amount)}</strong><small>{w.wins} procesos</small></li>)}</ol>
      </section>
      <section className="business-card"><div className="section-heading"><div><p className="eyebrow">CLIENTES</p><h3>Quién compra (por procesos)</h3></div></div>
        <ol className="market-ranking">{buyers.map((b) => <li key={b.buyer}><span>{b.buyer}</span><strong>{b.processes} procesos</strong><small>{money(b.awarded)} · {b.avgTenderers ?? "—"} oferentes</small></li>)}</ol>
      </section>
    </div>
    <p className="module-note">Fuente: {data.source}. Solo el 25 % de los procesos de 2026 publica ítems; por eso el análisis es por proceso y no por producto.</p>
  </section>;
}
