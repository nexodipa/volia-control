"use client";

import { useEffect, useMemo, useState } from "react";
import { FICHAS_BASE } from "../lib/fichas-data";
import { FICHA_FIJOS, fichaAvisos, MAX_FILAS, mergeFichas, normalizeFicha, slugId, type FichaFijos, type FichaProducto, type FichasState } from "../lib/fichas";
import { downloadFichasDocx } from "../lib/fichas-docx";
import FichasDesdePliego, { type FichasElegidas } from "./FichasDesdePliego";
import { readStoredObject, STORAGE_KEYS, writeStoredJson } from "../lib/storage";
import { recordActivity } from "../lib/activity-log";

const INITIAL: FichasState = { fichas: FICHAS_BASE, fijos: FICHA_FIJOS, seleccion: FICHAS_BASE.map((f) => f.id) };
const BASE_IDS = new Set(FICHAS_BASE.map((f) => f.id));
const FIJOS_LABEL: Array<[keyof FichaFijos, string]> = [["pais", "País de origen"], ["fabricante", "Fabricante"], ["importador", "Importador"], ["registro", "Registro sanitario"], ["riesgo", "Riesgo"]];
const FOTOS_BASE = ["02", "03", "04", "05", "06", "07", "08"];
const MAX_FOTO_PX = 900;

/** Reduce la foto subida para que quepa en el almacenamiento del navegador y en el Word. */
async function reducePhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, MAX_FOTO_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * k));
  canvas.height = Math.max(1, Math.round(bitmap.height * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return file.type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.88);
}

function fotoSrc(foto: string) {
  if (foto.startsWith("base:")) return `/fichas/fotos/${foto.slice(5)}.png`;
  if (foto.startsWith("data:")) return foto;
  return "";
}

