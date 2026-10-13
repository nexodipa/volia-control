"use client";

import { useMemo, useState } from "react";
import type { CatalogProduct } from "../lib/product-catalog";
import { matchLines, parseRequirementText, rememberAlias, type LineMatch, type StoredAlias } from "../lib/requirement-import";
import { readStoredArray, STORAGE_KEYS, writeStoredJson } from "../lib/storage";
import { recordActivity } from "../lib/activity-log";

export type ImportedLine = { text: string; quantity: number; product: CatalogProduct | null };
const FREE = "__libre__";

/** Pegar un requerimiento y convertirlo en líneas de la cotización usando la memoria de equivalencias. */
export default function RequirementImporter({ catalog, customer, onAdd }: { catalog: CatalogProduct[]; customer: string; onAdd: (lines: ImportedLine[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<(LineMatch & { choice: string; remember: boolean })[]>([]);
  const [message, setMessage] = useState("");
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
    <div className="quote-card-title"><div><span>↧</span><div><p className="eyebrow">AHORRO DE TIEMPO</p><h3>Pegar requerimiento</h3></div></div>
      <button type="button" className="secondary-button" onClick={() => setOpen((v) => !v)}>{open ? "Cerrar" : "Abrir"}</button></div>
    {open && <>
      <p className="module-note">Copie las filas del informe de necesidad, del pliego o del correo (con o sin columnas) y péguelas aquí. Lo que ya confirmó antes para este cliente se reconoce solo; lo parecido se propone y usted decide.</p>
      <textarea className="requirement-input" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Ej.:\n10 placas LCP anatómicas\nTornillo de cortical x 24\no filas copiadas de Excel"} />
      <div className="record-actions"><button type="button" className="primary-button" disabled={!text.trim()} onClick={analyze}>Analizar</button></div>
      {message && <p className="module-sync-status ok" role="status">{message}</p>}
      {rows.length > 0 && <>
        <div className="requirement-rows">{rows.map((r, i) => <div className={`requirement-row via-${r.via}`} key={`${i}-${r.raw}`}>
          <div className="requirement-text"><strong>{r.text}</strong><small>{r.via === "alias" ? "Equivalencia confirmada" : r.via === "similar" ? "Sugerencia: revise antes de agregar" : "Sin coincidencia en el catálogo"}</small>
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
