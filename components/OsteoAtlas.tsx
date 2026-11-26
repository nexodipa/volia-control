"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  IMPLANTS, LESSONS, MEASURES, PATTERNS, QUIZ, SOURCES, ZONES, gradeQuiz,
  type FractureKey, type ImplantId, type ZoneId,
} from "../lib/osteo-atlas";
import type { HecamItem } from "../lib/hecam";
import type { SceneController, ViewName } from "./osteo-scene";

type Tab = "explorar" | "fracturas" | "implantes" | "lecciones" | "quiz";

const TABS: { id: Tab; label: string }[] = [
  { id: "explorar", label: "Explorar" },
  { id: "fracturas", label: "Fracturas" },
  { id: "implantes", label: "Implantes" },
  { id: "lecciones", label: "Lecciones" },
  { id: "quiz", label: "Quiz" },
];

const VIEWS: { id: ViewName; label: string }[] = [
  { id: "volar", label: "Volar" },
  { id: "dorsal", label: "Dorsal" },
  { id: "radial", label: "Radial" },
  { id: "articular", label: "Articular" },
];

const PART_BUTTONS: ZoneId[] = [
  "radius-articular", "radius-styloid", "radius-volar-rim", "radius-lister", "radius-sigmoid",
  "radius-metaphysis", "radius-shaft", "ulna-head", "ulna-styloid", "carpus",
];

/** Vista que deja ver mejor cada zona al seleccionarla desde la lista. */
const ZONE_VIEW: Partial<Record<ZoneId, ViewName>> = {
  "radius-articular": "articular", "radius-styloid": "radial", "radius-volar-rim": "volar",
  "radius-lister": "dorsal", "radius-sigmoid": "volar", plate: "volar",
};

const usd = (v?: number) => v === undefined || v === null ? "—" : new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: v < 10 ? 2 : 0 }).format(v);
const qty = (v?: number) => v === undefined || v === null ? "—" : new Intl.NumberFormat("es-EC", { maximumFractionDigits: 0 }).format(v);

/**
 * Atlas interno de osteosíntesis de Volia: modelo 3D interactivo del radio distal con fracturas, implantes,
 * lecciones y un quiz. Los precios salen de la programación 2026 del HECAM. Contenido pendiente de revisión
 * por un traumatólogo; no lleva datos de pacientes.
 */
