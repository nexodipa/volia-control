"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv } from "../lib/csv";
import HecamCenter from "./HecamCenter";
import UpcomingPurchases from "./UpcomingPurchases";
import { getSavedQuotes, type StoredQuote } from "../lib/volia-memory";
import { linkQuotesToProcesses } from "../lib/quote-market";
import { BarList, ColumnChart, Donut } from "./charts";
import { amountOf, buyerOptions, buyerRanking, compareWithAward, competitionBuckets, filterProcesses, monthlyTotals, ourRecord, provinceCounts, provinceOf, provinceTotals, winnerRanking, type MarketFilter, type MarketProcess } from "../lib/market";

const DATA_URL = "/data/mercado-sercop-2026.json";
const money = (v: number | null) => v === null ? "—" : new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
const METHOD: Record<MarketProcess["m"], string> = { SIE: "Subasta inversa", LIC: "Licitación", CAT: "Catálogo", BSU: "Bienes únicos", OTRO: "Otro" };
const toCents = (s: string) => Math.round((Number(s.replace(",", ".")) || 0) * 100);

export default function MarketCenter() {
  const [data, setData] = useState<{ source: string; generatedAt?: string; processes: MarketProcess[] } | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<MarketFilter>({ category: "todas", query: "", onlyOurs: false });
  const [cmp, setCmp] = useState({ processId: "SIE-MDMQ-2026-2503-41357", cost: "10219.34", price: "19779.24" });

  const [view, setView] = useState<"sercop" | "hecam" | "demanda">("sercop");
  const [quotes, setQuotes] = useState<StoredQuote[]>([]);
  useEffect(() => {
    const load = () => setQuotes(getSavedQuotes());
    load();
    window.addEventListener("volia-memory-updated", load);
    return () => window.removeEventListener("volia-memory-updated", load);
  }, []);

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
  const provinces = useMemo(() => provinceCounts(all), [all]);
  const buyerList = useMemo(() => buyerOptions(all), [all]);
  const filtered = !!(filter.minAmount || filter.buyer || filter.province || filter.winner || filter.query || (filter.category && filter.category !== "todas"));
  const detail = useMemo(() => [...visible].sort((a, b) => amountOf(b) - amountOf(a)).slice(0, 60), [visible]);
  const clearFilters = () => setFilter({ category: "todas", query: "", onlyOurs: false });
  const buyers = useMemo(() => buyerRanking(visible, 10), [visible]);
  const months = useMemo(() => monthlyTotals(visible), [visible]);
  const competition = useMemo(() => competitionBuckets(visible), [visible]);
  const topProvinces = useMemo(() => provinceTotals(visible, 8), [visible]);
  const ours = useMemo(() => all.filter((p) => p.vb).sort((a, b) => (b.a ?? 0) - (a.a ?? 0)), [all]);
  const links = useMemo(() => linkQuotesToProcesses(ours.map((p) => p.id), quotes), [ours, quotes]);
  const awardedTotal = visible.reduce((s, p) => s + (p.a ?? 0), 0);
  const withTenderers = visible.filter((p) => p.o > 0);
  const avgTenderers = withTenderers.length ? withTenderers.reduce((s, p) => s + p.o, 0) / withTenderers.length : 0;

  const selected = all.find((p) => p.id === cmp.processId.trim());
  const selectedLink = selected ? links.get(selected.id) : undefined;
  const comparison = selected?.a ? compareWithAward(toCents(cmp.cost), toCents(cmp.price), Math.round(selected.a * 100)) : null;

  const exportCsv = () => downloadCsv([
    ["Proceso", "Fecha", "Comprador", "Método", "Categoría", "Descripción", "Oferentes", "Ganadores", "Monto adjudicado", "Volia ofertó", "Volia ganó"],
    ...visible.map((p) => [p.id, p.d, p.b, METHOD[p.m], p.c, p.t, p.o, p.w, p.a ?? "", p.vb ? "sí" : "no", p.vw ? "sí" : "no"]),
  ], "mercado-sercop-2026.csv");

  if (error) return <section className="business-module"><div className="module-empty">{error}</div></section>;
  if (!data) return <section className="business-module"><div className="module-empty">Cargando procesos de SERCOP…</div></section>;

  const tabs = <div className="finance-nav market-tabs" role="tablist"><button role="tab" aria-selected={view === "sercop"} className={view === "sercop" ? "active" : ""} onClick={() => setView("sercop")}>Procesos SERCOP</button><button role="tab" aria-selected={view === "hecam"} className={view === "hecam" ? "active" : ""} onClick={() => setView("hecam")}>HECAM 2026</button><button role="tab" aria-selected={view === "demanda"} className={view === "demanda" ? "active" : ""} onClick={() => setView("demanda")}>Próximas compras</button></div>;
  if (view === "demanda") return <section className="business-module"><div className="module-hero"><div><p className="eyebrow">Inteligencia de mercado</p><h2>Próximas compras de los clientes</h2><p>Cuándo se quedará sin cada producto cada unidad de salud, para preparar la proforma antes que la competencia.</p></div></div>{tabs}<UpcomingPurchases /></section>;
  if (view === "hecam") return <section className="business-module"><div className="module-hero"><div><p className="eyebrow">Inteligencia de mercado</p><h2>Programación de compras del HECAM 2026</h2><p>Qué va a comprar el Hospital Carlos Andrade Marín, en qué cantidad, a qué precio referencial y quién ganó lo ya contratado.</p></div></div>{tabs}<HecamCenter /></section>;
  return <section className="business-module">
    <div className="module-hero"><div><p className="eyebrow">Inteligencia de mercado</p><h2>Mercado público de insumos y dispositivos médicos</h2><p>Quién compra, quién gana y por cuánto en las contrataciones de 2026, y cómo le fue a Volia en cada proceso donde ofertó.</p></div><div className="hero-actions export-actions"><button className="secondary-button" onClick={exportCsv}>Excel/CSV</button></div></div>

    {tabs}

    <div className="business-kpis">
      <article><span>Procesos del rubro</span><strong>{visible.length}</strong><small>Con los filtros actuales</small></article>
      <article><span>Monto adjudicado</span><strong>{money(awardedTotal)}</strong><small>Según SERCOP</small></article>
      <article><span>Oferentes promedio</span><strong>{avgTenderers.toFixed(1)}</strong><small>Competencia por proceso</small></article>
      <article className={record.winRate !== null && record.winRate < 25 ? "warn" : ""}><span>Volia 2026</span><strong>{record.won} de {record.won + record.lost}</strong><small>Ganados entre los ya adjudicados · {record.pending} sin adjudicar</small></article>
    </div>

    {visible.length > 0 && <section className="business-card"><div className="section-heading"><div><p className="eyebrow">Panorama</p><h3>El mercado en gráficas{filtered ? " (con los filtros actuales)" : ""}</h3></div></div>
      <div className="stat-grid">
        {months.length > 1 && <section className="stat-panel"><h4>Monto adjudicado por mes</h4><ColumnChart label="Monto adjudicado por mes en dólares" data={months.map((m) => ({ label: m.label, values: [m.amount] }))} series={[{ name: "Monto adjudicado", tone: "green" }]} format={(n) => `$${new Intl.NumberFormat("es-EC", { notation: "compact", maximumFractionDigits: 1 }).format(n)}`} /><p className="module-note">Octubre suele estar incompleto: el archivo del SERCOP se corta a mitad de mes.</p></section>}
        {competition.some((b) => b.count > 0) && <section className="stat-panel"><h4>Cuánta competencia hay por proceso</h4><BarList tone="sun" items={competition.map((b) => ({ label: b.label, value: b.count, display: `${b.count} proceso(s)` }))} /><p className="module-note">{competition[0].count ? `${competition[0].count} proceso(s) tuvieron un solo oferente: ahí hay más espacio para entrar con buen precio.` : "Ningún proceso de esta selección tuvo un solo oferente."}</p></section>}
        {topProvinces.length > 0 && <section className="stat-panel"><h4>Dónde se compra más (por monto)</h4><BarList items={topProvinces.map((p) => ({ label: p.name, value: p.amount, display: money(p.amount), hint: `${p.count} proceso(s)` }))} /></section>}
        {record.won + record.lost + record.pending > 0 && <section className="stat-panel"><h4>Cómo le fue a Volia en 2026</h4><Donut label="Resultados de Volia en 2026" center={record.winRate === null ? "" : `${Math.round(record.winRate)} %`} slices={[{ label: "Ganados", value: record.won, tone: "green" }, { label: "Perdidos", value: record.lost, tone: "coral" }, { label: "Sin adjudicar", value: record.pending, tone: "gray" }]} /></section>}
      </div>
    </section>}

    <section className="business-card"><div className="section-heading"><div><p className="eyebrow">Comparador</p><h3>¿A qué distancia quedó nuestro precio del ganador?</h3></div></div>
      <div className="business-form">
        <label><span>Código del proceso</span><input list="market-our-processes" value={cmp.processId} onChange={(e) => setCmp({ ...cmp, processId: e.target.value })} /></label>
        <label><span>Nuestro costo total (USD)</span><input inputMode="decimal" value={cmp.cost} onChange={(e) => setCmp({ ...cmp, cost: e.target.value })} /></label>
        <label><span>Nuestro precio ofertado (USD)</span><input inputMode="decimal" value={cmp.price} onChange={(e) => setCmp({ ...cmp, price: e.target.value })} /></label>
      </div>
      {selectedLink && <div className="inline-actions"><button type="button" className="secondary-button" onClick={() => setCmp({ ...cmp, cost: selectedLink.costCents !== null ? (selectedLink.costCents / 100).toFixed(2) : cmp.cost, price: (selectedLink.netCents / 100).toFixed(2) })}>Usar mi cotización {selectedLink.number} (subtotal sin IVA)</button></div>}
      <datalist id="market-our-processes">{ours.map((p) => <option key={p.id} value={p.id}>{p.b}</option>)}</datalist>
      {!selected && <p className="module-sync-status warn">No encuentro ese proceso en los datos de 2026.</p>}
      {selected && !selected.a && <p className="module-sync-status warn">Ese proceso todavía no tiene monto adjudicado.</p>}
      {selected && comparison && <div className="module-sync-status warn" role="status">
        <strong>{comparison.verdict}</strong>
        <span>Ganó {selected.w} con {money(selected.a)}. Nuestro precio está {comparison.gapPct}% sobre ese monto; el precio ganador nos habría dejado {comparison.awardOverCostPct}% sobre nuestro costo.</span>
      </div>}
      <p className="module-note">Los montos de SERCOP pueden excluir IVA o sumar varios lotes. Confirme con el acta antes de decidir un precio. Para que una cotización aparezca aquí, escriba el código del proceso en «Contrato / proceso» del Cotizador y guárdela.</p>
    </section>

    <section className="business-card"><div className="section-heading"><div><p className="eyebrow">Historial</p><h3>Procesos donde ofertó Volia</h3></div></div>
      <div className="inventory-list">{ours.map((p) => <article className="inventory-row" key={p.id}>
        <div className="inventory-name"><span className={`status-dot ${p.vw ? "green" : p.w ? "red" : "yellow"}`}></span><div><strong>{p.id}</strong><small>{p.b} · {METHOD[p.m]} · {p.o} oferentes</small><small>{p.t}</small></div></div>
        <div className="inventory-metrics"><div><span>Resultado</span><strong>{p.vw ? "Ganado" : p.w ? "Perdido" : "Sin adjudicar"}</strong><small>{p.vw ? "" : p.w}</small></div><div><span>Adjudicado</span><strong>{money(p.a)}</strong></div>{(() => { const l = links.get(p.id); if (!l) return null; const gap = p.a ? Math.round(((l.netCents / 100 - p.a) / p.a) * 1000) / 10 : null; return <div><span>Nuestra oferta</span><strong>{money(l.netCents / 100)}</strong><small>{l.number}{gap !== null ? ` · ${gap > 0 ? "+" : ""}${gap}% vs adjudicado` : ""}</small></div>; })()}</div>
      </article>)}</div>
    </section>

    <section className="business-card"><div className="section-heading"><div><p className="eyebrow">Filtros</p><h3>Explorar el mercado</h3></div>
      <input className="module-search" placeholder="Buscar comprador, producto, proveedor o código" value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} /></div>
      <div className="market-filters">
        {(["todas", "insumos", "trauma"] as const).map((c) => <button key={c} className={filter.category === c ? "primary-button" : "secondary-button"} onClick={() => setFilter({ ...filter, category: c })}>{c === "todas" ? "Todas" : c === "insumos" ? "Insumos y dispositivos" : "Traumatología"}</button>)}
      </div>
      <div className="market-filters" role="group" aria-label="Monto mínimo">
        {([[0, "Cualquier monto"], [10000, "Más de $10 mil"], [50000, "Más de $50 mil"]] as const).map(([v, label]) => <button key={v} className={(filter.minAmount ?? 0) === v ? "primary-button" : "secondary-button"} onClick={() => setFilter({ ...filter, minAmount: v || undefined })}>{label}</button>)}
      </div>
      <div className="business-form">
        <label><span>Provincia</span><select value={filter.province ?? ""} onChange={(e) => setFilter({ ...filter, province: e.target.value || undefined })}><option value="">Todas</option>{provinces.map((x) => <option key={x.name} value={x.name}>{x.name} ({x.count})</option>)}</select></label>
        <label><span>Hospital o entidad</span><select value={filter.buyer ?? ""} onChange={(e) => setFilter({ ...filter, buyer: e.target.value || undefined })}><option value="">Todas</option>{buyerList.map((x) => <option key={x.name} value={x.name}>{x.name} ({x.count})</option>)}</select></label>
      </div>
      <p className="module-note">La provincia es la que publica el SERCOP para la entidad compradora; cuando no la trae, se deduce de la ciudad que aparece en su nombre. Las entidades sin ninguna de las dos no entran en este filtro. El monto es el adjudicado y, si el proceso aún no se adjudica, el presupuesto referencial.</p>
      {filtered && <div className="inline-actions"><button type="button" className="secondary-button" onClick={clearFilters}>Quitar filtros</button></div>}
    </section>

    <div className="market-columns">
      <section className="business-card"><div className="section-heading"><div><p className="eyebrow">Competencia</p><h3>Quién gana (por monto)</h3></div></div>
        <ol className="market-ranking">{winners.map((w) => <li key={w.name}><span><button type="button" className="link-button" aria-pressed={filter.winner === w.name} onClick={() => setFilter({ ...filter, winner: filter.winner === w.name ? undefined : w.name })}>{w.name}</button></span><strong>{money(w.amount)}</strong><small>{w.wins} procesos · toca el nombre para ver cada proceso</small></li>)}</ol>
      </section>
      <section className="business-card"><div className="section-heading"><div><p className="eyebrow">Clientes</p><h3>Quién compra (por procesos)</h3></div></div>
        <ol className="market-ranking">{buyers.map((b) => <li key={b.buyer}><span>{b.buyer}</span><strong>{b.processes} procesos</strong><small>{money(b.awarded)} · {b.avgTenderers ?? "—"} oferentes</small></li>)}</ol>
      </section>
    </div>
    {filtered && <section className="business-card"><div className="section-heading"><div><p className="eyebrow">Detalle</p><h3>{filter.winner ? `Procesos adjudicados a ${filter.winner}` : "Procesos con los filtros actuales"}</h3></div><span className="module-note">{visible.length > detail.length ? `Los ${detail.length} de mayor monto, de ${visible.length}` : `${visible.length} procesos`}</span></div>
      <div className="inventory-list">{detail.map((p) => <article className="inventory-row" key={p.id}>
        <div className="inventory-name"><span className={`status-dot ${p.vw ? "green" : p.w ? "red" : "yellow"}`}></span><div><strong>{p.id}</strong><small>{p.b}{provinceOf(p) ? ` · ${provinceOf(p)}` : ""} · {METHOD[p.m]} · {p.o} oferentes</small><small>{p.t}</small></div></div>
        <div className="inventory-metrics"><div><span>{p.a ? "Adjudicado" : "Presupuesto"}</span><strong>{money(p.a ?? p.p)}</strong></div><div><span>Ganador</span><strong>{p.w || "Sin adjudicar"}</strong></div></div>
      </article>)}</div>
      {!visible.length && <div className="module-empty">Ningún proceso cumple estos filtros.</div>}
    </section>}

    <p className="module-note">Fuente: {data.source}{data.generatedAt ? `, actualizado el ${data.generatedAt}` : ""}. Para actualizar, descargue el archivo del mes y haga doble clic en «actualizar-mercado» en la carpeta de Volia Control. Solo el 25 % de los procesos de 2026 publica ítems; por eso el análisis es por proceso y no por producto.</p>
  </section>;
}
