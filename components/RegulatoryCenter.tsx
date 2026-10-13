"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv } from "../lib/csv";
import { expiryStatus, daysUntil, type ExpiryStatus } from "../lib/business-alerts";
import { businessIsoDate } from "../lib/date-utils";
import { REGULATORY_SEED, type RegulatoryRecord } from "../lib/regulatory-data";
import { readStoredArray, STORAGE_KEYS, writeStoredJson } from "../lib/storage";
import { recordActivity } from "../lib/activity-log";

const LABEL: Record<ExpiryStatus | "sin-fecha", string> = { vencido: "Vencido", critico: "Menos de 30 días", proximo: "Menos de 90 días", vigente: "Vigente", "sin-fecha": "Sin fecha" };
const DOT: Record<ExpiryStatus | "sin-fecha", string> = { vencido: "red", critico: "red", proximo: "yellow", vigente: "green", "sin-fecha": "yellow" };

export default function RegulatoryCenter() {
  const [records, setRecords] = useState<RegulatoryRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const today = businessIsoDate();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readStoredArray<RegulatoryRecord>(STORAGE_KEYS.regulatoryDocs);
      setRecords(stored.length ? stored : REGULATORY_SEED);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (ready) writeStoredJson(STORAGE_KEYS.regulatoryDocs, records); }, [records, ready]);

  const rows = useMemo(() => records
    .map((rec) => {
      const status: ExpiryStatus | "sin-fecha" = rec.expiresAt ? expiryStatus(rec.expiresAt, today) : "sin-fecha";
      return { ...rec, status, days: rec.expiresAt ? daysUntil(rec.expiresAt, today) : null };
    })
    .sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999)), [records, today]);

  const visible = rows.filter((row) => [row.reference, row.subject, row.items, row.kind].some((v) => v.toLowerCase().includes(query.toLowerCase())));
  const count = (s: string) => rows.filter((row) => row.status === s).length;
  const setDate = (id: string, expiresAt: string) => {
    setRecords((current) => current.map((rec) => rec.id === id ? { ...rec, expiresAt: expiresAt || null } : rec));
    const rec = records.find((x) => x.id === id);
    if (rec) recordActivity("Documentos regulatorios", "Vigencia actualizada", `${rec.reference} · ${expiresAt || "sin fecha"}`, "update");
  };
  const exportCsv = () => {
    downloadCsv([["Tipo", "Referencia", "Descripción", "Ítems", "Vence", "Días", "Estado", "Nota"], ...rows.map((r) => [r.kind, r.reference, r.subject, r.items, r.expiresAt ?? "", r.days ?? "", LABEL[r.status], r.note])], `vencimientos-regulatorios-${today}.csv`);
    recordActivity("Documentos regulatorios", "Vencimientos exportados en CSV", `${rows.length} documentos`, "export");
  };

  return <section className="business-module">
    <div className="module-hero"><div><p className="eyebrow">CUMPLIMIENTO</p><h2>Registros sanitarios y vigencias</h2><p>Controla qué documentos respaldan cada ítem y cuándo vencen, para no presentar una oferta con papeles caducados.</p></div><div className="hero-actions export-actions"><button className="secondary-button" onClick={exportCsv}>Excel/CSV</button></div></div>
    <div className="business-kpis">
      <article className={count("vencido") ? "danger" : ""}><span>VENCIDOS</span><strong>{count("vencido")}</strong><small>No usar en ofertas</small></article>
      <article className={count("critico") ? "danger" : ""}><span>MENOS DE 30 DÍAS</span><strong>{count("critico")}</strong><small>Renovar ya</small></article>
      <article className={count("proximo") ? "warn" : ""}><span>MENOS DE 90 DÍAS</span><strong>{count("proximo")}</strong><small>Iniciar trámite</small></article>
      <article className={count("sin-fecha") ? "warn" : ""}><span>SIN FECHA</span><strong>{count("sin-fecha")}</strong><small>Revisar el PDF</small></article>
    </div>
    <section className="business-card"><div className="section-heading"><div><p className="eyebrow">DOCUMENTOS</p><h3>Del más urgente al menos urgente</h3></div><input className="module-search" placeholder="Buscar referencia, producto o ítem" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <div className="inventory-list">{visible.map((row) => <article className="inventory-row" key={row.id}>
        <div className="inventory-name"><span className={`status-dot ${DOT[row.status]}`}></span><div><strong>{row.reference}</strong><small>{row.kind} · {row.subject} · Ítems {row.items}</small>{row.note && <small>{row.note}</small>}</div></div>
        <div className="inventory-metrics"><div><span>ESTADO</span><strong>{LABEL[row.status]}</strong><small>{row.days === null ? "Sin fecha" : row.days < 0 ? `Venció hace ${-row.days} días` : `${row.days} días`}</small></div>
          <div><span>VENCE</span><input type="date" value={row.expiresAt ?? ""} onChange={(e) => setDate(row.id, e.target.value)} aria-label={`Fecha de vencimiento de ${row.reference}`} /></div></div>
      </article>)}{!visible.length && <div className="module-empty">No hay documentos que coincidan.</div>}</div>
    </section>
  </section>;
}
