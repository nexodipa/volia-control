"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogProduct } from "../lib/product-catalog";
import { matchLines, parseRequirementText, rememberAlias, type LineMatch, type StoredAlias } from "../lib/requirement-import";
import { readStoredArray, STORAGE_KEYS, writeStoredJson } from "../lib/storage";
import { recordActivity } from "../lib/activity-log";
import { loadPriceData, marketReference, supplierOffers, type PriceData } from "../lib/price-intel";
import { parsePliego, readPdfItems, type Pliego } from "../lib/pliego";

export type ImportedLine = { text: string; quantity: number; product: CatalogProduct | null };
const FREE = "__libre__";

/** Pegar un requerimiento y convertirlo en líneas de la cotización usando la memoria de equivalencias. */
export default function RequirementImporter({ catalog, customer, onAdd, onPliego }: { catalog: CatalogProduct[]; customer: string; onAdd: (lines: ImportedLine[]) => void; onPliego?: (p: Pliego) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<(LineMatch & { choice: string; remember: boolean; ref?: number })[]>([]);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState("");
  const [prices, setPrices] = useState<PriceData | null>(null);
  useEffect(() => { if (open && !prices) void loadPriceData().then(setPrices); }, [open, prices]);
  const hint = (text: string) => {
    if (!prices) return "";
    const ref = marketReference(text, prices);
    const offer = supplierOffers(text, prices.suppliers)[0];
    const usd = (v: number) => `USD ${v.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
    return [ref ? `Mercado: ${usd(ref.price)} (${ref.detail})` : "", offer ? `Proveedor ${offer.item.p}: ${usd(offer.price)} (${offer.kind})` : ""].filter(Boolean).join(" · ");
  };
  const active = useMemo(() => catalog.filter((p) => p.active), [catalog]);
  const byCode = useMemo(() => new Map(active.map((p) => [p.code, p])), [active]);

  const analyze = () => {
    const lines = parseRequirementText(text);
    if (!lines.length) { setRows([]); setMessage("No encontré líneas con descripción. Pegue filas copiadas de Excel o una línea por producto."); return; }
    const aliases = readStoredArray<StoredAlias>(STORAGE_KEYS.requirementAliases);
    const matches = matchLines(lines, active.map((p) => ({ code: p.code, description: p.description })), aliases, customer);
    setRows(matches.map((m) => ({ ...m, choice: m.code ?? FREE, remember: true })));
    const auto = matches.filter((m) => m.via === "alias").length;
    const similar = matches.filter((m) => m.via === "similar").length;
    setMessage(`${matches.length} línea(s): ${auto} con equivalencia confirmada, ${similar} con sugerencias para revisar, ${matches.length - auto - similar} sin coincidencia.`);
  };

  const readPliego = async (file: File | undefined) => {
    if (!file) return;
    setReading(true); setMessage("Leyendo el pliego…");
    try {
      const pliego = parsePliego(await readPdfItems(file));
      if (!pliego.items.length) { setRows([]); setMessage("No encontré la tabla de ítems (2.2 Presupuesto referencial). Si el PDF es escaneado, copie las filas y péguelas aquí."); return; }
      const lines = pliego.items.map((i) => ({ text: i.description, quantity: Math.max(1, Math.round(i.quantity)), raw: i.description }));
      const aliases = readStoredArray<StoredAlias>(STORAGE_KEYS.requirementAliases);
      const who = customer || pliego.entity;
      const matches = matchLines(lines, active.map((p) => ({ code: p.code, description: p.description })), aliases, who);
      setRows(matches.map((m, k) => ({ ...m, choice: m.code ?? FREE, remember: true, ref: pliego.items[k]?.unitPrice })));
      onPliego?.(pliego);
      const sum = pliego.items.reduce((t, i) => t + i.total, 0);
      const ok = pliego.budget > 0 && Math.abs(sum - pliego.budget) < 0.05;
      setMessage(`${pliego.code || "Pliego"} · ${pliego.entity}: ${pliego.items.length} ítem(s), presupuesto referencial USD ${pliego.budget.toLocaleString("es-EC", { minimumFractionDigits: 2 })}${ok ? " (la suma de los ítems cuadra)" : pliego.budget ? ` (ojo: los ítems suman USD ${sum.toLocaleString("es-EC", { minimumFractionDigits: 2 })}; revise el PDF)` : ""}. Revise cada línea y agréguelas.`);
      recordActivity("Cotizador", "Pliego leído", `${pliego.code} · ${pliego.items.length} ítem(s)`);
    } catch {
      setMessage("No se pudo leer ese PDF. Si es escaneado o está protegido, copie las filas y péguelas aquí.");
    } finally { setReading(false); }
  };

  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((cur) => cur.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const add = () => {
    let aliases = readStoredArray<StoredAlias>(STORAGE_KEYS.requirementAliases);
    let learned = 0;
    const lines: ImportedLine[] = rows.map((r) => {
      const product = r.choice !== FREE ? byCode.get(r.choice) ?? null : null;
      if (product && r.remember && r.via !== "alias") { aliases = rememberAlias(aliases, r.text, customer, product.code); learned++; }
      if (product && r.via === "alias" && r.choice !== r.code && r.remember) { aliases = rememberAlias(aliases, r.text, customer, product.code); learned++; }
      return { text: r.text, quantity: r.quantity, product };
    });
    if (learned) writeStoredJson(STORAGE_KEYS.requirementAliases, aliases);
    onAdd(lines);
    recordActivity("Cotizador", "Requerimiento importado", `${lines.length} línea(s) · ${learned} equivalencia(s) aprendida(s)${customer ? ` · ${customer}` : ""}`);
    setMessage(`Se agregaron ${lines.length} línea(s) a la cotización${learned ? ` y se aprendieron ${learned} equivalencia(s) para ${customer || "todos los clientes"}` : ""}.`);
    setRows([]); setText("");
  };

  return <section className="quote-card requirement-importer">
    <div className="quote-card-title"><div><span>↧</span><div><p className="eyebrow">Ahorro de tiempo</p><h3>Pegar requerimiento</h3></div></div>
      <button type="button" className="secondary-button" onClick={() => setOpen((v) => !v)}>{open ? "Cerrar" : "Abrir"}</button></div>
    {open && <>
      <p className="module-note">Suba el pliego del SERCOP en PDF o copie las filas del informe de necesidad, del pliego o del correo (con o sin columnas) y péguelas aquí. Lo que ya confirmó antes para este cliente se reconoce solo; lo parecido se propone y usted decide.</p>
      <textarea className="requirement-input" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Ej.:\n10 placas LCP anatómicas\nTornillo de cortical x 24\no filas copiadas de Excel"} />
      <div className="record-actions"><button type="button" className="primary-button" disabled={!text.trim()} onClick={analyze}>Analizar</button>
        <label className={`secondary-button pliego-upload${reading ? " is-busy" : ""}`}>{reading ? "Leyendo…" : "Leer pliego del SERCOP (PDF)"}<input type="file" accept="application/pdf,.pdf" hidden disabled={reading} onChange={(e) => { void readPliego(e.target.files?.[0]); e.target.value = ""; }} /></label></div>
      {message && <p className="module-sync-status ok" role="status">{message}</p>}
      {rows.length > 0 && <>
        <div className="requirement-rows">{rows.map((r, i) => <div className={`requirement-row via-${r.via}`} key={`${i}-${r.raw}`}>
          <div className="requirement-text"><strong>{r.text}</strong><small>{r.via === "alias" ? "Equivalencia confirmada" : r.via === "similar" ? "Sugerencia: revise antes de agregar" : "Sin coincidencia en el catálogo"}{r.ref ? ` · Precio referencial del pliego: USD ${r.ref.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 5 })}` : ""}</small>
            {hint(r.text) && <small className="requirement-hint">{hint(r.text)}</small>}
            {r.via === "similar" && r.choice === FREE && r.candidates[0] && byCode.get(r.candidates[0].code) && <button type="button" className="secondary-button requirement-suggest" onClick={() => update(i, { choice: r.candidates[0].code })}>Usar sugerencia: {byCode.get(r.candidates[0].code)!.description} ({Math.round(r.candidates[0].score * 100)} %)</button>}</div>
          <label><span>Cantidad</span><input type="number" min="1" value={r.quantity} onChange={(e) => update(i, { quantity: Math.max(1, Math.round(Number(e.target.value) || 1)) })} /></label>
          <label className="requirement-choice"><span>Producto</span><select value={r.choice} onChange={(e) => update(i, { choice: e.target.value })}>
            <option value={FREE}>Línea libre (sin producto del catálogo)</option>
            {[...new Set([...(r.code ? [r.code] : []), ...r.candidates.map((c) => c.code)])].map((code) => { const p = byCode.get(code); const score = r.candidates.find((c) => c.code === code)?.score; return p ? <option key={code} value={code}>{p.code} · {p.description}{score !== undefined ? ` (${Math.round(score * 100)} %)` : ""}</option> : null; })}
            <optgroup label="Todo el catálogo">{active.map((p) => <option key={`all-${p.code}`} value={p.code}>{p.code} · {p.description}</option>)}</optgroup>
          </select></label>
          {r.choice !== FREE && <label className="requirement-remember"><input type="checkbox" checked={r.remember} onChange={(e) => update(i, { remember: e.target.checked })} /><span>Recordar para {customer || "todos los clientes"}</span></label>}
        </div>)}</div>
        <div className="record-actions"><button type="button" className="primary-button" onClick={add}>Agregar {rows.length} línea(s) a la cotización</button></div>
      </>}
    </>}
  </section>;
}
