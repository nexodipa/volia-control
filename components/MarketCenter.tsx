"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv } from "../lib/csv";
import HecamCenter from "./HecamCenter";
import UpcomingPurchases from "./UpcomingPurchases";
import { getSavedQuotes, type StoredQuote } from "../lib/volia-memory";
import { linkQuotesToProcesses } from "../lib/quote-market";
import { BarList, ColumnChart, Donut } from "./charts";
import { activeFilters, buyerRanking, clearFilterKey, compareWithAward, competitionBuckets, facetOptions, filterProcesses, fixMonthRange, freshOpportunities, monthlyTotals, ourRecord, parseAmount, provinceOf, provinceTotals, sortProcesses, toggleIn, usualSegment, voliaProfile, winnerRanking, type MarketFilter, type MarketProcess, type SortKey } from "../lib/market";

const DATA_URL = "/data/mercado-sercop-2026.json";
const money = (v: number | null) => v === null ? "—" : new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
const METHOD: Record<MarketProcess["m"], string> = { SIE: "Subasta inversa", LIC: "Licitación", CAT: "Catálogo", BSU: "Bienes únicos", OTRO: "Otro" };
const toCents = (s: string) => Math.round((Number(s.replace(",", ".")) || 0) * 100);

export default function MarketCenter() {
  const [data, setData] = useState<{ source: string; generatedAt?: string; processes: MarketProcess[] } | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<MarketFilter>({ category: "todas", query: "", onlyOurs: false });
  const [cmp, setCmp] = useState({ processId: "SIE-MDMQ-2026-2503-41357", cost: "10219.34", price: "19779.24" });

  const [sort, setSort] = useState<SortKey>("monto");
  const [shown, setShown] = useState(30);

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
    fetch(DATA_URL, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Error ${r.status}`))))
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // Viene de Inicio: entra directo a lo que solemos ofertar, lo más reciente primero.
        let preset = false;
        try { preset = sessionStorage.getItem("volia-market-preset") === "usual"; if (preset) sessionStorage.removeItem("volia-market-preset"); } catch { /* sin almacenamiento */ }
        const prof = preset ? voliaProfile(d.processes ?? []) : null;
        const fresh = prof ? freshOpportunities(d.processes ?? []) : null;
        if (prof) { setFilter({ ...usualSegment(prof), query: "", onlyOurs: false, since: fresh?.since }); setSort("fecha"); }
      })
      .catch((e) => { if (!cancelled) setError(`No se pudieron cargar los datos de mercado (${e.message}).`); });
    return () => { cancelled = true; };
  }, []);

  const all = useMemo(() => data?.processes ?? [], [data]);
  const visible = useMemo(() => filterProcesses(all, filter), [all, filter]);
  const record = useMemo(() => ourRecord(all), [all]);
  const winners = useMemo(() => winnerRanking(visible, 10), [visible]);
  const provinceOpts = useMemo(() => facetOptions(all, filter, "province"), [all, filter]);
  const buyerOpts = useMemo(() => facetOptions(all, filter, "buyer"), [all, filter]);
  const methodOpts = useMemo(() => facetOptions(all, filter, "method"), [all, filter]);
  const categoryOpts = useMemo(() => facetOptions(all, filter, "category"), [all, filter]);
  const profile = useMemo(() => voliaProfile(all), [all]);
  const usual = useMemo(() => (profile ? usualSegment(profile) : null), [profile]);
  const active = useMemo(() => activeFilters(filter), [filter]);
  const monthKeys = useMemo(() => monthlyTotals(all).map((m) => m.month), [all]);
  const sorted = useMemo(() => sortProcesses(visible, sort), [visible, sort]);
  const clearFilters = () => { setFilter({ category: "todas", query: "", onlyOurs: false }); setShown(30); };
  const change = (patch: MarketFilter) => { setFilter((f) => ({ ...f, ...patch })); setShown(30); };
  const num = parseAmount;
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
    <div className="module-hero"><div><h2>Mercado público de insumos y dispositivos médicos</h2><p>Quién compra, quién gana y por cuánto en 2026. Filtra por lo que Volia suele ofertar y mira cómo le fue.</p></div><div className="hero-actions export-actions"><button className="secondary-button" onClick={exportCsv}>Excel/CSV</button></div></div>

    {tabs}

    <section className="business-card mk-panel" aria-label="Filtros del mercado">
      <div className="mk-panel-top">
        <input className="module-search" placeholder="Buscar comprador, producto, proveedor o código" value={filter.query} onChange={(e) => change({ query: e.target.value })} />
        {profile && usual && <button type="button" className="primary-button mk-usual" onClick={() => { setFilter({ ...usual, query: "", onlyOurs: false }); setShown(30); }}>Solo lo que solemos ofertar</button>}
      </div>
      {profile && <p className="mk-profile">Volia ha ofertado en {profile.bids} procesos: {profile.methods.map((m) => METHOD[m].toLowerCase()).join(" y ")}, sobre todo en {profile.provinces.slice(0, 2).map((x) => x.name).join(" y ")}, con montos centrales de {money(profile.amountLow)} a {money(profile.amountHigh)}{profile.medianTenderers ? ` y unos ${profile.medianTenderers} oferentes` : ""}. El botón aplica esos criterios y puedes ajustarlos abajo.</p>}
      <div className="mk-grid">
        <div className="mk-multi"><span>Provincia</span>
          <details>
            <summary>{filter.provinces?.length ? filter.provinces.join(", ") : "Todas"}</summary>
            <div className="mk-multi-list">
              {provinceOpts.map((x) => <label key={x.name}><input type="checkbox" checked={!!filter.provinces?.includes(x.name)} onChange={() => change({ province: undefined, provinces: toggleIn(filter.provinces, x.name), buyer: undefined })} />{x.name} <small>({x.count})</small></label>)}
              {(filter.provinces ?? []).filter((n) => !provinceOpts.some((x) => x.name === n)).map((n) => <label key={n}><input type="checkbox" checked onChange={() => change({ provinces: toggleIn(filter.provinces, n), buyer: undefined })} />{n} <small>(0)</small></label>)}
            </div>
          </details>
        </div>
        <label><span>Hospital o entidad</span><select value={filter.buyer ?? ""} onChange={(e) => change({ buyer: e.target.value || undefined })}><option value="">Todas ({buyerOpts.length})</option>{buyerOpts.map((x) => <option key={x.name} value={x.name}>{x.name} ({x.count})</option>)}</select></label>
        <label><span>Monto desde (USD)</span><input inputMode="numeric" placeholder="Sin mínimo" value={filter.minAmount ?? ""} onChange={(e) => change({ minAmount: num(e.target.value) })} /></label>
        <label><span>Monto hasta (USD)</span><input inputMode="numeric" placeholder="Sin máximo" value={filter.maxAmount ?? ""} onChange={(e) => change({ maxAmount: num(e.target.value) })} /></label>
      </div>
      <details className="mk-more"><summary>Más filtros: rubro, método, competencia, estado y período</summary>
      <div className="mk-grid">
        <label><span>Rubro</span><select value={filter.category ?? "todas"} onChange={(e) => change({ category: e.target.value as MarketFilter["category"] })}><option value="todas">Todos</option>{categoryOpts.map((x) => <option key={x.name} value={x.name}>{x.name === "trauma" ? "Traumatología" : "Insumos y dispositivos"} ({x.count})</option>)}</select></label>
        <div className="mk-multi"><span>Método</span>
          <details>
            <summary>{filter.methods?.length ? filter.methods.map((m) => METHOD[m]).join(", ") : "Todos"}</summary>
            <div className="mk-multi-list">
              {methodOpts.map((x) => <label key={x.name}><input type="checkbox" checked={!!filter.methods?.includes(x.name as MarketProcess["m"])} onChange={() => change({ methods: toggleIn(filter.methods, x.name as MarketProcess["m"]) })} />{METHOD[x.name as MarketProcess["m"]]} <small>({x.count})</small></label>)}
            </div>
          </details>
        </div>
        <label><span>Competencia</span><select value={`${filter.minTenderers ?? ""}-${filter.maxTenderers ?? ""}`} onChange={(e) => { const [a, b] = e.target.value.split("-"); change({ minTenderers: a ? Number(a) : undefined, maxTenderers: b ? Number(b) : undefined }); }}><option value="-">Cualquiera</option><option value="1-2">Poca: 1 a 2 oferentes</option><option value="3-5">Media: 3 a 5 oferentes</option><option value="6-">Mucha: 6 o más</option></select></label>
        <label><span>Estado</span><select value={filter.awarded ?? ""} onChange={(e) => change({ awarded: (e.target.value || undefined) as MarketFilter["awarded"] })}><option value="">Todos</option><option value="si">Adjudicados</option><option value="no">Sin adjudicar</option></select></label>
        <label><span>Publicados desde</span><select value={filter.from ?? ""} onChange={(e) => change(fixMonthRange(e.target.value || undefined, filter.to, "from"))}><option value="">Inicio</option>{monthKeys.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
        <label><span>hasta</span><select value={filter.to ?? ""} onChange={(e) => change(fixMonthRange(filter.from, e.target.value || undefined, "to"))}><option value="">Hoy</option>{monthKeys.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
      </div>
      </details>
      {active.length > 0 && <div className="mk-chips" aria-label="Filtros activos">{active.map((a) => <button key={a.key} type="button" className="mk-chip" onClick={() => { setFilter((f) => clearFilterKey(f, a.key)); setShown(30); }} aria-label={`Quitar ${a.label}`}>{a.label}<span aria-hidden="true"> ×</span></button>)}<button type="button" className="link-button" onClick={clearFilters}>Quitar todos</button></div>}
      <p className="module-note">La provincia es la que publica el SERCOP para la entidad compradora; si no la trae, se deduce del nombre. El monto es el adjudicado; el presupuesto referencial casi nunca se publica, así que al filtrar por monto quedan fuera los procesos sin adjudicar.</p>
    </section>

    <section className="mk-results" aria-live="polite">
      <div className="mk-summary">
        <div><strong>{visible.length}</strong><span>procesos</span></div>
        <div><strong>{money(awardedTotal)}</strong><span>adjudicado</span></div>
        <div><strong>{avgTenderers ? avgTenderers.toFixed(1) : "—"}</strong><span>oferentes en promedio</span></div>
        <div><strong>{visible.filter((p) => p.vb).length}</strong><span>donde ofertó Volia</span></div>
        <label className="mk-sort"><span>Ordenar</span><select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}><option value="monto">Mayor monto</option><option value="fecha">Más recientes</option><option value="oferentes">Más oferentes</option></select></label>
      </div>
      <div className="mk-list">
        {sorted.slice(0, shown).map((p) => <article className="mk-row" key={p.id}>
          <div className="mk-row-main"><small>{p.id} · {METHOD[p.m]}{provinceOf(p) ? ` · ${provinceOf(p)}` : ""} · {p.d.slice(0, 10)}</small><strong>{p.b}</strong><span>{p.t}</span></div>
          <div className="mk-row-side"><strong>{money(p.a ?? p.p)}</strong><small>{p.o ? `${p.o} oferentes` : "sin oferentes informados"}</small><small>{p.w ? `Ganó ${p.w}` : "Sin adjudicar"}</small>{p.vb && <em className={`mk-tag ${p.vw ? "won" : ""}`}>{p.vw ? "Volia ganó" : "Volia ofertó"}</em>}</div>
        </article>)}
        {!visible.length && <div className="module-empty">Ningún proceso cumple estos filtros. Quita alguno de los chips de arriba.</div>}
      </div>
      {visible.length > shown && <div className="inline-actions"><button type="button" className="secondary-button" onClick={() => setShown((n) => n + 30)}>Ver 30 más ({visible.length - shown} restantes)</button></div>}
    </section>

    <details className="market-fold"><summary>Gráficas y rankings de esta selección</summary>
    {visible.length > 0 && <div className="mk-fold-body">
      <div className="stat-grid">
        {months.length > 1 && <section className="stat-panel"><h4>Monto adjudicado por mes</h4><ColumnChart label="Monto adjudicado por mes en dólares" data={months.map((m) => ({ label: m.label, values: [m.amount] }))} series={[{ name: "Monto adjudicado", tone: "green" }]} format={(n) => `$${new Intl.NumberFormat("es-EC", { notation: "compact", maximumFractionDigits: 1 }).format(n)}`} /><p className="module-note">Octubre suele estar incompleto: el archivo del SERCOP se corta a mitad de mes.</p></section>}
        {competition.some((b) => b.count > 0) && <section className="stat-panel"><h4>Cuánta competencia hay por proceso</h4><BarList tone="sun" items={competition.map((b) => ({ label: b.label, value: b.count, display: `${b.count} proceso(s)` }))} /><p className="module-note">{competition[0].count ? `${competition[0].count} proceso(s) tuvieron un solo oferente: ahí hay más espacio para entrar con buen precio.` : "Ningún proceso de esta selección tuvo un solo oferente."}</p></section>}
        {topProvinces.length > 0 && <section className="stat-panel"><h4>Dónde se compra más (por monto)</h4><BarList items={topProvinces.map((p) => ({ label: p.name, value: p.amount, display: money(p.amount), hint: `${p.count} proceso(s)` }))} /></section>}
        {record.won + record.lost + record.pending > 0 && <section className="stat-panel"><h4>Cómo le fue a Volia en 2026</h4><Donut label="Resultados de Volia en 2026" center={record.winRate === null ? "" : `${Math.round(record.winRate)} %`} slices={[{ label: "Ganados", value: record.won, tone: "green" }, { label: "Perdidos", value: record.lost, tone: "coral" }, { label: "Sin adjudicar", value: record.pending, tone: "gray" }]} /></section>}
      </div>
    </div>}
    <div className="market-columns">
      <section className="business-card"><div className="section-heading"><div><p className="eyebrow">Competencia</p><h3>Quién gana (por monto)</h3></div></div>
        <ol className="market-ranking">{winners.map((w) => <li key={w.name}><span><button type="button" className="link-button" aria-pressed={filter.winner === w.name} onClick={() => setFilter({ ...filter, winner: filter.winner === w.name ? undefined : w.name })}>{w.name}</button></span><strong>{money(w.amount)}</strong><small>{w.wins} procesos · toca el nombre para ver cada proceso</small></li>)}</ol>
      </section>
      <section className="business-card"><div className="section-heading"><div><p className="eyebrow">Clientes</p><h3>Quién compra (por procesos)</h3></div></div>
        <ol className="market-ranking">{buyers.map((b) => <li key={b.buyer}><span>{b.buyer}</span><strong>{b.processes} procesos</strong><small>{money(b.awarded)} · {b.avgTenderers ?? "—"} oferentes</small></li>)}</ol>
      </section>
    </div>
    </details>
    <details className="market-fold"><summary>Comparar nuestro precio con el ganador</summary>
    <div className="mk-fold-body">
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
    </div>
    </details>
    <details className="market-fold"><summary>Procesos donde ofertó Volia ({ours.length})</summary>
    <div className="mk-fold-body">
      <div className="inventory-list">{ours.map((p) => <article className="inventory-row" key={p.id}>
        <div className="inventory-name"><span className={`status-dot ${p.vw ? "green" : p.w ? "red" : "yellow"}`}></span><div><strong>{p.id}</strong><small>{p.b} · {METHOD[p.m]} · {p.o} oferentes</small><small>{p.t}</small></div></div>
        <div className="inventory-metrics"><div><span>Resultado</span><strong>{p.vw ? "Ganado" : p.w ? "Perdido" : "Sin adjudicar"}</strong><small>{p.vw ? "" : p.w}</small></div><div><span>Adjudicado</span><strong>{money(p.a)}</strong></div>{(() => { const l = links.get(p.id); if (!l) return null; const gap = p.a ? Math.round(((l.netCents / 100 - p.a) / p.a) * 1000) / 10 : null; return <div><span>Nuestra oferta</span><strong>{money(l.netCents / 100)}</strong><small>{l.number}{gap !== null ? ` · ${gap > 0 ? "+" : ""}${gap}% vs adjudicado` : ""}</small></div>; })()}</div>
      </article>)}</div>
    </div>
    </details>

    <p className="module-note">Fuente: {data.source}{data.generatedAt ? `, actualizado el ${data.generatedAt}` : ""}. Para actualizar, descargue el archivo del mes y haga doble clic en «actualizar-mercado» en la carpeta de Volia Control. Solo el 25 % de los procesos de 2026 publica ítems; por eso el análisis es por proceso y no por producto.</p>
  </section>;
}
