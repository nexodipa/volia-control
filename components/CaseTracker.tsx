"use client";

import { useEffect, useMemo, useState } from "react";
import { exportBusinessPdf, exportBusinessWord, type BusinessExport } from "../lib/business-exports";
import { downloadCsv } from "../lib/csv";
import { businessIsoDate } from "../lib/date-utils";
import { readStoredArray, STORAGE_KEYS, writeStoredJson } from "../lib/storage";
import { recordActivity } from "../lib/activity-log";
import { getInsightsForEntity, learnFromCase } from "../lib/knowledge-memory";

type WorkflowStatus = "surgery" | "documents" | "ready" | "submitted" | "review" | "observed" | "approved" | "paid";

type CaseRecord = {
  id: string;
  patient: string;
  hospital: string;
  surgeryDate: string;
  contract: string;
  invoice: string;
  amount: number;
  paidAmount: number;
  submittedDate: string;
  dueDate: string;
  status: WorkflowStatus;
  notes: string;
  documents: { letter: boolean; invoice: boolean; surgery: boolean; implants: boolean; signatures: boolean };
};

const STATUS: Record<WorkflowStatus, { label: string; tone: string }> = {
  surgery: { label: "Cirugía realizada", tone: "gray" },
  documents: { label: "Documentación pendiente", tone: "yellow" },
  ready: { label: "Lista para facturar", tone: "blue" },
  submitted: { label: "Factura presentada", tone: "blue" },
  review: { label: "En revisión", tone: "yellow" },
  observed: { label: "Con observaciones", tone: "red" },
  approved: { label: "Aprobada para pago", tone: "green" },
  paid: { label: "Pagada", tone: "green" },
};

const DOCUMENTS = [
  ["letter", "Carta de implantes"], ["invoice", "Factura / prefactura"], ["surgery", "Parte quirúrgico"],
  ["implants", "Detalle de implantes"], ["signatures", "Firmas y respaldos"],
] as const;

const today = businessIsoDate;
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const money = (value: number) => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value || 0);
const dateLabel = (value: string) => value ? new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : "Sin fecha";

const LEGACY_DEMO_CASE_IDS = new Set(["demo-1", "demo-2", "demo-3"]);

const EMPTY: CaseRecord = { id: "", patient: "", hospital: "", surgeryDate: today(), contract: "", invoice: "", amount: 0, paidAmount: 0, submittedDate: "", dueDate: "", status: "surgery", notes: "", documents: { letter: false, invoice: false, surgery: false, implants: false, signatures: false } };

function responsibleFor(date: string) {
  if (!date) return { name: "Pendiente", period: "Ingrese una fecha", matched: false };
  return { name: "Revisión manual", period: "Configure el responsable institucional", matched: false };
}

function automaticStatus(record: CaseRecord): WorkflowStatus {
  const complete = Object.values(record.documents).every(Boolean);
  if (record.paidAmount >= record.amount && record.amount > 0) return "paid";
  if (record.status === "observed" || record.status === "review" || record.status === "approved" || record.status === "submitted") return record.status;
  if (!complete) return Object.values(record.documents).some(Boolean) ? "documents" : "surgery";
  return record.invoice ? "ready" : "documents";
}

