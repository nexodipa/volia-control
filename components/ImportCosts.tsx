"use client";

import { useEffect, useMemo, useState } from "react";
import { recordActivity } from "../lib/activity-log";
import { downloadCsv } from "../lib/csv";
import { DEFAULT_IMPORT_SETTINGS, EMPTY_COSTS, computeLanded, importVerdict, sameProduct, type ImportCosts, type ImportLine, type ImportSettings } from "../lib/landed-cost";
import { costAboveMarket, loadPriceData, marketReference, supplierOffers, type PriceData } from "../lib/price-intel";
import { STORAGE_KEYS, readStoredArray, writeStoredJson } from "../lib/storage";

type Shipment = { id: string; ref: string; supplier: string; date: string; costs: ImportCosts; settings: ImportSettings; lines: ImportLine[]; savedAt: string };

const money = (v: number, digits = 2) => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v || 0);
const uid = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const blankLine = (): ImportLine => ({ id: uid(), product: "", qty: 0, fobUnit: 0, weightKg: 0, adValoremPct: 0, localUnitCost: 0, salePrice: 0 });
const blank = (): Shipment => ({ id: "", ref: "", supplier: "", date: "", costs: { ...EMPTY_COSTS }, settings: { ...DEFAULT_IMPORT_SETTINGS }, lines: [blankLine()], savedAt: "" });
const num = (v: string) => Math.max(0, Number(v.replace(",", ".")) || 0);

const COST_FIELDS: { key: keyof ImportCosts; label: string }[] = [
  { key: "freight", label: "Flete internacional" },
  { key: "insurance", label: "Seguro de la carga" },
  { key: "broker", label: "Agente de aduana" },
  { key: "storage", label: "Almacenaje y puerto" },
  { key: "localTransport", label: "Transporte a bodega" },
  { key: "other", label: "Otros costos" },
];

