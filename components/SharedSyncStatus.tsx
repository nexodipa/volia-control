"use client";

import { useEffect, useRef, useState } from "react";
import { STORAGE_WRITE_EVENT } from "../lib/storage";
import { SYNCED_KEYS, syncAll } from "../lib/shared-sync";

const INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 2_000;

/** Sincroniza inventario, movimientos, finanzas, cotizaciones y equivalencias con la base compartida y muestra el estado. */
export default function SharedSyncStatus({ onRemoteChange, readOnly = false }: { onRemoteChange: () => void; readOnly?: boolean }) {
  const [state, setState] = useState<{ ok: boolean | null; text: string }>({ ok: null, text: "Datos compartidos: conectando…" });
  const debounce = useRef<number | null>(null);
  const onChange = useRef(onRemoteChange);
  useEffect(() => { onChange.current = onRemoteChange; }, [onRemoteChange]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const r = await syncAll({ readOnly });
      if (!alive) return;
      if (r.ok) {
        const time = new Date().toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
        setState({ ok: true, text: readOnly ? `Solo consulta · al día ${time}` : `Datos compartidos al día · ${time}` });
        if (r.changedLocally) { onChange.current(); window.dispatchEvent(new Event("volia-memory-updated")); }
      } else {
        setState({ ok: false, text: `Solo en este equipo: ${r.reason}` });
      }
    };
    const first = window.setTimeout(run, 800);
    const timer = window.setInterval(run, INTERVAL_MS);
    const onFocus = () => void run();
    const onWrite = (e: Event) => {
      const key = (e as CustomEvent<{ key?: string }>).detail?.key;
      if (!key || !SYNCED_KEYS.has(key)) return;
      if (debounce.current) window.clearTimeout(debounce.current);
      debounce.current = window.setTimeout(run, DEBOUNCE_MS);
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener(STORAGE_WRITE_EVENT, onWrite);
    return () => {
      alive = false;
      window.clearTimeout(first);
      window.clearInterval(timer);
      if (debounce.current) window.clearTimeout(debounce.current);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(STORAGE_WRITE_EVENT, onWrite);
    };
  }, [readOnly]);

  return <span className={`shared-sync-pill ${state.ok === false ? "warn" : state.ok ? "ok" : ""}`} role="status" title="Inventario, movimientos, finanzas, cotizaciones (sin datos del paciente) y equivalencias se comparten entre los equipos autorizados.">{state.text}</span>;
}
