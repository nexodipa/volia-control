"use client";

import { useState } from "react";
import type { FichaProducto } from "../lib/fichas";
import { proposeFichas, type FichaBorrador, type FichaProposal } from "../lib/fichas-pliego";
import { parsePliego, readPdfItems } from "../lib/pliego";
import { parseRequirementText } from "../lib/requirement-import";

const NUEVA = "__nueva__";
const NINGUNA = "__ninguna__";

export type FichasElegidas = { ids: string[]; nuevas: FichaBorrador[] };
type Row = FichaProposal & { choice: string };

/** Pegar o leer los ítems de un pliego y armar la selección de fichas: confirma una persona, línea por línea. */
export default function FichasDesdePliego({ fichas, onApply }: { fichas: FichaProducto[]; onApply: (elegidas: FichasElegidas) => void }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [source, setSource] = useState("");
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState("");

  const load = (lines: Array<{ text: string; quantity: number }>, from: string) => {
    if (!lines.length) { setRows([]); setMessage("No encontré líneas con descripción. Pegue una línea por producto o cargue el PDF del pliego."); return; }
    const proposals = proposeFichas(lines, fichas);
    setRows(proposals.map((p) => ({ ...p, choice: p.candidates[0]?.id ?? NUEVA })));
    setSource(from);
    const known = proposals.filter((p) => p.candidates.length).length;
    setMessage(`${lines.length} línea(s): ${known} con ficha sugerida y ${lines.length - known} sin coincidencia en la biblioteca (quedan como borrador nuevo).`);
  };
  const analyze = () => load(parseRequirementText(text).map((l) => ({ text: l.text, quantity: l.quantity })), "texto pegado");
  const readPliego = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    setMessage("Leyendo el pliego…");
    try {
      const pliego = parsePliego(await readPdfItems(file));
      if (!pliego.items.length) { setRows([]); setMessage("No encontré la tabla de ítems del pliego. Si el PDF es escaneado, copie las filas y péguelas aquí."); return; }
      load(pliego.items.map((i) => ({ text: i.description, quantity: Math.max(1, Math.round(i.quantity)) })), `${pliego.code || "pliego"} · ${pliego.entity}`);
    } catch {
      setMessage("No se pudo leer ese PDF. Copie las filas del pliego y péguelas en el cuadro.");
    } finally {
      setReading(false);
    }
  };

  const apply = () => {
    const ids = new Set<string>();
    const nuevas: FichaBorrador[] = [];
    for (const r of rows) {
      if (r.choice === NINGUNA) continue;
      if (r.choice === NUEVA) nuevas.push(r.draft);
      else ids.add(r.choice);
    }
    if (!ids.size && !nuevas.length) { setMessage("Elija una ficha o un borrador en al menos una línea."); return; }
    onApply({ ids: [...ids], nuevas });
    setMessage(`Listo: ${ids.size} ficha(s) de la biblioteca marcadas${nuevas.length ? ` y ${nuevas.length} borrador(es) nuevos creados` : ""}. Revise los avisos de cada una antes de descargar.`);
  };

  return (
    <details className="offer-company fichas-pliego">
      <summary>Armar desde un pliego o requerimiento</summary>
      <p className="offer-note">Cargue el PDF del pliego o pegue una línea por producto. Para cada línea le sugiero una ficha de la biblioteca (si las medidas del nombre no coinciden, no la sugiero) o un borrador nuevo con el nombre y el material que se lee en el texto. Nada se marca sin que usted pulse el botón.</p>
      <div className="hero-actions">
        <label className="ghost-button fichas-upload">{reading ? "Leyendo…" : "Cargar PDF del pliego"}<input type="file" accept="application/pdf" hidden disabled={reading} onChange={(e) => { void readPliego(e.target.files?.[0]); e.target.value = ""; }} /></label>
      </div>
      <div className="business-form"><label className="wide-field"><span>O pegue los ítems</span><textarea rows={4} value={text} placeholder={"Vástago no cementado de titanio, cono 10/14\nTornillo de esponjosa 6.5 mm"} onChange={(e) => setText(e.target.value)} /></label></div>
      <div className="hero-actions"><button type="button" className="ghost-button" onClick={analyze} disabled={!text.trim()}>Buscar fichas</button></div>
      {rows.length > 0 && (
        <>
          <p className="offer-note">Origen: {source}.</p>
          <div className="offer-table-wrap">
            <table className="offer-table">
              <thead><tr><th>Línea del pliego</th><th>Cant.</th><th>Ficha</th></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const chosen = r.candidates.find((c) => c.id === r.choice);
                  return (
                    <tr key={i}>
                      <td>{r.line}</td>
                      <td>{r.quantity}</td>
                      <td>
                        <select aria-label={`Ficha para la línea ${i + 1}`} value={r.choice} onChange={(e) => setRows((cur) => cur.map((x, n) => (n === i ? { ...x, choice: e.target.value } : x)))}>
                          {r.candidates.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({Math.round(c.score * 100)}%)</option>)}
                          <option value={NUEVA}>Crear borrador: {r.draft.nombre || "sin nombre"}</option>
                          <option value={NINGUNA}>No hacer ficha</option>
                        </select>
                        {chosen && <small className="fichas-aviso-linea">{chosen.avisos.join(" ")}</small>}
                        {r.choice === NUEVA && <small className="fichas-aviso-linea">Borrador sin tabla de medidas, información ni foto: complételo después.</small>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="hero-actions"><button type="button" className="primary-button" onClick={apply}>Marcar estas fichas</button></div>
        </>
      )}
      {message && <p className="memory-confirmation" role="status">{message}</p>}
    </details>
  );
}
