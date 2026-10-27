"use client";

import { useEffect, useState } from "react";

// Estado de las alertas por correo (Gmail) y envío de un resumen de prueba.
export default function AlertsCard() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/alerts", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive) setConfigured(d ? !!d.configured : null); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const send = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/alerts", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setMessage(body.message || (res.ok ? "Correo enviado." : "No se pudo enviar."));
    } catch {
      setMessage("No se pudo conectar. Revise la conexión e intente de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const checkSercop = async () => {
    setBusy(true);
    setMessage("Revisando el SERCOP… tarda cerca de un minuto, no cierre esta página.");
    const started = Date.now();
    try {
      const res = await fetch("/api/sercop-alerts", { method: "POST" });
      if (!res.ok && res.status !== 202) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setMessage(body.message || "No se pudo iniciar la revisión.");
        return;
      }
      for (let i = 0; i < 30; i += 1) {
        await new Promise((r) => setTimeout(r, 6000));
        const last = ((await (await fetch("/api/sercop-alerts", { cache: "no-store" })).json().catch(() => ({}))) as { last?: { at: string; message: string } | null }).last;
        if (last && new Date(last.at).getTime() >= started - 2000) { setMessage(last.message); return; }
      }
      setMessage("La revisión sigue en curso. Vuelva a mirar en unos minutos.");
    } catch {
      setMessage("No se pudo conectar. Revise la conexión e intente de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  if (configured === null) return null;
  return (
    <section aria-labelledby="home-alerts-title">
      <h3 id="home-alerts-title">Alertas por correo</h3>
      <p className="task-clear">
        {configured
          ? "Cada día hábil a las 08:00 se envía a Gmail lo que cambió: cobros vencidos, pagos por vencer y registros sanitarios. Los lunes llega el informe completo."
          : "Aún no están activadas. Siga la guía de docs/alertas-gmail.md y ejecute configurar-alertas.cmd."}
      </p>
      {configured && <p className="task-clear">También cada día revisa el SERCOP y te escribe solo si salió un proceso médico nuevo.</p>}
      {configured && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button type="button" className="secondary-button" onClick={send} disabled={busy}>{busy ? "Trabajando…" : "Enviar un resumen de prueba"}</button><button type="button" className="secondary-button" onClick={checkSercop} disabled={busy}>Revisar el SERCOP ahora</button></div>}
      {message && <p className="memory-confirmation" role="status">{message}</p>}
    </section>
  );
}