export default function CaseTracker() {
  const [records, setRecords] = useState<CaseRecord[]>([]);
  const [draft, setDraft] = useState<CaseRecord>({ ...EMPTY, documents: { ...EMPTY.documents } });
  const [restored, setRestored] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | WorkflowStatus | "overdue">("all");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = readStoredArray<CaseRecord>(STORAGE_KEYS.cases);
        const clean = stored.filter((record) => !LEGACY_DEMO_CASE_IDS.has(record.id));
        setRecords(clean);
        if (clean.length !== stored.length) writeStoredJson(STORAGE_KEYS.cases, clean);
      } catch { setRecords([]); }
      setRestored(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => { if (restored) writeStoredJson(STORAGE_KEYS.cases, records); }, [records, restored]);

  const enriched = useMemo(() => records.map((record) => {
    const status = automaticStatus(record);
    return { ...record, status, responsible: responsibleFor(record.surgeryDate), pending: Math.max(0, record.amount - record.paidAmount), overdue: !!record.dueDate && status !== "paid" && new Date(`${record.dueDate}T23:59:59`) < new Date() };
  }), [records]);
  const visible = enriched.filter((record) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [record.patient, record.hospital, record.contract, record.invoice, record.responsible.name].some((value) => value.toLowerCase().includes(query));
    const matchesFilter = filter === "all" || (filter === "overdue" ? record.overdue : record.status === filter);
    return matchesSearch && matchesFilter;
  });
  const kpis = useMemo(() => ({
    pending: enriched.reduce((sum, record) => sum + record.pending, 0),
    collected: enriched.reduce((sum, record) => sum + record.paidAmount, 0),
    incomplete: enriched.filter((record) => !Object.values(record.documents).every(Boolean)).length,
    overdue: enriched.filter((record) => record.overdue).length,
  }), [enriched]);
  const draftResponsible = responsibleFor(draft.surgeryDate);

  const saveCase = () => {
    if (!draft.patient.trim() || !draft.surgeryDate || draft.amount <= 0) return;
    const normalizedDraft = { ...draft, paidAmount: Math.min(draft.amount, draft.paidAmount) };
    const next = { ...normalizedDraft, id: draft.id || uid(), patient: draft.patient.trim().toUpperCase(), status: automaticStatus(normalizedDraft) };
    setRecords((current) => draft.id ? current.map((record) => record.id === draft.id ? next : record) : [next, ...current]);
    learnFromCase(next);
    recordActivity("Cirugías", draft.id ? "Expediente actualizado" : "Cirugía registrada", `${next.patient} · ${next.invoice || "Sin factura"}`);
    setDraft({ ...EMPTY, surgeryDate: today(), documents: { ...EMPTY.documents } });
    setShowForm(false);
  };

  const hospitalInsights = useMemo(() => {
    return draft.hospital ? getInsightsForEntity(draft.hospital, "hospital") : [];
  }, [draft.hospital]);

  const setStatus = (id: string, status: WorkflowStatus) => { const target = records.find((record) => record.id === id); setRecords((current) => current.map((record) => record.id === id ? { ...record, status, paidAmount: status === "paid" ? record.amount : record.status === "paid" ? 0 : record.paidAmount } : record)); if (target) recordActivity("Cirugías", "Estado actualizado", `${target.patient} · ${STATUS[status].label}`, "update"); };
  const markDocument = (id: string, key: keyof CaseRecord["documents"]) => {
    const target = records.find((record) => record.id === id);
    setRecords((current) => current.map((record) => record.id === id ? { ...record, documents: { ...record.documents, [key]: !record.documents[key] } } : record));
    if (target) recordActivity("Cirugías", "Checklist actualizado", `${target.patient} · Documento modificado`, "update");
  };
  const editCase = (record: CaseRecord) => { setDraft({ ...record, documents: { ...record.documents } }); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const deleteCase = (id: string) => { const target = records.find((record) => record.id === id); if (window.confirm("¿Eliminar definitivamente este caso y su seguimiento?")) { setRecords((current) => current.filter((record) => record.id !== id)); if (target) recordActivity("Cirugías", "Expediente eliminado", target.patient, "delete"); } };

  const exportCsv = () => {
    const rows = [["Paciente", "Hospital", "Cirugía", "Responsable", "Contrato", "Factura", "Valor", "Cobrado", "Pendiente", "Estado", "Vencimiento"], ...enriched.map((record) => [record.patient, record.hospital, record.surgeryDate, record.responsible.name, record.contract, record.invoice, record.amount, record.paidAmount, record.pending, STATUS[record.status].label, record.dueDate])];
    downloadCsv(rows, `control-volia-${today()}.csv`);
    recordActivity("Cirugías", "Expedientes exportados en CSV", `${enriched.length} caso(s) exportado(s)`, "export");
  };

  const exportPayload = (): BusinessExport => ({ title: "Control de cirugías, facturación y cobros", subtitle: `Reporte operativo al ${dateLabel(today())}`, metadata: [["Casos registrados", enriched.length], ["Expedientes incompletos", kpis.incomplete], ["Cobros vencidos", kpis.overdue], ["Valor cobrado", money(kpis.collected)], ["Valor pendiente", money(kpis.pending)]], tables: [{ title: "Seguimiento de expedientes", headers: ["Paciente", "Hospital", "Cirugía", "Factura", "Estado", "Valor", "Pendiente"], rows: enriched.map((record) => [record.patient, record.hospital, dateLabel(record.surgeryDate), record.invoice || "Sin factura", record.overdue ? "Cobro vencido" : STATUS[record.status].label, money(record.amount), money(record.pending)]) }], disclaimer: "Reporte institucional de VOLIA S.A.S. Confirme los registros contra los expedientes y comprobantes originales." });

  const exportPdf = () => {
    exportBusinessPdf(exportPayload(), `cirugias-cobros-${today()}`);
    recordActivity("Cirugías", "Expedientes exportados en PDF", `${enriched.length} caso(s) exportado(s)`, "export");
  };

  const exportWord = () => {
    exportBusinessWord(exportPayload(), `cirugias-cobros-${today()}`);
    recordActivity("Cirugías", "Expedientes exportados en Word", `${enriched.length} caso(s) exportado(s)`, "export");
  };

  return <section className="case-module">
    <div className="case-hero"><div><p className="eyebrow">Control operativo</p><h2>Cirugías, facturación y cobros</h2><p>Centraliza cada caso, detecta documentos pendientes y vigila el dinero por cobrar.</p></div><div className="case-actions export-actions"><button className="secondary-button" onClick={exportPdf}>PDF</button><button className="secondary-button" onClick={exportWord}>Word</button><button className="secondary-button" onClick={exportCsv}>Excel/CSV</button><button className="primary-button" onClick={() => setShowForm((value) => !value)}>{showForm ? "Cerrar registro" : "+ Registrar cirugía"}</button></div></div>

    <div className="case-kpis">
      <article><span>Por cobrar</span><strong>{money(kpis.pending)}</strong><small>Valor aún no recuperado</small></article>
      <article><span>Cobrado</span><strong>{money(kpis.collected)}</strong><small>Pagos registrados</small></article>
      <article className={kpis.incomplete ? "warn" : ""}><span>Expedientes incompletos</span><strong>{kpis.incomplete}</strong><small>Requieren documentos</small></article>
      <article className={kpis.overdue ? "danger" : ""}><span>Cobros vencidos</span><strong>{kpis.overdue}</strong><small>Necesitan seguimiento</small></article>
    </div>

    {showForm && <section className="case-form-card">
      <div className="case-section-title"><div><p className="eyebrow">Nuevo caso</p><h3>Registrar cirugía o entrega</h3></div><span>Los campos con * son obligatorios</span></div>
      <div className="case-form-grid">
        <label><span>Paciente *</span><input value={draft.patient} placeholder="Nombre completo" onChange={(event) => setDraft({ ...draft, patient: event.target.value })} /></label>
        <label><span>Fecha de cirugía *</span><input type="date" value={draft.surgeryDate} onChange={(event) => setDraft({ ...draft, surgeryDate: event.target.value })} /></label>
        <label><span>Hospital</span><input value={draft.hospital} onChange={(event) => setDraft({ ...draft, hospital: event.target.value })} /></label>
        <label><span>Contrato / proceso</span><input value={draft.contract} onChange={(event) => setDraft({ ...draft, contract: event.target.value })} /></label>
        <label><span>Factura</span><input value={draft.invoice} placeholder="Número opcional" onChange={(event) => setDraft({ ...draft, invoice: event.target.value })} /></label>
        <label><span>Valor total *</span><input type="number" min="0" step="0.01" value={draft.amount || ""} placeholder="0.00" onChange={(event) => { const amount = Math.max(0, Number(event.target.value) || 0); setDraft({ ...draft, amount, paidAmount: Math.min(draft.paidAmount, amount) }); }} /></label>
        <label><span>Valor cobrado</span><input type="number" min="0" max={draft.amount || undefined} step="0.01" value={draft.paidAmount || ""} placeholder="0.00" onChange={(event) => setDraft({ ...draft, paidAmount: Math.min(draft.amount, Math.max(0, Number(event.target.value) || 0)) })} /></label>
        <label><span>Fecha de presentación</span><input type="date" value={draft.submittedDate} onChange={(event) => setDraft({ ...draft, submittedDate: event.target.value })} /></label>
        <label><span>Fecha esperada de pago</span><input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} /></label>
      </div>
      {hospitalInsights.length > 0 && (
        <div className="memory-insight-box" style={{ margin: "10px 0" }}>
          <div className="insight-header">
            <strong>Requisitos y antecedentes institucionales ({draft.hospital}):</strong>
            <span>{hospitalInsights.length} regla(s)</span>
          </div>
          {hospitalInsights.slice(0, 2).map((ins) => (
            <p key={ins.id} className="insight-text">
              <strong>{ins.title}:</strong> {ins.content}
            </p>
          ))}
        </div>
      )}
      <div className={`responsible-rule ${draftResponsible.matched ? "matched" : "manual"}`}><span>RESPONSABLE SEGÚN FECHA</span><strong>{draftResponsible.name}</strong><small>{draftResponsible.period}</small></div>
      <div className="document-checks"><span>Documentos recibidos</span><div>{DOCUMENTS.map(([key, label]) => <label key={key}><input type="checkbox" checked={draft.documents[key]} onChange={() => setDraft({ ...draft, documents: { ...draft.documents, [key]: !draft.documents[key] } })} /><span>{label}</span></label>)}</div></div>
      <label className="case-notes"><span>Observaciones</span><textarea value={draft.notes} placeholder="Pendientes, llamadas o aclaraciones" onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
      <div className="case-form-footer"><small>La información se guarda únicamente en este dispositivo.</small><div>{draft.id && <button className="secondary-button" onClick={() => { setDraft({ ...EMPTY, surgeryDate: today(), documents: { ...EMPTY.documents } }); setShowForm(false); }}>Cancelar edición</button>}<button className="primary-button" disabled={!draft.patient.trim() || !draft.surgeryDate || draft.amount <= 0} onClick={saveCase}>{draft.id ? "Actualizar caso" : "Guardar caso"}</button></div></div>
    </section>}

    <section className="case-table-card">
      <div className="case-toolbar"><div><p className="eyebrow">Seguimiento</p><h3>Expedientes registrados</h3></div><div className="case-filters"><input aria-label="Buscar expedientes" placeholder="Buscar paciente, factura o contrato" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Filtrar por estado" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">Todos los estados</option>{Object.entries(STATUS).map(([value, status]) => <option value={value} key={value}>{status.label}</option>)}<option value="overdue">Solo vencidos</option></select></div></div>
      <div className="case-list">{visible.map((record) => {
        const completeCount = Object.values(record.documents).filter(Boolean).length;
        return <article className={`case-row ${record.overdue ? "is-overdue" : ""}`} key={record.id}>
          <div className="case-main"><div className="case-name"><span className={`status-dot ${record.overdue ? "red" : STATUS[record.status].tone}`}></span><div><strong>{record.patient}</strong><small>{record.hospital} · Cirugía {dateLabel(record.surgeryDate)}</small></div></div><span className={`status-pill ${record.overdue ? "red" : STATUS[record.status].tone}`}>{record.overdue ? "Cobro vencido" : STATUS[record.status].label}</span></div>
          <div className="case-details"><div><span>Responsable por fecha</span><strong className={record.responsible.matched ? "" : "manual-text"}>{record.responsible.name}</strong><small>{record.responsible.period}</small></div><div><span>Factura / contrato</span><strong>{record.invoice || "Sin factura"}</strong><small>{record.contract || "Sin contrato"}</small></div><div><span>Documentos</span><strong>{completeCount}/5 completos</strong><div className="mini-progress"><i style={{ width: `${completeCount * 20}%` }}></i></div></div><div className="case-money"><span>Pendiente</span><strong>{money(record.pending)}</strong><small>de {money(record.amount)}</small></div></div>
          <details className="case-expand"><summary>Gestionar expediente</summary><div className="case-management"><div><span>Actualizar estado</span><select value={record.status} onChange={(event) => setStatus(record.id, event.target.value as WorkflowStatus)}>{Object.entries(STATUS).map(([value, status]) => <option value={value} key={value}>{status.label}</option>)}</select><div className="record-actions"><button className="edit-record" onClick={() => editCase(record)}>Editar caso</button><button className="delete-record" onClick={() => deleteCase(record.id)}>Eliminar</button></div></div><div className="record-docs"><span>Checklist documental</span>{DOCUMENTS.map(([key, label]) => <label key={key}><input type="checkbox" checked={record.documents[key]} onChange={() => markDocument(record.id, key)} />{label}</label>)}</div><div><span>Fechas y notas</span><p>Presentada: {dateLabel(record.submittedDate)}<br />Pago esperado: {dateLabel(record.dueDate)}</p><small>{record.notes || "Sin observaciones."}</small></div></div></details>
        </article>;
      })}{!visible.length && <div className="case-empty"><strong>No hay expedientes con estos filtros</strong><span>Cambia la búsqueda o registra una nueva cirugía.</span></div>}</div>
    </section>
  </section>;
}
