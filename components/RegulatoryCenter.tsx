"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv } from "../lib/csv";
import { expiryStatus, daysUntil, type ExpiryStatus } from "../lib/business-alerts";
import { businessIsoDate } from "../lib/date-utils";
import { REGULATORY_SEED, type RegulatoryRecord } from "../lib/regulatory-data";
import { readStoredArray, STORAGE_KEYS, writeStoredJson } from "../lib/storage";
import { recordActivity } from "../lib/activity-log";
import { pullRegulatory, pushRegulatory } from "../lib/regulatory-sync";
import { mergeRegulatory } from "../lib/regulatory-api";

const LABEL: Record<ExpiryStatus | "sin-fecha", string> = { vencido: "Vencido", critico: "Menos de 30 días", proximo: "Menos de 90 días", vigente: "Vigente", "sin-fecha": "Sin fecha" };
const DOT: Record<ExpiryStatus | "sin-fecha", string> = { vencido: "red", critico: "red", proximo: "yellow", vigente: "green", "sin-fecha": "yellow" };

export default function RegulatoryCenter() {
  const [records, setRecords] = useState<RegulatoryRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [server, setServer] = useState<{ mode: "local" | "server"; message: string; pending: string[] }>({ mode: "local", message: "Conectando con el servidor…", pending: [] });
  const today = businessIsoDate();

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const stored = readStoredArray<RegulatoryRecord>(STORAGE_KEYS.regulatoryDocs);
      const local = stored.length ? stored : REGULATORY_SEED;
      setRecords(local);
      setReady(true);
      const remote = await pullRegulatory();
      if (cancelled) return;
      if (!remote.ok) { setServer({ mode: "local", message: `Solo en este equipo: ${remote.reason}`, pending: [] }); return; }
      const { merged, toPush } = mergeRegulatory(local, remote.data);
      setRecords(merged);
      if (!toPush.length) { setServer({ mode: "server", message: "Sincronizado con la base de datos.", pending: [] }); return; }
      const pushed = await pushRegulatory(toPush); // lo que este equipo tiene más nuevo o el servidor no tiene
      if (cancelled) return;
      setServer(pushed.ok
        ? { mode: "server", message: remote.data.length ? `Sincronizado; se subieron ${pushed.data} cambio(s) de este equipo.` : `Base de datos inicializada con ${pushed.data} documentos.`, pending: [] }
        : { mode: "server", message: `No se pudieron subir los cambios de este equipo: ${pushed.reason}`, pending: toPush.map((r) => r.id) });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
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
  const sendToServer = async (changed: RegulatoryRecord[]) => {
    if (server.mode !== "server") return;
    const result = await pushRegulatory(changed);
    setServer((cur) => result.ok
      ? { mode: "server", message: "Sincronizado con la base de datos.", pending: cur.pending.filter((id) => !changed.some((c) => c.id === id)) }
      : { ...cur, message: `No se pudo guardar en el servidor: ${result.reason}`, pending: [...new Set([...cur.pending, ...changed.map((c) => c.id)])] });
  };
  const setDate = (id: string, expiresAt: string) => {
    const rec = records.find((x) => x.id === id);
    if (!rec) return;
    const updated = { ...rec, expiresAt: expiresAt || null, updatedAt: new Date().toISOString() };
    setRecords((current) => current.map((x) => x.id === id ? updated : x));
    recordActivity("Documentos regulatorios", "Vigencia actualizada", `${rec.reference} · ${expiresAt || "sin fecha"}`, "update");
    void sendToServer([updated]);
  };
  const retry = () => void sendToServer(records.filter((r) => server.pending.includes(r.id)));
  const exportCsv = () => {
    downloadCsv([["Tipo", "Referencia", "Descripción", "Ítems", "Vence", "Días", "Estado", "Nota"], ...rows.map((r) => [r.kind, r.reference, r.subject, r.items, r.expiresAt ?? "", r.days ?? "", LABEL[r.status], r.note])], `vencimientos-regulatorios-${today}.csv`);
    recordActivity("Documentos regulatorios", "Vencimientos exportados en CSV", `${rows.length} documentos`, "export");
  };

  return <section className="business-module">
    <div className="module-hero"><div><p className="eyebrow">Cumplimiento</p><h2>Registros sanitarios y vigencias</h2><p>Controla qué documentos respaldan cada ítem y cuándo vencen, para no presentar una oferta con papeles caducados.</p></div><div className="hero-actions export-actions"><button className="secondary-button" onClick={exportCsv}>Excel/CSV</button></div></div>
    <p className={`module-sync-status ${server.mode === "server" && !server.pending.length ? "ok" : "warn"}`} role="status">{server.message}{server.pending.length > 0 && <> · {server.pending.length} cambio(s) pendiente(s) <button className="secondary-button" onClick={retry}>Reintentar</button></>}</p>
    <div className="business-kpis">
      <article className={count("vencido") ? "danger" : ""}><span>Vencidos</span><strong>{count("vencido")}</strong><small>No usar en ofertas</small></article>
      <article className={count("critico") ? "danger" : ""}><span>Menos de 30 días</span><strong>{count("critico")}</strong><small>Renovar ya</small></article>
      <article className={count("proximo") ? "warn" : ""}><span>Menos de 90 días</span><strong>{count("proximo")}</strong><small>Iniciar trámite</small></article>
      <article className={count("sin-fecha") ? "warn" : ""}><span>Sin fecha</span><strong>{count("sin-fecha")}</strong><small>Revisar el PDF</small></article>
    </div>
    <section className="business-card"><div className="section-heading"><div><p className="eyebrow">Documentos</p><h3>Del más urgente al menos urgente</h3></div><input className="module-search" placeholder="Buscar referencia, producto o ítem" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <div className="inventory-list">{visible.map((row) => <article className="inventory-row" key={row.id}>
        <div className="inventory-name"><span className={`status-dot ${DOT[row.status]}`}></span><div><strong>{row.reference}</strong><small>{row.kind} · {row.subject} · Ítems {row.items}</small>{row.note && <small>{row.note}</small>}</div></div>
        <div className="inventory-metrics"><div><span>Estado</span><strong>{LABEL[row.status]}</strong><small>{row.days === null ? "Sin fecha" : row.days < 0 ? `Venció hace ${-row.days} días` : `${row.days} días`}</small></div>
          <div><span>Vence</span><input type="date" value={row.expiresAt ?? ""} onChange={(e) => setDate(row.id, e.target.value)} aria-label={`Fecha de vencimiento de ${row.reference}`} /></div></div>
      </article>)}{!visible.length && <div className="module-empty">No hay documentos que coincidan.</div>}</div>
    </section>
  </section>;
}
