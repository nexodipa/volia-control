"use client";

import { useEffect, useMemo, useState } from "react";
import { daysUntil } from "../lib/business-alerts";
import { recordActivity } from "../lib/activity-log";
import { businessIsoDate } from "../lib/date-utils";
import { readStoredArray, STORAGE_KEYS, writeStoredJson } from "../lib/storage";
import { normalizeTender, sortTenders, TENDER_ORDER, TENDER_STATUS, tenderFromParams, tenderStats, type Tender, type TenderStatus } from "../lib/tenders";
import { BarList, Donut } from "./charts";

const money = (value: number) => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
const dateLabel = (value: string) => (value ? new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : "Sin fecha");
const uid = () => `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const blank = (): Tender => ({ id: "", ref: "", title: "", buyer: "", province: "", amount: 0, deadline: "", status: "interested", ourPrice: 0, winnerPrice: 0, winner: "", notes: "", createdAt: "" });

function deadlineText(t: Tender, today: string) {
  if (!t.deadline) return { text: "Sin fecha límite", tone: "gray" };
  const d = daysUntil(t.deadline, today);
  if (!TENDER_STATUS[t.status].open) return { text: dateLabel(t.deadline), tone: "gray" };
  if (t.status === "offered") return { text: `Se ofertó (límite ${dateLabel(t.deadline)})`, tone: "blue" };
  if (d < 0) return { text: `Venció hace ${-d} día(s)`, tone: "red" };
  if (d === 0) return { text: "Vence hoy", tone: "red" };
  if (d <= 3) return { text: `Faltan ${d} día(s)`, tone: "red" };
  if (d <= 7) return { text: `Faltan ${d} días`, tone: "yellow" };
  return { text: `Faltan ${d} días (${dateLabel(t.deadline)})`, tone: "green" };
}

export default function TenderTracker() {
  const [items, setItems] = useState<Tender[]>([]);
  const [restored, setRestored] = useState(false);
  const [draft, setDraft] = useState<Tender>(blank());
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"open" | "all" | TenderStatus>("open");
  const today = businessIsoDate();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readStoredArray<unknown>(STORAGE_KEYS.tenders).map(normalizeTender).filter((t): t is Tender => !!t);
      setItems(stored);
      setRestored(true);
      // Enlace del correo del SERCOP: ?seguir=CÓDIGO&d=…&c=…&m=…&r=…
      const prefill = tenderFromParams(window.location.search);
      if (prefill) {
        const existing = stored.find((t) => t.ref.toLowerCase() === prefill.ref?.toLowerCase());
        if (existing) setNotice(`El proceso ${existing.ref} ya estaba en seguimiento (${TENDER_STATUS[existing.status].label}).`);
        else { setDraft({ ...blank(), ...prefill }); setShowForm(true); setNotice("Revise los datos y presione «Guardar» para empezar a darle seguimiento."); }
        window.history.replaceState(null, "", window.location.pathname);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (restored) writeStoredJson(STORAGE_KEYS.tenders, items); }, [items, restored]);

  const stats = useMemo(() => tenderStats(items), [items]);
  const visible = useMemo(() => sortTenders(items).filter((t) => (filter === "all" ? true : filter === "open" ? TENDER_STATUS[t.status].open : t.status === filter)), [items, filter]);
  const duplicate = !draft.id && !!draft.ref.trim() && items.some((t) => t.ref.toLowerCase() === draft.ref.trim().toLowerCase());

  const save = () => {
    if (!draft.ref.trim() || duplicate) return;
    const next = normalizeTender({ ...draft, id: draft.id || uid(), ref: draft.ref.trim(), createdAt: draft.createdAt || new Date().toISOString() });
    if (!next) return;
    setItems((cur) => (draft.id ? cur.map((t) => (t.id === draft.id ? next : t)) : [next, ...cur]));
    recordActivity("Procesos", draft.id ? "Proceso actualizado" : "Proceso en seguimiento", `${next.ref} · ${next.buyer || "sin entidad"}`);
    setDraft(blank()); setShowForm(false); setNotice("");
  };
  const patch = (id: string, change: Partial<Tender>, what: string) => {
    const target = items.find((t) => t.id === id);
    setItems((cur) => cur.map((t) => (t.id === id ? { ...t, ...change } : t)));
    if (target) recordActivity("Procesos", what, target.ref, "update");
  };
  const remove = (t: Tender) => {
    if (!window.confirm("¿Quitar este proceso del seguimiento?")) return;
    setItems((cur) => cur.filter((x) => x.id !== t.id));
    recordActivity("Procesos", "Proceso eliminado", t.ref, "delete");
  };

  const pipeline = TENDER_ORDER.filter((s) => s !== "dropped" || stats.byStatus.dropped > 0).map((s) => ({ label: TENDER_STATUS[s].label, value: stats.byStatus[s], display: String(stats.byStatus[s]), tone: (TENDER_STATUS[s].tone === "yellow" ? "sun" : TENDER_STATUS[s].tone === "red" ? "coral" : TENDER_STATUS[s].tone) as "green" | "sun" | "coral" | "blue" | "gray" }));

  return <section className="case-module">
    <div className="case-hero"><div><p className="eyebrow">Licitaciones</p><h2>Procesos en seguimiento</h2><p>Los procesos del SERCOP que decide revisar u ofertar, con su fecha límite, su resultado y cuánto se cerró.</p></div><div className="case-actions"><button className="primary-button" onClick={() => { setDraft(blank()); setShowForm((v) => !v); }}>{showForm ? "Cerrar" : "+ Seguir un proceso"}</button></div></div>

    {notice && <p className="memory-confirmation" role="status">{notice}</p>}

    <div className="case-kpis">
      <article><span>Abiertos</span><strong>{stats.open}</strong><small>Por revisar, en preparación u ofertados</small></article>
      <article><span>Presupuesto en juego</span><strong>{money(stats.inPlay)}</strong><small>Suma de los abiertos</small></article>
      <article><span>Tasa de éxito</span><strong>{stats.winRate === null ? "—" : `${Math.round(stats.winRate * 100)} %`}</strong><small>{stats.decided ? `${stats.byStatus.won} de ${stats.decided} resueltos` : "Aún sin resultados"}</small></article>
      <article><span>Adjudicado a Volia</span><strong>{money(stats.wonAmount)}</strong><small>{stats.typicalOfferRatio === null ? "Registre lo ofertado para ver su descuento típico" : `Se oferta alrededor del ${Math.round(stats.typicalOfferRatio * 100)} % del presupuesto`}</small></article>
    </div>

    {items.length > 0 && <div className="stat-grid">
      <section className="stat-panel"><h4>Dónde está cada proceso</h4><BarList items={pipeline} tone="green" /></section>
      {stats.decided + stats.byStatus.dropped > 0 && <section className="stat-panel"><h4>Cómo han terminado</h4><Donut label="Resultados de los procesos" center={stats.winRate === null ? "" : `${Math.round(stats.winRate * 100)} %`} slices={[{ label: "Adjudicados", value: stats.byStatus.won, tone: "green" }, { label: "Perdidos", value: stats.byStatus.lost, tone: "coral" }, { label: "Descartados", value: stats.byStatus.dropped, tone: "gray" }]} /></section>}
    </div>}

    {showForm && <section className="case-form-card">
      <div className="case-section-title"><div><p className="eyebrow">{draft.id ? "Editar" : "Nuevo"}</p><h3>{draft.id ? "Editar proceso" : "Seguir un proceso del SERCOP"}</h3></div><span>El código es obligatorio</span></div>
      <div className="case-form-grid">
        <label><span>Código del proceso *</span><input value={draft.ref} placeholder="Ej. SIE-HG-AM-2026-036-2764" onChange={(e) => setDraft({ ...draft, ref: e.target.value })} /></label>
        <label><span>Entidad contratante</span><input value={draft.buyer} onChange={(e) => setDraft({ ...draft, buyer: e.target.value })} /></label>
        <label><span>Provincia</span><input value={draft.province} onChange={(e) => setDraft({ ...draft, province: e.target.value })} /></label>
        <label><span>Presupuesto referencial (USD)</span><input type="number" min="0" step="0.01" value={draft.amount || ""} onChange={(e) => setDraft({ ...draft, amount: Math.max(0, Number(e.target.value) || 0) })} /></label>
        <label><span>Fecha límite para ofertar</span><input type="date" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} /></label>
        <label><span>Estado</span><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as TenderStatus })}>{TENDER_ORDER.map((s) => <option key={s} value={s}>{TENDER_STATUS[s].label}</option>)}</select></label>
      </div>
      <label className="case-notes"><span>Qué se contrata</span><textarea value={draft.title} placeholder="Descripción del proceso" onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
      <label className="case-notes"><span>Notas</span><textarea value={draft.notes} placeholder="Requisitos, llamadas, aclaraciones" onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
      {duplicate && <p className="text-danger" role="alert">Ese código ya está en seguimiento.</p>}
      <div className="case-form-footer"><small>Se comparte con todo el equipo que usa el sistema.</small><div>{draft.id && <button className="secondary-button" onClick={() => { setDraft(blank()); setShowForm(false); }}>Cancelar edición</button>}<button className="primary-button" disabled={!draft.ref.trim() || duplicate} onClick={save}>{draft.id ? "Actualizar" : "Guardar"}</button></div></div>
    </section>}

    <section className="case-table-card">
      <div className="case-toolbar"><div><p className="eyebrow">Seguimiento</p><h3>Procesos</h3></div><div className="case-filters"><select aria-label="Filtrar procesos" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="open">Solo abiertos</option><option value="all">Todos</option>{TENDER_ORDER.map((s) => <option key={s} value={s}>{TENDER_STATUS[s].label}</option>)}</select></div></div>
      <div className="case-list">{visible.map((t) => {
        const when = deadlineText(t, today);
        const closing = t.status === "won" || t.status === "lost";
        return <article className="case-row" key={t.id}>
          <div className="case-main"><div className="case-name"><span className={`status-dot ${TENDER_STATUS[t.status].tone}`}></span><div><strong>{t.ref}</strong><small>{t.buyer || "Entidad no indicada"}{t.province ? ` · ${t.province}` : ""}</small></div></div><span className={`status-pill ${when.tone}`}>{when.text}</span></div>
          <div className="case-details"><div><span>Qué se contrata</span><strong>{t.title ? (t.title.length > 90 ? `${t.title.slice(0, 90)}…` : t.title) : "—"}</strong></div><div><span>Presupuesto</span><strong>{t.amount ? money(t.amount) : "No indicado"}</strong></div><div><span>Estado</span><select aria-label={`Estado de ${t.ref}`} value={t.status} onChange={(e) => patch(t.id, { status: e.target.value as TenderStatus }, `Estado: ${TENDER_STATUS[e.target.value as TenderStatus].label}`)}>{TENDER_ORDER.map((s) => <option key={s} value={s}>{TENDER_STATUS[s].label}</option>)}</select></div></div>
          <details className="case-expand"><summary>{closing ? "Resultado y notas" : "Detalle y notas"}</summary><div className="case-management">
            {closing && <div className="business-form">
              <label><span>Lo que ofertó Volia (USD)</span><input type="number" min="0" step="0.01" value={t.ourPrice || ""} onChange={(e) => patch(t.id, { ourPrice: Math.max(0, Number(e.target.value) || 0) }, "Precio ofertado registrado")} /></label>
              <label><span>Con cuánto se cerró (USD)</span><input type="number" min="0" step="0.01" value={t.winnerPrice || ""} onChange={(e) => patch(t.id, { winnerPrice: Math.max(0, Number(e.target.value) || 0) }, "Precio de cierre registrado")} /></label>
              <label><span>Ganador</span><input value={t.winner} onChange={(e) => patch(t.id, { winner: e.target.value }, "Ganador registrado")} /></label>
            </div>}
            <div><span>Notas</span><small>{t.notes || "Sin notas."}</small></div>
            <div className="record-actions"><button className="edit-record" onClick={() => { setDraft(t); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Editar</button><button className="delete-record" onClick={() => remove(t)}>Quitar</button></div>
          </div></details>
        </article>;
      })}{!visible.length && <div className="case-empty"><strong>{items.length ? "No hay procesos con este filtro" : "Aún no sigue ningún proceso"}</strong><span>{items.length ? "Cambie el filtro para ver el resto." : "Use el enlace «Dar seguimiento» del correo del SERCOP o el botón «Seguir un proceso»."}</span></div>}</div>
    </section>
  </section>;
}
