"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv } from "../lib/csv";
import { contractorRanking, opportunities, specialtyGroups, type HecamItem } from "../lib/hecam";

const usd = (v?: number) => v === undefined ? "—" : new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: v < 10 ? 4 : 0 }).format(v);
const qty = (v?: number) => v === undefined ? "—" : new Intl.NumberFormat("es-EC", { maximumFractionDigits: 0 }).format(v);

/** Programación 2026 del HECAM: qué va a comprar, a qué precio referencial y quién ganó lo ya contratado. */
export default function HecamCenter() {
  const [items, setItems] = useState<HecamItem[] | null>(null);
  const [error, setError] = useState("");
  const [f, setF] = useState({ query: "", especialidad: "Traumatología", tipo: "", soloPendientes: true });
  const [shown, setShown] = useState(40);

  useEffect(() => {
    let alive = true;
    fetch("/data/hecam-2026.json", { cache: "force-cache" }).then((r) => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((d) => { if (alive) setItems(d.items); }).catch((e) => { if (alive) setError(`No se pudo cargar la programación del HECAM (${e.message}).`); });
    return () => { alive = false; };
  }, []);

  const groups = useMemo(() => items ? specialtyGroups(items) : [], [items]);
  const list = useMemo(() => items ? opportunities(items, f) : [], [items, f]);
  const ranking = useMemo(() => items ? contractorRanking(items, 10) : [], [items]);
  const total = list.reduce((s, i) => s + (i.prt ?? 0), 0);
  const infima = list.filter((i) => i.t === "Ínfima Cuantía");

  if (error) return <div className="module-empty">{error}</div>;
  if (!items) return <div className="module-empty">Cargando la programación del HECAM…</div>;

  return <>
    <div className="business-kpis">
      <article><span>Ítems con estos filtros</span><strong>{list.length}</strong><small>De {items.length} programados para 2026</small></article>
      <article><span>Presupuesto referencial</span><strong>{usd(total)}</strong><small>Suma de los ítems filtrados</small></article>
      <article><span>Por ínfima cuantía</span><strong>{infima.length}</strong><small>{usd(infima.reduce((s, i) => s + (i.prt ?? 0), 0))} sin subasta, compra directa</small></article>
      <article><span>Ya adjudicados en total</span><strong>{items.filter((i) => i.g).length}</strong><small>Con precio y proveedor ganador</small></article>
    </div>

    <section className="business-card"><div className="section-heading"><div><p className="eyebrow">Oportunidades</p><h3>Lo que el HECAM va a comprar en 2026</h3></div><button className="secondary-button" onClick={() => downloadCsv([["Código IESS", "Nombre", "Presentación", "Especialidad", "Consumo mensual", "Cantidad 12 meses", "Precio referencial", "Presupuesto", "Tipo de proceso", "Precio adjudicado", "Proveedor"], ...list.map((i) => [i.c ?? "", i.n, i.u ?? "", i.e ?? "", i.cm ?? "", i.q ?? "", i.pur ?? "", i.prt ?? "", i.t ?? "", i.pua ?? "", i.g ?? ""])], "hecam-2026-oportunidades.csv")}>Excel/CSV</button></div>
      <div className="business-form hecam-filters">
        <label><span>Buscar</span><input value={f.query} placeholder="Ej. placa, tornillo, guantes" onChange={(e) => { setF({ ...f, query: e.target.value }); setShown(40); }} /></label>
        <label><span>Especialidad</span><select value={f.especialidad} onChange={(e) => { setF({ ...f, especialidad: e.target.value }); setShown(40); }}><option value="">Todas</option>{groups.map((g) => <option key={g} value={g}>{g}</option>)}</select></label>
        <label><span>Tipo de proceso</span><select value={f.tipo} onChange={(e) => { setF({ ...f, tipo: e.target.value }); setShown(40); }}><option value="">Todos</option><option>Ínfima Cuantía</option><option>Subasta Inversa</option><option>Régimen Especial</option></select></label>
        <label className="check-row"><input type="checkbox" checked={f.soloPendientes} onChange={(e) => setF({ ...f, soloPendientes: e.target.checked })} /><span>Solo lo que aún no tiene proveedor</span></label>
      </div>
      <div className="hecam-list">
        {list.slice(0, shown).map((i, k) => <article key={`${i.c}-${k}`} className="hecam-row">
          <div><strong>{i.n}</strong><small>{[i.e, i.u, i.c && `IESS ${i.c}`].filter(Boolean).join(" · ")}</small></div>
          <div><span>Cantidad 12 meses</span><strong>{qty(i.q)}</strong><small>{i.cm ? `${qty(i.cm)} al mes` : ""}</small></div>
          <div><span>Precio referencial</span><strong>{usd(i.pur)}</strong><small>{i.t ?? ""}</small></div>
          <div><span>Presupuesto</span><strong>{usd(i.prt)}</strong><small>{i.g ? `Ganó ${i.g} a ${usd(i.pua)}` : "Sin adjudicar"}</small></div>
        </article>)}
        {!list.length && <div className="module-empty">Ningún ítem coincide. Pruebe con otra especialidad o quite «Solo lo que aún no tiene proveedor».</div>}
      </div>
      {list.length > shown && <button className="secondary-button" onClick={() => setShown(shown + 60)}>Ver {Math.min(60, list.length - shown)} más</button>}
      <p className="module-note">Fuente: catálogo y programación de dispositivos médicos HECAM 2026, corte al 10 de septiembre de 2026. Las ínfimas cuantías se compran sin subasta: basta una proforma competitiva con documentos al día.</p>
    </section>

    <section className="business-card"><div className="section-heading"><div><p className="eyebrow">Competencia</p><h3>Quién gana en el HECAM</h3></div></div>
      <div className="hecam-ranking">{ranking.map((r) => <div key={r.name}><strong>{r.name}</strong><span>{r.items} ítems</span><b>{usd(r.amount)}</b></div>)}</div>
      <p className="module-note">Monto estimado: precio adjudicado por la cantidad programada.</p>
    </section>
  </>;
}
