"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ATLAS_REGIONS, atlasRegion } from "../lib/osteo-regions";
import { gradeRegionQuiz, type SceneId } from "../lib/osteo-region";
import type { HecamItem } from "../lib/hecam";
import {
  FAMILIES, FAMILY_BY_ID, MATERIALS, MATERIALS_GUIDE, REGIONS, bestPrice, buildCatalog, familyCounts, filterRows,
  type FamilyId, type Material, type Region,
} from "../lib/osteo-catalog";
import type { SceneController, SceneFactory } from "./osteo-engine";

type Tab = "explorar" | "fracturas" | "implantes" | "catalogo" | "lecciones" | "quiz";

const TABS: { id: Tab; label: string }[] = [
  { id: "explorar", label: "Explorar" },
  { id: "fracturas", label: "Fracturas" },
  { id: "implantes", label: "Implantes" },
  { id: "catalogo", label: "Catálogo" },
  { id: "lecciones", label: "Lecciones" },
  { id: "quiz", label: "Quiz" },
];

/** Cada escena 3D se descarga solo cuando se elige su región. */
const SCENES: Record<SceneId, () => Promise<{ createScene: SceneFactory }>> = {
  radius: () => import("./osteo-scene"),
  tibia: () => import("./osteo-scene-tibia"),
};
const PAGE = 40;

const usd = (v?: number) => v === undefined || v === null ? "—" : new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: v < 10 ? 2 : 0 }).format(v);
const qty = (v?: number) => v === undefined || v === null ? "—" : new Intl.NumberFormat("es-EC", { maximumFractionDigits: 0 }).format(v);

/**
 * Atlas interno de osteosíntesis de Volia: modelo 3D interactivo por región (radio distal, tibia) con fracturas,
 * implantes, lecciones y un quiz. Los precios salen de la programación 2026 del HECAM. Contenido pendiente de revisión
 * por un traumatólogo; no lleva datos de pacientes.
 */
