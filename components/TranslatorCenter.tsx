"use client";

import { useEffect, useRef, useState } from "react";
import { ensureMapPolyfills } from "../lib/polyfills";
import { buildTranslationPrompt, cleanModelOutput, itemsToText, looksEnglish, reflow, splitText, type TranslatedPage } from "../lib/translate";
import { exportTranslationPdf, exportTranslationWord } from "../lib/translate-export";
import { recordActivity } from "../lib/activity-log";

type Engine = "chrome" | "gemini";
type BrowserTranslator = { translate: (text: string) => Promise<string>; destroy?: () => void };
type TranslatorStatic = {
  availability: (o: { sourceLanguage: string; targetLanguage: string }) => Promise<string>;
  create: (o: { sourceLanguage: string; targetLanguage: string; monitor?: (m: EventTarget) => void }) => Promise<BrowserTranslator>;
};

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 40;
const chromeApi = (): TranslatorStatic | null => (typeof self !== "undefined" && "Translator" in self ? ((self as unknown as { Translator: TranslatorStatic }).Translator) : null);

async function canvasFromImage(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("El navegador no pudo preparar la imagen.");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // un PNG transparente se leería como negro
  ctx.filter = "grayscale(1) contrast(1.15)";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export default function TranslatorCenter() {
  const [file, setFile] = useState<File | null>(null);
  const [engine, setEngine] = useState<Engine>("chrome");
  const [chromeState, setChromeState] = useState("revisando");
  const [geminiOk, setGeminiOk] = useState<boolean | null>(null);
  const [noPatients, setNoPatients] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [warn, setWarn] = useState("");
  const [pages, setPages] = useState<TranslatedPage[]>([]);
  const [showSource, setShowSource] = useState(false);
  const stop = useRef(false);

  useEffect(() => {
    const api = chromeApi();
    if (!api) { setChromeState("no disponible"); setEngine("gemini"); }
    else api.availability({ sourceLanguage: "en", targetLanguage: "es" }).then((s) => { setChromeState(s); if (s === "unavailable") setEngine("gemini"); }).catch(() => { setChromeState("no disponible"); setEngine("gemini"); });
    fetch("/api/ai").then((r) => r.json()).then((j) => setGeminiOk(!!j.configured)).catch(() => setGeminiOk(false));
  }, []);

  const pick = (f: File | null) => {
    setError(""); setWarn(""); setPages([]);
    if (!f) return setFile(null);
    if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(f.type)) return setError("Solo se aceptan PDF, JPG, PNG o WEBP.");
    if (f.size > MAX_BYTES) return setError("El archivo pasa de 20 MB.");
    setFile(f);
  };

  async function readPages(f: File): Promise<string[]> {
    let worker: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>> | null = null;
    const ocr = async (canvas: HTMLCanvasElement) => {
      if (!worker) {
        setStatus("Preparando el lector de fotos (inglés)…");
        const { createWorker } = await import("tesseract.js");
        worker = await createWorker("eng", 1, {
          langPath: window.location.origin,
          workerPath: new URL("tesseract.js/dist/worker.min.js", import.meta.url).toString(),
          corePath: new URL("tesseract.js-core/tesseract-core-simd-lstm.wasm.js", import.meta.url).toString(),
        });
        // El umbral global por defecto deja en blanco una hoja con fondo gris y márgenes blancos (típico de un escaneo);
        // el adaptativo (Sauvola) la lee bien y no empeora las imágenes limpias.
        try { await worker.setParameters({ thresholding_method: "2" } as never); } catch { /* versión sin ese parámetro */ }
      }
      return (await worker.recognize(canvas)).data.text as string;
    };
    try {
      if (f.type !== "application/pdf") {
        setStatus("Leyendo la foto…");
        const text = reflow(await ocr(await canvasFromImage(f)));
        if (!text.trim()) throw new Error("No encontré texto en la foto. Pruebe con una más nítida y bien iluminada.");
        return [text];
      }
      ensureMapPolyfills();
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      if (pdf.numPages > MAX_PAGES) throw new Error(`El documento tiene ${pdf.numPages} páginas. El máximo es ${MAX_PAGES}; divídalo en partes.`);
      const out: string[] = [];
      for (let n = 1; n <= pdf.numPages; n += 1) {
        setStatus(`Leyendo página ${n} de ${pdf.numPages}…`);
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        let text = itemsToText(content.items.filter((i) => "str" in i) as never);
        if (text.replace(/\s/g, "").length < 40) {
          setStatus(`Página ${n} es una imagen. Leyéndola con OCR…`);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            try { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); await page.render({ canvas, canvasContext: ctx, viewport }).promise; text = await ocr(canvas); }
            catch { throw new Error(`No se pudo leer la página ${n} como imagen. Pruebe con una foto o captura más nítida.`); }
          }
        }
        out.push(reflow(text));
      }
      if (out.every((t) => !t.trim())) throw new Error("No encontré texto en este archivo. Si es un escaneo borroso, pruebe con una foto más nítida.");
      return out;
    } finally { if (worker) await (worker as { terminate: () => Promise<unknown> }).terminate(); }
  }

  async function makeTranslate(): Promise<{ run: (t: string) => Promise<string>; max: number; done: () => void }> {
    if (engine === "chrome") {
      const api = chromeApi();
      if (!api) throw new Error("Este navegador no tiene traductor integrado. Use Chrome actualizado o elija Gemini.");
      setStatus("Preparando el traductor de Chrome (la primera vez descarga el idioma)…");
      const tr = await api.create({ sourceLanguage: "en", targetLanguage: "es", monitor: (m) => m.addEventListener("downloadprogress", (e) => setStatus(`Descargando idioma… ${Math.round(((e as unknown as { loaded: number }).loaded ?? 0) * 100)} %`)) });
      return { run: (t) => tr.translate(t), max: 1800, done: () => tr.destroy?.() };
    }
    const call = async (text: string, attempt = 0): Promise<string> => {
      const res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "gemini-2.0-flash", prompt: buildTranslationPrompt(text), temperature: 0.1 }) });
      if (!res.ok) {
        if (attempt < 2 && (res.status === 429 || res.status >= 500)) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); return call(text, attempt + 1); }
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `Gemini respondió ${res.status}.`);
      }
      return cleanModelOutput((await res.json()).text as string);
    };
    return { run: call, max: 5000, done: () => {} };
  }

  const start = async () => {
    if (!file) return;
    if (engine === "gemini" && !noPatients) return setError("Confirme que el documento no tiene datos de pacientes antes de usar Gemini.");
    if (engine === "gemini" && geminiOk === false) return setError("Gemini no está configurado. Use el traductor de Chrome o configure la clave.");
    setBusy(true); setError(""); setWarn(""); setPages([]); stop.current = false;
    try {
      const sources = await readPages(file);
      const all = sources.join("\n");
      if (all.replace(/\s/g, "").length < 25) throw new Error("No se pudo leer texto. Pruebe con una foto más recta, nítida y con buena luz, o un PDF con texto seleccionable.");
      if (!looksEnglish(all)) setWarn("El texto no parece estar en inglés. Revise que sea el archivo correcto.");
      const { run, max, done } = await makeTranslate();
      const result: TranslatedPage[] = [];
      try {
        for (let i = 0; i < sources.length; i += 1) {
          if (stop.current) throw new Error("Traducción cancelada.");
          setStatus(`Traduciendo página ${i + 1} de ${sources.length}…`);
          const parts = splitText(sources[i], max);
          const translated: string[] = [];
          for (const part of parts) translated.push(await run(part));
          result.push({ page: i + 1, source: sources[i], translated: translated.join("\n\n") });
          setPages([...result]);
        }
      } finally { done(); }
      setStatus("");
      recordActivity("Traductor", "Documento traducido", `${file.name} · ${sources.length} página(s) · ${engine === "chrome" ? "Chrome" : "Gemini"}`, "create");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo traducir el documento.");
      setStatus("");
    } finally { setBusy(false); }
  };

  const edit = (page: number, text: string) => setPages((cur) => cur.map((p) => (p.page === page ? { ...p, translated: text } : p)));
  const chromeReady = chromeState === "available" || chromeState === "downloadable" || chromeState === "downloading";

  return (
    <section className="business-module translator-module">
      <div className="module-hero"><div><p className="eyebrow">Idiomas</p><h2>Traductor de documentos <span className="beta-tag">beta</span></h2><p>Sube un PDF o una foto en inglés y obtén el texto en español para revisar, corregir y descargar en Word o PDF. Está en prueba: revise siempre la traducción antes de usarla en un documento oficial y no suba datos de pacientes.</p></div></div>
      <section className="business-card">
        <div className="section-heading"><div><p className="eyebrow">Paso 1</p><h3>Elige el documento</h3></div></div>
        <label className="upload-drop" style={{ display: "block", padding: 24, border: "2px dashed var(--line, #cbd3c8)", borderRadius: 12, textAlign: "center", cursor: "pointer" }}>
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => pick(e.target.files?.[0] ?? null)} disabled={busy} />
          <strong>{file ? file.name : "Pulsa aquí y elige un PDF o una foto"}</strong>
          <span style={{ display: "block", marginTop: 6, color: "var(--muted, #5f716d)" }}>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "Máximo 20 MB y 40 páginas"}</span>
        </label>
      </section>
      <section className="business-card">
        <div className="section-heading"><div><p className="eyebrow">Paso 2</p><h3>Elige cómo traducir</h3></div></div>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <input type="radio" name="engine" checked={engine === "chrome"} onChange={() => setEngine("chrome")} disabled={!chromeReady || busy} />
            <span><strong>En esta computadora (Chrome)</strong><br /><small>Privado: el texto no sale de tu equipo. {chromeState === "available" ? "Listo." : chromeReady ? "La primera vez descarga el idioma (puede tardar unos minutos)." : "No está disponible en este navegador (use Chrome actualizado)."}</small></span>
          </label>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <input type="radio" name="engine" checked={engine === "gemini"} onChange={() => setEngine("gemini")} disabled={geminiOk === false || busy} />
            <span><strong>Con Gemini (más preciso)</strong><br /><small>Envía el texto a Google para traducirlo. {geminiOk === false ? "Todavía no está configurado." : geminiOk ? "Listo." : "Revisando…"}</small></span>
          </label>
          {engine === "gemini" && <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" checked={noPatients} onChange={(e) => setNoPatients(e.target.checked)} /><span>Confirmo que este documento <strong>no tiene datos de pacientes</strong>.</span></label>}
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="primary-button" onClick={start} disabled={!file || busy}>{busy ? "Traduciendo…" : "Traducir al español"}</button>
          {busy && <button className="secondary-button" onClick={() => { stop.current = true; }}>Cancelar</button>}
        </div>
        {status && <p className="local-note" role="status">{status}</p>}
        {warn && <p className="local-note" style={{ color: "#8a5a00" }}>{warn}</p>}
        {error && <p className="local-note" role="alert" style={{ color: "#b3412b" }}>{error}</p>}
      </section>
      {pages.length > 0 && (
        <section className="business-card">
          <div className="section-heading"><div><p className="eyebrow">Paso 3</p><h3>Revisa y descarga</h3></div>
            <div className="hero-actions export-actions">
              <button className="secondary-button" onClick={() => setShowSource((v) => !v)}>{showSource ? "Ocultar original" : "Ver original"}</button>
              <button className="secondary-button" onClick={() => navigator.clipboard?.writeText(pages.map((p) => p.translated).join("\n\n"))}>Copiar</button>
              <button className="secondary-button" disabled={busy} onClick={() => file && exportTranslationWord(pages, file.name)}>Word</button>
              <button className="primary-button" disabled={busy} onClick={() => file && exportTranslationPdf(pages, file.name)}>PDF</button>
            </div></div>
          <p className="local-note">Es una traducción automática. Léela completa y corrige lo que haga falta antes de usarla. Puedes editar el texto aquí mismo.</p>
          {pages.map((p) => (
            <div key={p.page} style={{ display: "grid", gridTemplateColumns: showSource ? "1fr 1fr" : "1fr", gap: 14, marginBottom: 18 }}>
              {showSource && <div><strong>Página {p.page} · original</strong><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, background: "#f4f6f1", padding: 12, borderRadius: 8, margin: "6px 0 0" }}>{p.source}</pre></div>}
              <label><strong>Página {p.page} · español</strong><textarea rows={Math.min(22, Math.max(6, Math.ceil(p.translated.length / 90)))} value={p.translated} onChange={(e) => edit(p.page, e.target.value)} style={{ width: "100%", marginTop: 6 }} /></label>
            </div>
          ))}
        </section>
      )}
    </section>
  );
}
