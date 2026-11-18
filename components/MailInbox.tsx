"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MAIL_CATEGORIES, type MailCategory } from "../lib/mail-triage";
import type { MailRecord, MailStatus, SyncMeta } from "../lib/mail-sync";
import { followLink } from "../lib/tenders";
import { setQuoteHandoff } from "../lib/mail-handoff";

type Payload = { records: MailRecord[]; meta: Record<string, SyncMeta>; mailboxes: string[]; summary: { pending: number; nextDeadline: string; urgent: number } };

const money = (v: number) => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(v);
const day = (iso: string) => (iso ? new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Guayaquil" }).format(new Date(iso.length === 10 ? `${iso}T12:00:00-05:00` : iso)) : "");
const time = (iso: string) => new Intl.DateTimeFormat("es-EC", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Guayaquil" }).format(new Date(iso));
const todayEc = () => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);

export default function MailInbox({ onOpenQuote }: { onOpenQuote?: () => void }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [category, setCategory] = useState<MailCategory | "all">("all");
  const [view, setView] = useState<"nuevo" | "todos" | "descartado">("nuevo");
  const [box, setBox] = useState("all");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/mail", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 401 ? "Inicie sesión para ver el correo." : `No se pudo cargar (HTTP ${res.status}).`);
      setData((await res.json()) as Payload);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cargar el correo."); }
  }, []);
  useEffect(() => { const t = window.setTimeout(load, 0); return () => window.clearTimeout(t); }, [load]);

  const sync = async () => {
    setBusy(true); setNotice("");
    try {
      const res = await fetch("/api/mail", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      setNotice(body.message || body.error || (res.ok ? "Listo." : `Error HTTP ${res.status}.`));
      await load();
    } catch { setNotice("No se pudo conectar con el servidor."); }
    setBusy(false);
  };

  const setStatus = async (r: MailRecord, status: MailStatus) => {
    setData((d) => d && { ...d, records: d.records.map((x) => (x.id === r.id ? { ...x, status } : x)) });
    const res = await fetch("/api/mail", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, status }) });
    if (!res.ok) { setNotice(((await res.json().catch(() => ({}))) as { error?: string }).error || "No se pudo cambiar el estado."); await load(); }
  };

  const records = useMemo(() => data?.records ?? [], [data]);
  const visible = useMemo(() => records.filter((r) => (view === "todos" ? r.status !== "descartado" : r.status === view) && (category === "all" || r.category === category) && (box === "all" || r.source === box)), [records, view, category, box]);
  const counts = useMemo(() => {
    const c: Partial<Record<MailCategory, number>> = {};
    for (const r of records) if (r.status === "nuevo" && (box === "all" || r.source === box)) c[r.category] = (c[r.category] ?? 0) + 1;
    return c;
  }, [records, box]);
  const today = todayEc();

  return <section className="case-module">
    <div className="case-hero"><div><p className="eyebrow">Correo</p><h2>Bandeja inteligente</h2><p>Lee solo los correos que cada persona etiquetó con «Volia» en su propio Gmail, los separa por tema y saca los datos útiles: códigos de proceso, fechas límite, montos y facturas. No envía, no borra y no guarda contraseñas ni números de tarjeta.</p></div></div>
    {error && <p className="memory-confirmation" role="alert">{error}</p>}
    {notice && <p className="memory-confirmation" role="status">{notice}</p>}

    {data && data.mailboxes.length === 0 && <section className="case-form-card">
      <div className="case-section-title"><div><p className="eyebrow">Primer paso</p><h3>Todavía no hay buzones conectados</h3></div></div>
      <p>Cada persona conecta su propio Gmail con un script que ella misma instala y autoriza; nadie comparte su contraseña. Los pasos están en <strong>docs/correo.md</strong> (unos 10 minutos por buzón) y terminan con <strong>configurar-correo.cmd</strong>.</p>
    </section>}

    {data && data.mailboxes.length > 0 && <>
      <div className="case-kpis">
        <article><span>Por revisar</span><strong>{data.summary.pending}</strong><small>Correos nuevos sin atender</small></article>
        <article><span>Próximo plazo</span><strong>{data.summary.nextDeadline ? day(data.summary.nextDeadline) : "—"}</strong><small>{data.summary.urgent ? `${data.summary.urgent} vencen en 3 días o menos` : "Ninguno urgente"}</small></article>
        <article><span>Buzones</span><strong>{data.mailboxes.length}</strong><small>{data.mailboxes.join(", ")}</small></article>
      </div>

      <section className="case-table-card">
        <div className="case-toolbar"><div><p className="eyebrow">Estado de los buzones</p><h3>Última lectura</h3></div><button className="primary-button" disabled={busy} onClick={sync}>{busy ? "Leyendo…" : "Revisar correo ahora"}</button></div>
        <div className="case-list">{data.mailboxes.map((name) => { const m = data.meta[name]; return <article className="case-row" key={name}><div className="case-main"><div className="case-name"><div><strong>{name}</strong><small className={m && !m.ok ? "text-danger" : undefined}>{m ? `${time(m.at)} · ${m.message}` : "Aún no se ha leído. Se lee solo cada día hábil a las 08:00."}</small></div></div></div></article>; })}</div>
      </section>

      <section className="case-table-card">
        <div className="case-toolbar"><div><p className="eyebrow">Correos</p><h3>Por tema</h3></div>
          <div>
            <select aria-label="Estado" value={view} onChange={(e) => setView(e.target.value as typeof view)}><option value="nuevo">Nuevos</option><option value="todos">Nuevos y revisados</option><option value="descartado">Descartados</option></select>{" "}
            {data.mailboxes.length > 1 && <select aria-label="Buzón" value={box} onChange={(e) => setBox(e.target.value)}><option value="all">Todos los buzones</option>{data.mailboxes.map((n) => <option key={n} value={n}>{n}</option>)}</select>}
          </div>
        </div>
        <div role="tablist" aria-label="Temas" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <button className={category === "all" ? "primary-button" : "secondary-button"} onClick={() => setCategory("all")}>Todos</button>
          {(Object.keys(MAIL_CATEGORIES) as MailCategory[]).map((c) => <button key={c} title={MAIL_CATEGORIES[c].hint} className={category === c ? "primary-button" : "secondary-button"} onClick={() => setCategory(c)}>{MAIL_CATEGORIES[c].label}{counts[c] ? ` (${counts[c]})` : ""}</button>)}
        </div>

        {visible.length === 0 && <p>{records.length === 0 ? "Aún no hay correos. Etiquete un correo con «Volia» en Gmail y use «Revisar correo ahora»." : "No hay correos con estos filtros."}</p>}
        <div className="case-list">{visible.map((r) => {
          const f = r.fields;
          const late = f.deadline && f.deadline < today;
          return <article className="case-row" key={r.id}>
            <div className="case-main"><div className="case-name"><div>
              <strong>{r.subject || "(sin asunto)"}</strong>
              <small>{MAIL_CATEGORIES[r.category].label}{r.confidence ? ` · ${Math.round(r.confidence * 100)} % seguro` : ""} · {r.from.name || r.from.email}{r.from.domain ? ` (${r.from.domain})` : ""} · {day(r.receivedAt)}{data.mailboxes.length > 1 ? ` · ${r.source}` : ""}</small>
            </div></div></div>
            <div className="case-details">
              {(f.processCodes.length > 0 || f.deadline || f.amounts.length > 0 || f.invoices.length > 0 || f.rucs.length > 0) && <p>
                {f.deadline && <span className={late ? "text-danger" : undefined}><strong>Plazo:</strong> {day(f.deadline)}{late ? " (vencido)" : ""}. </span>}
                {f.processCodes.length > 0 && <span><strong>Proceso:</strong> {f.processCodes.join(", ")}. </span>}
                {f.amounts.length > 0 && <span><strong>Montos:</strong> {f.amounts.slice(0, 4).map(money).join(", ")}. </span>}
                {f.invoices.length > 0 && <span><strong>Factura:</strong> {f.invoices.join(", ")}. </span>}
                {f.rucs.length > 0 && <span><strong>RUC:</strong> {f.rucs.join(", ")}. </span>}
              </p>}
              {r.attachments.length > 0 && <small>Adjuntos: {r.attachments.join(", ")}</small>}
              {r.items && r.items.length > 0 && <details className="case-expand"><summary>{r.items.length} renglón(es) pedidos</summary><ul>{r.items.map((i) => <li key={i.text}>{i.quantity} × {i.text}</li>)}</ul></details>}
              {r.excerpt && <details className="case-expand"><summary>Ver extracto</summary><p>{r.excerpt}</p>{r.reasons.length > 0 && <small>Por qué este tema: {r.reasons.join("; ")}.</small>}</details>}
              <div>
                {r.link && <a className="secondary-button" href={r.link} target="_blank" rel="noopener noreferrer">Abrir en Gmail</a>}{" "}
                {r.items && r.items.length > 0 && onOpenQuote && <button className="primary-button" onClick={() => { setQuoteHandoff(r.from.name || r.from.email, r.subject, r.items ?? []); onOpenQuote(); }}>Armar cotización</button>}{" "}
                {f.processCodes[0] && <a className="secondary-button" href={followLink(typeof window === "undefined" ? "" : window.location.origin, { ref: f.processCodes[0], title: r.subject, buyer: r.from.name })}>Seguir proceso</a>}{" "}
                {r.status === "nuevo" && <button className="secondary-button" onClick={() => setStatus(r, "revisado")}>Marcar revisado</button>}{" "}
                {r.status !== "descartado" ? <button className="secondary-button" onClick={() => setStatus(r, "descartado")}>Descartar</button> : <button className="secondary-button" onClick={() => setStatus(r, "nuevo")}>Restaurar</button>}
              </div>
            </div>
          </article>;
        })}</div>
      </section>
    </>}
  </section>;
}