export default function OsteoAtlas({ onOpenQuote }: { onOpenQuote?: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneController | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState<Tab>("explorar");
  const [regionId, setRegionId] = useState("radius");
  const reg = atlasRegion(regionId);
  const [view, setView] = useState(reg.firstView);
  const [zone, setZone] = useState<string | null>(null);
  const [fracture, setFracture] = useState("none");
  const [reduced, setReduced] = useState(true);
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [hecam, setHecam] = useState<HecamItem[] | null>(null);
  const [hecamError, setHecamError] = useState("");
  const [family, setFamily] = useState<FamilyId | "">("");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<Region | "">("");
  const [material, setMaterial] = useState<Material | "">("");
  const [onlyPriced, setOnlyPriced] = useState(false);
  const [sort, setSort] = useState<"codigo" | "menor" | "mayor">("codigo");
  const [limit, setLimit] = useState(PAGE);
  const [lesson, setLesson] = useState<string | null>(null);
  const [answers, setAnswers] = useState<(number | undefined)[]>([]);
  const [step, setStep] = useState(0);

  // La escena se crea al elegir la región; `three` se descarga solo al abrir este módulo.
  const sceneId = reg.sceneId;
  useEffect(() => {
    let alive = true;
    let controller: SceneController | null = null;
    (async () => {
      try {
        const [sceneMod, THREE, controlsMod] = await Promise.all([
          SCENES[sceneId](),
          import("three"),
          import("three/examples/jsm/controls/OrbitControls.js"),
        ]);
        if (!alive || !holder.current) return;
        controller = sceneMod.createScene(THREE, controlsMod.OrbitControls, holder.current, {
          onSelect: (z) => { setZone(z); if (z) setTab("explorar"); },
        });
        scene.current = controller;
        setStatus("ready");
      } catch {
        if (alive) setStatus("error");
      }
    })();
    return () => { alive = false; controller?.dispose(); scene.current = null; };
  }, [sceneId]);

  useEffect(() => { scene.current?.setSelected(zone); }, [zone, status]);

  // Los precios se cargan solo cuando se abre la pestaña de implantes.
  useEffect(() => {
    if ((tab !== "implantes" && tab !== "catalogo") || hecam) return;
    let alive = true;
    fetch("/data/hecam-2026.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (alive) setHecam(d.items); })
      .catch((e) => { if (alive) setHecamError(`No se pudieron cargar los precios del HECAM (${e.message}).`); });
    return () => { alive = false; };
  }, [tab, hecam]);

  const byCode = useMemo(() => new Map((hecam ?? []).map((i) => [i.c, i])), [hecam]);
  const catalog = useMemo(() => buildCatalog(hecam ?? []), [hecam]);
  const counts = useMemo(() => familyCounts(catalog), [catalog]);
  const rows = useMemo(() => {
    const out = filterRows(catalog, { family, query, region, material, onlyPriced });
    if (sort === "codigo") return out.sort((a, b) => a.code.localeCompare(b.code));
    const p = (r: (typeof out)[number]) => bestPrice(r) ?? (sort === "menor" ? Infinity : -Infinity);
    return out.sort((a, b) => (sort === "menor" ? p(a) - p(b) : p(b) - p(a)));
  }, [catalog, family, query, region, material, onlyPriced, sort]);
  const selectedFamily = family ? FAMILY_BY_ID[family] : null;
  const resetCatalogPage = () => setLimit(PAGE);

  const changeRegion = (id: string) => {
    if (id === regionId) return;
    const next = atlasRegion(id);
    setStatus("loading");
    setRegionId(id);
    setView(next.firstView);
    setZone(null);
    setFracture("none");
    setReduced(true);
    setShown(new Set());
    setLesson(null);
    setAnswers([]);
    setStep(0);
  };

  const pickFracture = (id: string) => {
    setFracture(id);
    setReduced(id === "none");
    scene.current?.setFracture(id);
  };
  const toggleReduction = (value: boolean) => {
    setReduced(value);
    scene.current?.setReduced(value);
  };
  const toggleImplant = (id: string) => {
    const next = new Set(shown);
    if (next.has(id)) next.delete(id); else next.add(id);
    setShown(next);
    scene.current?.setImplants(next);
    if (next.has(id) && !reduced) toggleReduction(true);
  };
  const goView = (v: string) => { setView(v); scene.current?.setView(v); };
  const selectPart = (z: string) => {
    setZone(z);
    const v = reg.zoneView[z];
    if (v) goView(v);
  };

  const info = zone ? reg.zones[zone] ?? null : null;
  const pattern = reg.patterns[fracture] ?? reg.patterns.none;
  const quiz = reg.quiz;
  const result = gradeRegionQuiz(reg, answers);
  const finished = step >= quiz.length;

  return (
    <div className="atlas">
      <div className="atlas-intro">
        <div>
          <strong>Atlas de osteosíntesis</strong>
          <span>{reg.intro}</span>
        </div>
        <div className="atlas-regions" role="group" aria-label="Región del atlas">
          {ATLAS_REGIONS.map((r) => (
            <button key={r.id} type="button" className={r.id === regionId ? "active" : ""} aria-pressed={r.id === regionId} onClick={() => changeRegion(r.id)}>{r.label}</button>
          ))}
        </div>
        <small>Material interno de formación. Contenido pendiente de revisión por un traumatólogo; no reemplaza el criterio del cirujano.</small>
      </div>

      <div className="atlas-stage">
        <div className="atlas-viewer">
          <div className="atlas-canvas" ref={holder} aria-label={reg.modelLabel} role="img" />
          {status === "loading" && <div className="atlas-overlay">Cargando el modelo 3D…</div>}
          {status === "error" && <div className="atlas-overlay">Este dispositivo no pudo mostrar el modelo 3D. Las lecciones y el quiz siguen disponibles.</div>}
          <div className="atlas-views" role="group" aria-label="Vistas">
            {reg.views.map((v) => (
              <button key={v.id} type="button" className={view === v.id ? "active" : ""} onClick={() => goView(v.id)}>{v.label}</button>
            ))}
          </div>
          {status === "ready" && !zone && <div className="atlas-hint">Arrastre para girar, pellizque para acercar, toque para elegir una parte</div>}
          {info && <div className="atlas-hint on">{info.name}</div>}
        </div>

        <aside className="atlas-panel">
          <div className="atlas-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>

          {tab === "explorar" && (
            <div className="atlas-body">
              {info ? (
                <article className="atlas-card">
                  <h3>{info.name}</h3>
                  <p>{info.summary}</p>
                  <ul>{info.points.map((p) => <li key={p}>{p}</li>)}</ul>
                  {info.watch && <p className="atlas-watch"><b>Qué vigilar.</b> {info.watch}</p>}
                  <div className="atlas-actions">
                    {info.implant && reg.implants[info.implant] && <button type="button" onClick={() => setTab("implantes")}>Ver el implante: {reg.implants[info.implant].name}</button>}
                    <button type="button" className="ghost" onClick={() => setZone(null)}>Quitar selección</button>
                  </div>
                </article>
              ) : (
                <article className="atlas-card">
                  <h3>Elija una parte</h3>
                  <p>Toque el hueso en el modelo, o elija una zona de la lista. Los implantes se explican en su pestaña.</p>
                </article>
              )}
              <div className="atlas-parts" role="group" aria-label="Partes del hueso">
                {reg.partButtons.map((z) => (
                  <button key={z} type="button" className={zone === z ? "active" : ""} onClick={() => selectPart(z)}>{reg.zones[z].name.replace(/ \(.*\)$/, "")}</button>
                ))}
              </div>
              <table className="atlas-table">
                <caption>{reg.measuresCaption}</caption>
                <tbody>
                  {reg.measures.map((m) => (
                    <tr key={m.name}><th scope="row">{m.name}</th><td>{m.normal}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "fracturas" && (
            <div className="atlas-body">
              <div className="atlas-choice" role="group" aria-label="Patrón de fractura">
                {reg.patternOrder.map((id) => (
                  <button key={id} type="button" className={fracture === id ? "active" : ""} onClick={() => pickFracture(id)}>
                    <b>{reg.patterns[id].ao}</b>
                    <span>{reg.patterns[id].name}</span>
                  </button>
                ))}
              </div>
              <article className="atlas-card">
                <h3>{pattern.name}</h3>
                {pattern.classic && <p className="atlas-classic">{pattern.classic}</p>}
                <p>{pattern.summary}</p>
                {fracture !== "none" && (
                  <>
                    <div className="atlas-switch" role="group" aria-label="Estado de la fractura">
                      <button type="button" className={!reduced ? "active" : ""} onClick={() => toggleReduction(false)}>Desplazada</button>
                      <button type="button" className={reduced ? "active" : ""} onClick={() => toggleReduction(true)}>Reducida</button>
                    </div>
                    <h4>Qué mirar en la radiografía</h4>
                    <ul>{pattern.lookFor.map((p) => <li key={p}>{p}</li>)}</ul>
                    <p><b>Estabilidad.</b> {pattern.stability}</p>
                    <p><b>Opciones habituales.</b> {pattern.why}</p>
                    <div className="atlas-actions">
                      {pattern.usual.map((id) => (
                        <button key={id} type="button" className={shown.has(id) ? "active" : ""} onClick={() => toggleImplant(id)}>
                          {shown.has(id) ? "Ocultar" : "Mostrar"} {reg.implants[id].name.toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </article>
            </div>
          )}

          {tab === "implantes" && (
            <div className="atlas-body">
              {hecamError && <p className="atlas-watch">{hecamError}</p>}
              {Object.keys(reg.implants).map((id) => {
                const imp = reg.implants[id];
                return (
                  <article className="atlas-card" key={id}>
                    <div className="atlas-card-head">
                      <h3>{imp.name}</h3>
                      <button type="button" className={shown.has(id) ? "active" : ""} onClick={() => toggleImplant(id)} aria-pressed={shown.has(id)}>
                        {shown.has(id) ? "En el modelo" : "Mostrar en el modelo"}
                      </button>
                    </div>
                    <p>{imp.tagline}</p>
                    <details>
                      <summary>Cuándo se usa</summary>
                      <ul>{imp.indications.map((p) => <li key={p}>{p}</li>)}</ul>
                    </details>
                    <details>
                      <summary>Técnica en pocas líneas</summary>
                      <ol>{imp.technique.map((p) => <li key={p}>{p}</li>)}</ol>
                    </details>
                    <details>
                      <summary>Complicaciones</summary>
                      <ul>{imp.complications.map((p) => <li key={p}>{p}</li>)}</ul>
                    </details>
                    <table className="atlas-table prices">
                      <caption>Precios de referencia en el HECAM 2026</caption>
                      <thead><tr><th>Ítem</th><th>Referencial</th><th>Adjudicado</th><th>Programado</th></tr></thead>
                      <tbody>
                        {imp.hecam.map((h) => {
                          const row = byCode.get(h.code);
                          return (
                            <tr key={h.code}>
                              <th scope="row"><b>{h.code}</b> {h.role}{row && <small>{row.n}</small>}</th>
                              <td>{hecam ? usd(row?.pur) : "…"}</td>
                              <td>{hecam ? usd(row?.pua) : "…"}</td>
                              <td>{hecam ? qty(row?.q) : "…"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </article>
                );
              })}
              <p className="atlas-note">Los precios son los públicos del hospital, no el precio de venta de Volia. Para cotizar un caso real use el cotizador.</p>
              {onOpenQuote && <div className="atlas-actions"><button type="button" onClick={onOpenQuote}>Ir al cotizador</button></div>}
            </div>
          )}

          {tab === "catalogo" && (
            <div className="atlas-body">
              {hecamError && <p className="atlas-watch">{hecamError}</p>}
              <p className="atlas-note">Todos los implantes de Traumatología de la programación 2026 del HECAM, agrupados por familia. Elija una familia para ver qué es, cómo funciona y qué mirar al cotizar.</p>
              <div className="atlas-chips" role="group" aria-label="Familias de implantes">
                <button type="button" className={family === "" ? "active" : ""} aria-pressed={family === ""} onClick={() => { setFamily(""); resetCatalogPage(); }}>Todas{hecam ? ` (${catalog.length})` : ""}</button>
                {FAMILIES.filter((f) => !hecam || counts[f.id] > 0).map((f) => (
                  <button key={f.id} type="button" className={family === f.id ? "active" : ""} aria-pressed={family === f.id} onClick={() => { setFamily(f.id); resetCatalogPage(); }}>
                    {f.name}{hecam ? ` (${counts[f.id]})` : ""}
                  </button>
                ))}
              </div>

              {selectedFamily && (
                <article className="atlas-card">
                  <div className="atlas-card-head">
                    <h3>{selectedFamily.name}</h3>
                    {reg.catalogModel[selectedFamily.id] && (
                      <button type="button" onClick={() => { const id = reg.catalogModel[selectedFamily.id]; if (!shown.has(id)) toggleImplant(id); }}>Ver en el modelo 3D: {reg.label.toLowerCase()}</button>
                    )}
                  </div>
                  <p>{selectedFamily.what}</p>
                  <h4>Cómo funciona</h4>
                  <p>{selectedFamily.principle}</p>
                  <h4>Dónde se usa</h4>
                  <p>{selectedFamily.where}</p>
                  {selectedFamily.watch.length > 0 && (
                    <details>
                      <summary>Qué hay que saber</summary>
                      <ul>{selectedFamily.watch.map((p) => <li key={p}>{p}</li>)}</ul>
                    </details>
                  )}
                  {selectedFamily.tender.length > 0 && (
                    <details>
                      <summary>Al cotizar o leer el pliego</summary>
                      <ul>{selectedFamily.tender.map((p) => <li key={p}>{p}</li>)}</ul>
                    </details>
                  )}
                </article>
              )}

              <div className="atlas-filters">
                <input type="search" value={query} placeholder="Buscar por nombre o código" aria-label="Buscar en el catálogo" onChange={(e) => { setQuery(e.target.value); resetCatalogPage(); }} />
                <select value={region} aria-label="Región" onChange={(e) => { setRegion(e.target.value as Region | ""); resetCatalogPage(); }}>
                  <option value="">Todas las regiones</option>
                  {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <select value={material} aria-label="Material" onChange={(e) => { setMaterial(e.target.value as Material | ""); resetCatalogPage(); }}>
                  <option value="">Todos los materiales</option>
                  {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={sort} aria-label="Orden" onChange={(e) => setSort(e.target.value as "codigo" | "menor" | "mayor")}>
                  <option value="codigo">Orden por código</option>
                  <option value="menor">Precio de menor a mayor</option>
                  <option value="mayor">Precio de mayor a menor</option>
                </select>
                <label className="atlas-check"><input type="checkbox" checked={onlyPriced} onChange={(e) => { setOnlyPriced(e.target.checked); resetCatalogPage(); }} /> Solo con precio</label>
              </div>

              {!hecam && !hecamError && <p className="atlas-note">Cargando el catálogo…</p>}
              {hecam && (
                <>
                  <p className="atlas-note" aria-live="polite">{rows.length} {rows.length === 1 ? "ítem" : "ítems"}</p>
                  <ul className="atlas-items">
                    {rows.slice(0, limit).map((r) => (
                      <li key={r.code}>
                        <div className="atlas-item-name"><b>{r.code}</b> {r.name}</div>
                        <small>{FAMILY_BY_ID[r.family].name} · {r.region}{r.material !== "No indicado" ? ` · ${r.material}` : ""}</small>
                        <dl className="atlas-item-prices">
                          <div><dt>Referencial</dt><dd>{usd(r.pur)}</dd></div>
                          <div><dt>Adjudicado</dt><dd>{usd(r.pua)}</dd></div>
                          <div><dt>Programado</dt><dd>{qty(r.q)}</dd></div>
                        </dl>
                        {r.low && <small className="atlas-flag">Precio muy bajo para su familia: revisar unidad y presentación en el pliego.</small>}
                      </li>
                    ))}
                  </ul>
                  {rows.length === 0 && <p className="atlas-note">Ningún ítem coincide con los filtros.</p>}
                  {rows.length > limit && (
                    <div className="atlas-actions"><button type="button" onClick={() => setLimit((n) => n + PAGE)}>Mostrar {Math.min(PAGE, rows.length - limit)} más</button></div>
                  )}
                </>
              )}

              <details className="atlas-card">
                <summary>De qué están hechos los implantes</summary>
                {MATERIALS_GUIDE.map((m) => (
                  <section key={m.name}>
                    <h4>{m.name}</h4>
                    <ul>{m.properties.map((p) => <li key={p}>{p}</li>)}</ul>
                    <p><b>Uso típico:</b> {m.typicalUse}</p>
                    <p><small>{m.note}</small></p>
                  </section>
                ))}
              </details>

              <p className="atlas-note">Los precios son los públicos del hospital (referencial de la programación y adjudicado cuando ya se contrató), no el precio de venta de Volia. La clasificación por familia, región y material se hizo con el nombre del ítem y puede equivocarse: la fuente es el pliego.</p>
              {onOpenQuote && <div className="atlas-actions"><button type="button" onClick={onOpenQuote}>Ir al cotizador</button></div>}
            </div>
          )}

          {tab === "lecciones" && (
            <div className="atlas-body">
              {reg.lessons.map((l, i) => (
                <article className="atlas-card lesson" key={l.id}>
                  <button type="button" className="atlas-lesson-head" aria-expanded={lesson === l.id} onClick={() => setLesson(lesson === l.id ? null : l.id)}>
                    <span className="atlas-lesson-n">{i + 1}</span>
                    <span><b>{l.title}</b><small>{l.summary}</small></span>
                  </button>
                  {lesson === l.id && <div className="atlas-lesson-body">{l.body.map((p) => <p key={p}>{p}</p>)}</div>}
                </article>
              ))}
              <details className="atlas-sources">
                <summary>Fuentes</summary>
                <ul>{reg.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
              </details>
            </div>
          )}

          {tab === "quiz" && (
            <div className="atlas-body">
              {!finished ? (
                <article className="atlas-card">
                  <small>Pregunta {step + 1} de {quiz.length}</small>
                  <h3>{quiz[step].q}</h3>
                  <div className="atlas-options">
                    {quiz[step].options.map((o, i) => {
                      const answered = answers[step] !== undefined;
                      const cls = !answered ? "" : i === quiz[step].answer ? "right" : i === answers[step] ? "wrong" : "";
                      return (
                        <button key={o} type="button" className={cls} disabled={answered} onClick={() => { const next = [...answers]; next[step] = i; setAnswers(next); }}>{o}</button>
                      );
                    })}
                  </div>
                  {answers[step] !== undefined && (
                    <>
                      <p className="atlas-why"><b>{answers[step] === quiz[step].answer ? "Correcto." : "No exactamente."}</b> {quiz[step].why}</p>
                      <div className="atlas-actions"><button type="button" onClick={() => setStep(step + 1)}>{step + 1 < quiz.length ? "Siguiente" : "Ver resultado"}</button></div>
                    </>
                  )}
                </article>
              ) : (
                <article className="atlas-card">
                  <h3>{result.correct} de {result.total} correctas ({result.pct}%)</h3>
                  <p>{result.pct >= 80 ? reg.quizPraise : "Repase las lecciones donde falló y vuelva a intentarlo."}</p>
                  <div className="atlas-actions">
                    <button type="button" onClick={() => { setAnswers([]); setStep(0); }}>Repetir el quiz</button>
                    <button type="button" className="ghost" onClick={() => setTab("lecciones")}>Ir a las lecciones</button>
                  </div>
                </article>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