export default function ImportCosts() {
  const [draft, setDraft] = useState<Shipment>(blank);
  const [saved, setSaved] = useState<Shipment[]>([]);
  const [ready, setReady] = useState(false);
  const [prices, setPrices] = useState<PriceData | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => { setSaved(readStoredArray<Shipment>(STORAGE_KEYS.imports)); setReady(true); }, 0);
    loadPriceData().then(setPrices).catch(() => setPrices(null));
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (ready) writeStoredJson(STORAGE_KEYS.imports, saved); }, [saved, ready]);

  const result = useMemo(() => computeLanded(draft.lines, draft.costs, draft.settings), [draft]);
  const byId = useMemo(() => new Map(result.lines.map((l) => [l.id, l])), [result]);

  const setLine = (id: string, change: Partial<ImportLine>) => setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.id === id ? { ...l, ...change } : l)) }));
  const setSetting = <K extends keyof ImportSettings>(key: K, value: ImportSettings[K]) => setDraft((d) => ({ ...d, settings: { ...d.settings, [key]: value } }));
  const localBest = (product: string) => (prices && product.trim() ? supplierOffers(product, prices.suppliers)[0] : undefined);

  const save = () => {
    if (!draft.ref.trim()) { setNotice("Escriba una referencia para guardar el embarque (por ejemplo, el número de orden)."); return; }
    const next = { ...draft, id: draft.id || uid(), ref: draft.ref.trim(), savedAt: new Date().toISOString() };
    setSaved((cur) => (draft.id ? cur.map((s) => (s.id === draft.id ? next : s)) : [next, ...cur]));
    setDraft(next);
    recordActivity("Importaciones", draft.id ? "Embarque actualizado" : "Embarque guardado", `${next.ref} · ${next.supplier || "sin proveedor"}`);
    setNotice("Embarque guardado.");
  };
  const remove = (s: Shipment) => {
    if (!window.confirm(`¿Eliminar el embarque ${s.ref}?`)) return;
    setSaved((cur) => cur.filter((x) => x.id !== s.id));
    if (draft.id === s.id) setDraft(blank());
    recordActivity("Importaciones", "Embarque eliminado", s.ref, "delete");
  };
  const exportCsv = () => {
    const head = ["Producto", "Cantidad", "FOB", "Flete", "Seguro", "CIF", "Ad valorem", "FODINFA", "ISD", "IVA", "Otros costos", "Costo total en bodega", "Costo unitario", "Costo local", "Ahorro %", "Precio de venta", "Margen %"];
    const rows = result.lines.map((l) => {
      const src = draft.lines.find((x) => x.id === l.id);
      return [l.product, l.qty, l.fob, l.freight, l.insurance, l.cif, l.adValorem, l.fodinfa, l.isd, l.iva, l.localExtras, l.landedTotal, l.landedUnit, src?.localUnitCost || "", l.savingsPct ?? "", src?.salePrice || "", l.marginPct ?? ""];
    });
    downloadCsv([[`Embarque ${draft.ref || "sin referencia"}`, draft.supplier], head, ...rows], `costo-bodega-${draft.ref || "embarque"}`);
  };

  const t = result.totals;
  return <section className="case-module">
    <div className="case-hero"><div><p className="eyebrow">Compras al exterior</p><h2>Importaciones: costo puesto en bodega</h2><p>Calcula cuánto cuesta realmente cada unidad cuando se importa (flete, aranceles, FODINFA, ISD y gastos locales) y si conviene frente a comprar a un distribuidor local.</p></div></div>
    {notice && <p className="memory-confirmation" role="status">{notice}</p>}

    <section className="case-form-card">
      <div className="case-section-title"><div><p className="eyebrow">Embarque</p><h3>{draft.id ? `Editando ${draft.ref}` : "Nuevo cálculo"}</h3></div><span>Los valores en USD</span></div>
      <div className="case-form-grid">
        <label><span>Referencia u orden</span><input value={draft.ref} placeholder="Ej. OC-2027-001" onChange={(e) => setDraft({ ...draft, ref: e.target.value })} /></label>
        <label><span>Proveedor del exterior</span><input value={draft.supplier} onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} /></label>
        <label><span>Fecha</span><input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
        {COST_FIELDS.map((f) => <label key={f.key}><span>{f.label} (total)</span><input type="number" min="0" step="0.01" value={draft.costs[f.key] || ""} onChange={(e) => setDraft({ ...draft, costs: { ...draft.costs, [f.key]: num(e.target.value) } })} /></label>)}
      </div>

      <details className="case-expand"><summary>Tasas y criterios de cálculo</summary>
        <div className="case-form-grid">
          <label><span>FODINFA (%)</span><input type="number" min="0" step="0.1" value={draft.settings.fodinfaPct} onChange={(e) => setSetting("fodinfaPct", num(e.target.value))} /></label>
          <label><span>IVA (%)</span><input type="number" min="0" step="0.5" value={draft.settings.ivaPct} onChange={(e) => setSetting("ivaPct", num(e.target.value))} /></label>
          <label><span>ISD (%)</span><input type="number" min="0" step="0.5" value={draft.settings.isdPct} onChange={(e) => setSetting("isdPct", num(e.target.value))} /></label>
          <label><span>El ISD se calcula sobre</span><select value={draft.settings.isdBase} onChange={(e) => setSetting("isdBase", e.target.value as ImportSettings["isdBase"])}><option value="cif">CIF (mercadería, flete y seguro)</option><option value="fob">Solo el valor FOB</option></select></label>
          <label><span>Repartir flete y gastos por</span><select value={draft.settings.allocateBy} onChange={(e) => setSetting("allocateBy", e.target.value as ImportSettings["allocateBy"])}><option value="value">Valor de cada línea</option><option value="weight">Peso de cada línea</option></select></label>
          <label><span>Base de aranceles y FODINFA</span><select value={draft.settings.freightInBase ? "cif" : "nofreight"} onChange={(e) => setSetting("freightInBase", e.target.value === "cif")}><option value="cif">CIF (incluye el flete)</option><option value="nofreight">Sin el flete internacional</option></select></label>
        </div>
        <label className="case-notes"><span><input type="checkbox" checked={draft.settings.ivaRecoverable} onChange={(e) => setSetting("ivaRecoverable", e.target.checked)} /> El IVA de la importación es recuperable (crédito tributario)</span></label>
        <small>Tasas generales vigentes en 2026: FODINFA 0,5 %, IVA 15 %, ISD 5 % (0 % o 2,5 % para subpartidas de los listados diferenciados). El ad valorem depende de cada subpartida. Si se vende con IVA 0 %, el IVA de importación no se recupera: desmarque la casilla. Confirme la base del flete y las tasas con su agente de aduana antes de decidir.</small>
      </details>

      {draft.lines.map((l, i) => {
        const best = localBest(l.product);
        return <div key={l.id} style={{ borderTop: "1px solid rgba(0,0,0,.12)", marginTop: 16, paddingTop: 12 }}>
          <div className="case-section-title"><div><p className="eyebrow">Producto {i + 1}</p></div>{draft.lines.length > 1 && <button type="button" className="secondary-button" onClick={() => setDraft({ ...draft, lines: draft.lines.filter((x) => x.id !== l.id) })}>Quitar</button>}</div>
          <div className="case-form-grid">
            <label><span>Producto</span><input value={l.product} placeholder="Ej. Hoja de sierra oscilante descartable" onChange={(e) => setLine(l.id, { product: e.target.value })} /></label>
            <label><span>Cantidad</span><input type="number" min="0" value={l.qty || ""} onChange={(e) => setLine(l.id, { qty: num(e.target.value) })} /></label>
            <label><span>Precio FOB por unidad</span><input type="number" min="0" step="0.01" value={l.fobUnit || ""} onChange={(e) => setLine(l.id, { fobUnit: num(e.target.value) })} /></label>
            <label><span>Peso total (kg)</span><input type="number" min="0" step="0.1" value={l.weightKg || ""} onChange={(e) => setLine(l.id, { weightKg: num(e.target.value) })} /></label>
            <label><span>Ad valorem de la subpartida (%)</span><input type="number" min="0" step="0.5" value={l.adValoremPct || ""} onChange={(e) => setLine(l.id, { adValoremPct: num(e.target.value) })} /></label>
            <label><span>Costo local actual por unidad</span><input type="number" min="0" step="0.01" value={l.localUnitCost || ""} onChange={(e) => setLine(l.id, { localUnitCost: num(e.target.value) })} /></label>
            <label><span>Precio de venta por unidad (sin IVA)</span><input type="number" min="0" step="0.01" value={l.salePrice || ""} onChange={(e) => setLine(l.id, { salePrice: num(e.target.value) })} /></label>
          </div>
          {best && !l.localUnitCost && <small>Mejor proveedor local en el sistema: {money(best.price)} ({best.item.p}). <button type="button" className="secondary-button" onClick={() => setLine(l.id, { localUnitCost: best.price })}>Usar este costo</button></small>}
        </div>;
      })}
      <div className="case-form-footer"><small>El costo local y el precio de venta son opcionales: con ellos se calcula el ahorro y el margen.</small>
        <div><button className="secondary-button" onClick={() => setDraft({ ...draft, lines: [...draft.lines, blankLine()] })}>Agregar producto</button> <button className="secondary-button" onClick={() => { setDraft(blank()); setNotice(""); }}>Nuevo cálculo</button> <button className="primary-button" onClick={save}>Guardar embarque</button></div></div>
    </section>

    {result.lines.length > 0 && <>
      <div className="case-kpis">
        <article><span>Valor FOB</span><strong>{money(t.fob, 0)}</strong><small>Lo que se paga al proveedor</small></article>
        <article><span>Tributos pagados</span><strong>{money(t.taxes, 0)}</strong><small>Ad valorem, FODINFA e ISD{draft.settings.ivaRecoverable ? "" : " e IVA"}</small></article>
        <article><span>Costo total en bodega</span><strong>{money(t.landed, 0)}</strong><small>{t.fob > 0 ? `${money(t.landed / t.fob, 2).replace("$", "").trim()} veces el FOB` : ""}</small></article>
        {draft.settings.ivaRecoverable && <article><span>IVA a recuperar</span><strong>{money(t.ivaCredit, 0)}</strong><small>Crédito tributario, no es costo</small></article>}
      </div>
      {result.warnings.map((w) => <p key={w} className="memory-confirmation" role="status">{w}</p>)}
      <section className="case-table-card">
        <div className="case-toolbar"><div><p className="eyebrow">Resultado</p><h3>Costo por producto</h3></div><button className="secondary-button" onClick={exportCsv}>Descargar CSV</button></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Producto</th><th>CIF</th><th>Tributos</th><th>Otros gastos</th><th>Costo unitario en bodega</th><th>¿Conviene?</th><th>Mercado</th></tr></thead>
          <tbody>{draft.lines.map((src) => {
            const l = byId.get(src.id);
            if (!l) return null;
            const found = prices ? marketReference(l.product, prices) : null;
            const ref = found && sameProduct(l.product, found.name) ? found : null; // un precio de otro producto no sirve para decidir
            const above = costAboveMarket(l.landedUnit, ref);
            return <tr key={l.id}>
              <td><strong>{l.product || "Sin nombre"}</strong><br /><small>{l.qty} unidades</small></td>
              <td>{money(l.cif)}</td>
              <td>{money(l.adValorem + l.fodinfa + l.isd + (draft.settings.ivaRecoverable ? 0 : l.iva))}</td>
              <td>{money(l.localExtras)}</td>
              <td><strong>{money(l.landedUnit, 2)}</strong>{l.marginPct !== null && <><br /><small>Margen {l.marginPct} % al precio indicado</small></>}</td>
              <td>{importVerdict(l)}</td>
              <td>{ref ? <>{money(ref.price)}<br /><small className={above ? "text-danger" : undefined}>{above ? "El costo ya supera lo que paga el mercado" : ref.detail}</small><br /><small>«{ref.name}»</small></> : <small>{found ? `Sin referencia fiable: el ítem más parecido es «${found.name}», que no es el mismo producto` : "Sin referencia"}</small>}</td>
            </tr>;
          })}</tbody>
        </table></div>
      </section>
    </>}

    {saved.length > 0 && <section className="case-table-card">
      <div className="case-toolbar"><div><p className="eyebrow">Historial</p><h3>Embarques guardados</h3></div></div>
      <div className="case-list">{saved.map((s) => <article className="case-row" key={s.id}>
        <div className="case-main"><div className="case-name"><div><strong>{s.ref}</strong><small>{s.supplier || "Proveedor no indicado"}{s.date ? ` · ${s.date}` : ""} · {s.lines.length} producto(s)</small></div></div></div>
        <div className="case-details"><button className="secondary-button" onClick={() => { setDraft(s); setNotice(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Abrir</button> <button className="secondary-button" onClick={() => remove(s)}>Eliminar</button></div>
      </article>)}</div>
    </section>}
  </section>;
}