export default function OsteoAtlas({ onOpenQuote }: { onOpenQuote?: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneController | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState<Tab>("explorar");
  const [view, setView] = useState<ViewName>("volar");
  const [zone, setZone] = useState<ZoneId | null>(null);
  const [fracture, setFracture] = useState<FractureKey>("none");
  const [reduced, setReduced] = useState(true);
  const [shown, setShown] = useState<Set<ImplantId>>(new Set());
  const [hecam, setHecam] = useState<HecamItem[] | null>(null);
  const [hecamError, setHecamError] = useState("");
  const [lesson, setLesson] = useState<string | null>(null);
  const [answers, setAnswers] = useState<(number | undefined)[]>([]);
  const [step, setStep] = useState(0);

  // La escena se crea una sola vez; `three` se descarga solo al abrir este módulo.
  useEffect(() => {
    let alive = true;
    let controller: SceneController | null = null;
    (async () => {
      try {
        const [sceneMod, THREE, controlsMod] = await Promise.all([
          import("./osteo-scene"),
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
  }, []);

  useEffect(() => { scene.current?.setSelected(zone); }, [zone, status]);

  // Los precios se cargan solo cuando se abre la pestaña de implantes.
  useEffect(() => {
    if (tab !== "implantes" || hecam) return;
    let alive = true;
    fetch("/data/hecam-2026.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (alive) setHecam(d.items); })
      .catch((e) => { if (alive) setHecamError(`No se pudieron cargar los precios del HECAM (${e.message}).`); });
    return () => { alive = false; };
  }, [tab, hecam]);

  const byCode = useMemo(() => new Map((hecam ?? []).map((i) => [i.c, i])), [hecam]);

  const pickFracture = (id: FractureKey) => {
    setFracture(id);
    setReduced(id === "none");
    scene.current?.setFracture(id);
  };
  const toggleReduction = (value: boolean) => {
    setReduced(value);
    scene.current?.setReduced(value);
  };
  const toggleImplant = (id: ImplantId) => {
    const next = new Set(shown);
    if (next.has(id)) next.delete(id); else next.add(id);
    setShown(next);
    scene.current?.setImplants(next);
    if (next.has(id) && !reduced) toggleReduction(true);
  };
  const goView = (v: ViewName) => { setView(v); scene.current?.setView(v); };
  const selectPart = (z: ZoneId) => {
    setZone(z);
    const v = ZONE_VIEW[z];
    if (v) goView(v);
  };

  const info = zone ? ZONES[zone] : null;
  const pattern = PATTERNS[fracture];
  const result = gradeQuiz(answers);
  const finished = step >= QUIZ.length;

  return (
    <div className="atlas">
      <div className="atlas-intro">
        <div>
          <strong>Atlas de osteosíntesis</strong>
          <span>Radio distal: toque una parte del hueso o de un implante para ver qué es, qué se cuida y qué producto lo cubre.</span>
        </div>
        <small>Material interno de formación. Contenido pendiente de revisión por un traumatólogo; no reemplaza el criterio del cirujano.</small>
      </div>

      <div className="atlas-stage">
        <div className="atlas-viewer">
          <div className="atlas-canvas" ref={holder} aria-label="Modelo 3D del radio distal" role="img" />
          {status === "loading" && <div className="atlas-overlay">Cargando el modelo 3D…</div>}
          {status === "error" && <div className="atlas-overlay">Este dispositivo no pudo mostrar el modelo 3D. Las lecciones y el quiz siguen disponibles.</div>}
          <div className="atlas-views" role="group" aria-label="Vistas">
            {VIEWS.map((v) => (
              <button key={v.id} type="button" className={view === v.id ? "active" : ""} onClick={() => goView(v.id)}>{v.label}</button>
            ))}
          </div>
          {status === "ready" && !zone && <div className="atlas-hint">Arrastre para girar, pellizque para acercar, toque para elegir una parte</div>}
          {zone && <div className="atlas-hint on">{ZONES[zone].name}</div>}
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
                    {info.implant && <button type="button" onClick={() => setTab("implantes")}>Ver el implante: {IMPLANTS[info.implant].name}</button>}
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
                {PART_BUTTONS.map((z) => (
                  <button key={z} type="button" className={zone === z ? "active" : ""} onClick={() => selectPart(z)}>{ZONES[z].name.replace(/ \(.*\)$/, "")}</button>
                ))}
              </div>
              <table className="atlas-table">
                <caption>Cinco medidas de la radiografía</caption>
                <tbody>
                  {MEASURES.map((m) => (
                    <tr key={m.name}><th scope="row">{m.name}</th><td>{m.normal}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "fracturas" && (
            <div className="atlas-body">
              <div className="atlas-choice" role="group" aria-label="Patrón de fractura">
                {(Object.keys(PATTERNS) as FractureKey[]).map((id) => (
                  <button key={id} type="button" className={fracture === id ? "active" : ""} onClick={() => pickFracture(id)}>
                    <b>{PATTERNS[id].ao}</b>
                    <span>{PATTERNS[id].name}</span>
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
                          {shown.has(id) ? "Ocultar" : "Mostrar"} {IMPLANTS[id].name.toLowerCase()}
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
              {(Object.keys(IMPLANTS) as ImplantId[]).map((id) => {
                const imp = IMPLANTS[id];
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

          {tab === "lecciones" && (
            <div className="atlas-body">
              {LESSONS.map((l, i) => (
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
                <ul>{SOURCES.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}</ul>
              </details>
            </div>
          )}

          {tab === "quiz" && (
            <div className="atlas-body">
              {!finished ? (
                <article className="atlas-card">
                  <small>Pregunta {step + 1} de {QUIZ.length}</small>
                  <h3>{QUIZ[step].q}</h3>
                  <div className="atlas-options">
                    {QUIZ[step].options.map((o, i) => {
                      const answered = answers[step] !== undefined;
                      const cls = !answered ? "" : i === QUIZ[step].answer ? "right" : i === answers[step] ? "wrong" : "";
                      return (
                        <button key={o} type="button" className={cls} disabled={answered} onClick={() => { const next = [...answers]; next[step] = i; setAnswers(next); }}>{o}</button>
                      );
                    })}
                  </div>
                  {answers[step] !== undefined && (
                    <>
                      <p className="atlas-why"><b>{answers[step] === QUIZ[step].answer ? "Correcto." : "No exactamente."}</b> {QUIZ[step].why}</p>
                      <div className="atlas-actions"><button type="button" onClick={() => setStep(step + 1)}>{step + 1 < QUIZ.length ? "Siguiente" : "Ver resultado"}</button></div>
                    </>
                  )}
                </article>
              ) : (
                <article className="atlas-card">
                  <h3>{result.correct} de {result.total} correctas ({result.pct}%)</h3>
                  <p>{result.pct >= 80 ? "Buen dominio del radio distal. El siguiente paso es otra familia de huesos." : "Repase las lecciones donde falló y vuelva a intentarlo."}</p>
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