export default function FichasTecnicas() {
  const [state, setState] = useState<FichasState>(INITIAL);
  const [ready, setReady] = useState(false);
  const [currentId, setCurrentId] = useState(FICHAS_BASE[0].id);
  const [fijosOpen, setFijosOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setState(mergeFichas(FICHAS_BASE, readStoredObject<Record<string, unknown>>(STORAGE_KEYS.fichas, {})));
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (!writeStoredJson(STORAGE_KEYS.fichas, state)) {
      const timer = window.setTimeout(() => setMessage("No se pudo guardar en este navegador (poco espacio). Las fotos propias ocupan mucho: use fotos más pequeñas."), 0);
      return () => window.clearTimeout(timer);
    }
  }, [state, ready]);

  const current = state.fichas.find((f) => f.id === currentId) ?? state.fichas[0];
  const avisos = useMemo(() => (current ? fichaAvisos(current) : []), [current]);
  const chosen = state.fichas.filter((f) => state.seleccion.includes(f.id));

  const patch = (changes: Partial<FichaProducto>) => setState((s) => ({ ...s, fichas: s.fichas.map((f) => (f.id === current.id ? { ...f, ...changes } : f)) }));
  const toggle = (id: string) => setState((s) => ({ ...s, seleccion: s.seleccion.includes(id) ? s.seleccion.filter((x) => x !== id) : [...s.seleccion, id] }));
  const setFijo = (key: keyof FichaFijos, value: string) => setState((s) => ({ ...s, fijos: { ...s.fijos, [key]: value } }));
  const setColumna = (i: number, value: string) => patch({ columnas: current.columnas.map((c, n) => (n === i ? value : c)) });
  const setCelda = (r: number, c: number, value: string) => patch({ filas: current.filas.map((row, n) => (n === r ? row.map((x, m) => (m === c ? value : x)) : row)) });

  const addFicha = () => {
    const id = slugId(`${current.nombre} copia`, state.fichas.map((f) => f.id));
    const copy = normalizeFicha({ ...current, id, nombre: `${current.nombre} (COPIA)`, foto: current.foto === "plantilla" ? "" : current.foto }, id);
    setState((s) => ({ ...s, fichas: [...s.fichas, copy], seleccion: [...s.seleccion, id] }));
    setCurrentId(id);
    setMessage("Se creó una copia. Cambie el nombre y los datos; la foto de la plantilla no se copia.");
  };
  const removeFicha = () => {
    if (BASE_IDS.has(current.id) || !window.confirm(`¿Quitar la ficha «${current.nombre}»? No se puede deshacer.`)) return;
    const rest = state.fichas.filter((f) => f.id !== current.id);
    setState((s) => ({ ...s, fichas: rest, seleccion: s.seleccion.filter((x) => x !== current.id) }));
    setCurrentId(rest[0].id);
  };
  const restore = () => {
    const base = FICHAS_BASE.find((f) => f.id === current.id);
    if (!base || !window.confirm(`¿Volver «${current.nombre}» a sus datos originales? Se pierden sus cambios.`)) return;
    patch(base);
  };
  const applyPliego = ({ ids, nuevas }: FichasElegidas) => {
    const used = state.fichas.map((f) => f.id);
    const created = nuevas.map((draft) => {
      const id = slugId(draft.nombre || "ficha", used);
      used.push(id);
      return normalizeFicha({ ...draft, id, columnas: ["REFERENCIA", "DATO", "OBSERVACIÓN"], filas: [["", "", ""]], foto: "" }, id);
    });
    setState((s) => ({ ...s, fichas: [...s.fichas, ...created], seleccion: [...ids, ...created.map((c) => c.id)] }));
    const first = created[0]?.id ?? ids[0];
    if (first) setCurrentId(first);
  };
  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      patch({ foto: await reducePhoto(file) });
      setMessage("Foto cargada. Quedó reducida a un máximo de 900 px.");
    } catch {
      setMessage("No se pudo leer esa imagen. Use un archivo PNG o JPG.");
    }
  };
  const download = async () => {
    if (!chosen.length) { setMessage("Marque al menos una ficha para descargar."); return; }
    setBusy(true);
    try {
      await downloadFichasDocx(chosen, state.fijos);
      setMessage(`Se descargó el Word con ${chosen.length} ficha(s). Revise los datos antes de enviarlo: el registro sanitario y las medidas deben coincidir con el pliego.`);
      recordActivity("Documentos", "Fichas técnicas generadas", chosen.map((f) => f.nombre).join(", ").slice(0, 160), "export");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo armar el Word.");
    } finally {
      setBusy(false);
    }
  };

  const isBase = BASE_IDS.has(current.id);
  const totalAvisos = chosen.reduce((n, f) => n + fichaAvisos(f).length, 0);

  return (
    <section className="business-card fichas-module">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Dispositivos médicos</p>
          <h3>Fichas técnicas</h3>
          <p className="offer-lead">Elija los productos, ajuste los datos y descargue las fichas en Word con el formato rojo de Osteotech: logo, líneas y tablas salen de la plantilla real. Los cinco datos fijos del encabezado se aplican a todas.</p>
        </div>
      </div>

      <FichasDesdePliego fichas={state.fichas} onApply={applyPliego} />

      <div className="fichas-layout">
        <aside className="fichas-list" aria-label="Productos">
          {state.fichas.map((f) => (
            <div key={f.id} className={`fichas-item ${f.id === current.id ? "active" : ""}`}>
              <input type="checkbox" aria-label={`Incluir ${f.nombre}`} checked={state.seleccion.includes(f.id)} onChange={() => toggle(f.id)} />
              <button type="button" onClick={() => setCurrentId(f.id)} aria-current={f.id === current.id}>
                <span>{f.nombre || "Sin nombre"}</span>
                <small>{f.composicion || "sin composición"}{fichaAvisos(f).length ? ` · ${fichaAvisos(f).length} aviso(s)` : ""}</small>
              </button>
            </div>
          ))}
          <div className="fichas-list-actions">
            <button type="button" className="ghost-button" onClick={addFicha}>Nueva ficha (copia de esta)</button>
            <button type="button" className="ghost-button" onClick={() => setState((s) => ({ ...s, seleccion: s.seleccion.length === s.fichas.length ? [] : s.fichas.map((f) => f.id) }))}>{state.seleccion.length === state.fichas.length ? "Desmarcar todas" : "Marcar todas"}</button>
          </div>
        </aside>

        <div className="fichas-editor">
          <details className="offer-company" open={fijosOpen} onToggle={(e) => setFijosOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>Datos fijos del encabezado · {state.fijos.fabricante} · {state.fijos.registro}</summary>
            <p className="offer-note">Van iguales en todas las fichas. Cámbielos solo si cambia el fabricante, el importador o el registro.</p>
            <div className="business-form two">
              {FIJOS_LABEL.map(([key, label]) => (
                <label key={key}><span>{label}</span><input value={state.fijos[key]} onChange={(e) => setFijo(key, e.target.value)} /></label>
              ))}
            </div>
            <button type="button" className="ghost-button" onClick={() => setState((s) => ({ ...s, fijos: FICHA_FIJOS }))}>Volver a los datos originales</button>
          </details>

          <div className="business-form two">
            <label className="wide-field"><span>Nombre del producto</span><input value={current.nombre} onChange={(e) => patch({ nombre: e.target.value })} /></label>
            <label><span>Composición</span><input value={current.composicion} onChange={(e) => patch({ composicion: e.target.value })} /></label>
            <label><span>Color</span><input value={current.color} onChange={(e) => patch({ color: e.target.value })} /></label>
            <label className="wide-field"><span>Descripción</span><textarea rows={3} value={current.descripcion} onChange={(e) => patch({ descripcion: e.target.value })} /></label>
            <label className="wide-field"><span>Información general</span><textarea rows={3} value={current.informacion} onChange={(e) => patch({ informacion: e.target.value })} /></label>
            <label className="wide-field"><span>Indicaciones de uso</span><textarea rows={3} value={current.indicaciones} onChange={(e) => patch({ indicaciones: e.target.value })} /></label>
          </div>

          <details className="offer-company">
            <summary>Contraindicaciones, efectos, precauciones y limpieza{current.contraindicaciones || current.efectos || current.precauciones || current.limpieza ? " · con texto propio" : " · texto estándar de la plantilla"}</summary>
            <div className="business-form">
              {([["contraindicaciones", "Contraindicaciones"], ["efectos", "Efectos secundarios"], ["precauciones", "Precauciones"], ["limpieza", "Método de limpieza recomendado"]] as const).map(([key, label]) => (
                <label key={key} className="wide-field"><span>{label}</span><textarea rows={3} value={current[key]} placeholder="Vacío: se usa el texto estándar de la plantilla" onChange={(e) => patch({ [key]: e.target.value })} /></label>
              ))}
            </div>
          </details>

          <fieldset className="fichas-table">
            <legend>Tabla de medidas</legend>
            <div className="offer-table-wrap">
              <table className="offer-table">
                <thead><tr>{current.columnas.map((c, i) => <th key={i}><input aria-label={`Encabezado de la columna ${i + 1}`} value={c} onChange={(e) => setColumna(i, e.target.value)} /></th>)}<th aria-label="Quitar" /></tr></thead>
                <tbody>
                  {current.filas.map((row, r) => (
                    <tr key={r}>
                      {row.map((cellValue, c) => <td key={c}><input aria-label={`Fila ${r + 1}, columna ${c + 1}`} value={cellValue} onChange={(e) => setCelda(r, c, e.target.value)} /></td>)}
                      <td><button type="button" className="ghost-button" aria-label={`Quitar la fila ${r + 1}`} onClick={() => patch({ filas: current.filas.filter((_, n) => n !== r) })}>Quitar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="ghost-button" disabled={current.filas.length >= MAX_FILAS} onClick={() => patch({ filas: [...current.filas, current.columnas.map(() => "")] })}>Agregar fila</button>
          </fieldset>

          <fieldset className="fichas-fotos">
            <legend>Foto del producto</legend>
            <div className="fichas-foto-row">
              {current.foto === "plantilla" && <button type="button" className="fichas-foto active" aria-pressed="true"><span>Foto de la plantilla</span></button>}
              {FOTOS_BASE.map((n) => (
                <button key={n} type="button" className={`fichas-foto ${current.foto === `base:${n}` ? "active" : ""}`} aria-pressed={current.foto === `base:${n}`} onClick={() => patch({ foto: `base:${n}` })}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/fichas/fotos/${n}.png`} alt={`Foto ${n}`} />
                </button>
              ))}
              {current.foto.startsWith("data:") && (
                <button type="button" className="fichas-foto active" aria-pressed="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoSrc(current.foto)} alt="Foto propia" />
                </button>
              )}
            </div>
            <div className="hero-actions">
              <label className="ghost-button fichas-upload">Subir otra foto<input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { void uploadPhoto(e.target.files?.[0]); e.target.value = ""; }} /></label>
              <button type="button" className="ghost-button" onClick={() => patch({ foto: "" })}>Sin foto</button>
            </div>
            <p className="offer-note">Las fotos incluidas vienen de los catálogos del fabricante y son la más parecida disponible: cámbielas por la foto real del lote si la tiene.</p>
          </fieldset>

          {avisos.length > 0 && <ul className="offer-missing fichas-avisos" role="note">{avisos.map((a) => <li key={a.campo + a.texto}>{a.texto}</li>)}</ul>}
          <div className="hero-actions">
            {!isBase && <button type="button" className="ghost-button" onClick={removeFicha}>Quitar esta ficha</button>}
            {isBase && <button type="button" className="ghost-button" onClick={restore}>Restaurar datos originales</button>}
          </div>
        </div>
      </div>

      {totalAvisos > 0 && <p className="offer-missing" role="note">Las fichas marcadas tienen {totalAvisos} aviso(s). Puede descargar igual; revíselas antes de enviarlas.</p>}
      <div className="hero-actions">
        <button type="button" className="primary-button" onClick={download} disabled={busy || !chosen.length}>{busy ? "Armando el Word…" : `Descargar ${chosen.length} ficha(s) en Word`}</button>
      </div>
      {message && <p className="memory-confirmation" role="status">{message}</p>}
    </section>
  );
}
