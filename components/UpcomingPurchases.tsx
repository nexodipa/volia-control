"use client";

import { useEffect, useMemo, useState } from "react";
import { businessIsoDate } from "../lib/date-utils";
import { daysUntil } from "../lib/business-alerts";

type Demand = { cliente: string; item: string; presentacion: string; rotacion_mensual: number; stock: number; corte: string; agotamiento: string; archivo: string };
const qty = (v: number) => new Intl.NumberFormat("es-EC", { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v);
const date = (iso: string) => new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T12:00:00`));

/** Cuándo se quedará sin cada producto cada cliente, según su último informe de stock y rotación mensual. */
export default function UpcomingPurchases() {
  const [items, setItems] = useState<Demand[] | null>(null);
  const [horizon, setHorizon] = useState(90);
  const [query, setQuery] = useState("");
  const today = businessIsoDate();
  useEffect(() => {
    let alive = true;
    fetch("/data/proximas-compras.json", { cache: "force-cache" }).then((r) => (r.ok ? r.json() : { items: [] })).then((d) => { if (alive) setItems(d.items ?? []); }).catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);
  const list = useMemo(() => (items ?? [])
    .filter((i) => daysUntil(i.agotamiento, today) <= horizon)
    .filter((i) => !query.trim() || `${i.item} ${i.cliente}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.agotamiento.localeCompare(b.agotamiento)), [items, horizon, query, today]);
  if (!items) return <div className="module-empty">Cargando informes de abastecimiento…</div>;
  const clients = [...new Set(items.map((i) => i.cliente))];
  const oldest = items.reduce((m, i) => (i.corte < m ? i.corte : m), today);

  return <section className="business-card">
    <div className="section-heading"><div><p className="eyebrow">Demanda de clientes</p><h3>Quién se va a quedar sin qué</h3></div></div>
    <p className="module-note">A partir del stock y la rotación mensual que cada unidad de salud registra en sus informes de abastecimiento. Hoy hay datos de {clients.join(", ")}. Un producto que «ya se agotó» según el informe probablemente ya se compró o está por comprarse: confírmelo con el cliente.</p>
    <div className="business-form hecam-filters">
      <label><span>Buscar</span><input value={query} placeholder="Ej. guantes, anestesia, resina" onChange={(e) => setQuery(e.target.value)} /></label>
      <label><span>Se agota en</span><select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}><option value={30}>los próximos 30 días o antes</option><option value={90}>los próximos 90 días o antes</option><option value={180}>los próximos 6 meses o antes</option><option value={100000}>cualquier fecha</option></select></label>
    </div>
    <div className="hecam-list">
      {list.slice(0, 80).map((i, k) => { const d = daysUntil(i.agotamiento, today); return <article key={k} className="hecam-row">
        <div><strong>{i.item}</strong><small>{i.cliente} · {i.presentacion}</small></div>
        <div><span>Consume al mes</span><strong>{qty(i.rotacion_mensual)}</strong><small>Stock {qty(i.stock)} al {date(i.corte)}</small></div>
        <div><span>Se agota</span><strong className={d < 0 ? "negative" : ""}>{d < 0 ? "Ya agotado" : date(i.agotamiento)}</strong><small>{d < 0 ? `desde ${date(i.agotamiento)}` : `en ${d} días`}</small></div>
        <div><span>Para 3 meses</span><strong>{qty(i.rotacion_mensual * 3)}</strong><small>cantidad orientativa a ofertar</small></div>
      </article>; })}
      {!list.length && <div className="module-empty">Nada se agota en ese plazo según los informes disponibles.</div>}
    </div>
    {oldest < today && <p className="module-note">El informe más antiguo es del {date(oldest)}. Pida a cada cliente su informe de abastecimiento actualizado para que esta lista sea confiable.</p>}
  </section>;
}
