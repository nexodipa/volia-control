"use client";

import { useEffect, useMemo, useState } from "react";
import {
  activityDateLabel,
  clearActivityLog,
  type ActivityEntry,
  type ActivityType,
} from "../lib/activity-log";
import { downloadCsv } from "../lib/csv";
import { readStoredArray, STORAGE_KEYS } from "../lib/storage";

const MODULES = [
  "Todos",
  "Auditor",
  "Cotizador",
  "Cirugías",
  "Finanzas",
  "Inventario",
  "Catálogo",
  "Estadísticas",
  "Documentos",
  "Respaldos",
  "Seguridad",
] as const;

const ACTION_TYPES: Array<{ id: string; label: string }> = [
  { id: "all", label: "Todas las acciones" },
  { id: "create", label: "Creaciones y registros" },
  { id: "update", label: "Ediciones y cambios" },
  { id: "export", label: "Exportaciones y descargas" },
  { id: "audit", label: "Auditorías OCR" },
  { id: "delete", label: "Eliminaciones" },
  { id: "system", label: "Respaldos y sistema" },
];

const DATE_RANGES = [
  { id: "all", label: "Todo el historial" },
  { id: "today", label: "Hoy" },
  { id: "7days", label: "Últimos 7 días" },
  { id: "30days", label: "Últimos 30 días" },
];

export default function ActivityCenter() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [query, setQuery] = useState("");
  const [selectedModule, setSelectedModule] = useState<string>("Todos");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedDate, setSelectedDate] = useState<string>("all");

  useEffect(() => {
    const load = () =>
      setEntries(readStoredArray<ActivityEntry>(STORAGE_KEYS.activityLog));
    load();
    window.addEventListener("volia-activity-updated", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("volia-activity-updated", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const visible = useMemo(() => {
    const now = new Date().getTime();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return entries.filter((entry) => {
      // Filtro por módulo
      if (selectedModule !== "Todos" && entry.module !== selectedModule) {
        return false;
      }

      // Filtro por tipo de acción
      if (selectedType !== "all" && entry.type !== selectedType) {
        return false;
      }

      // Filtro por fecha
      const entryTime = new Date(entry.timestamp).getTime();
      if (selectedDate === "today" && entryTime < todayStart.getTime()) {
        return false;
      }
      if (
        selectedDate === "7days" &&
        now - entryTime > 7 * 24 * 60 * 60 * 1000
      ) {
        return false;
      }
      if (
        selectedDate === "30days" &&
        now - entryTime > 30 * 24 * 60 * 60 * 1000
      ) {
        return false;
      }

      // Filtro por texto de búsqueda
      if (query.trim()) {
        const searchText =
          `${entry.module} ${entry.action} ${entry.detail}`.toLowerCase();
        return searchText.includes(query.toLowerCase().trim());
      }

      return true;
    });
  }, [entries, query, selectedModule, selectedType, selectedDate]);

  const stats = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = entries.filter(
      (e) => new Date(e.timestamp).getTime() >= todayStart.getTime(),
    ).length;
    const exportCount = entries.filter((e) => e.type === "export").length;
    const auditCount = entries.filter((e) => e.type === "audit").length;

    return {
      total: entries.length,
      today: todayCount,
      exports: exportCount,
      audits: auditCount,
    };
  }, [entries]);

  const exportCsv = () =>
    downloadCsv(
      [
        ["Fecha y hora", "Módulo", "Tipo", "Acción", "Detalle"],
        ...entries.map((entry) => [
          activityDateLabel(entry.timestamp),
          entry.module,
          entry.type || "general",
          entry.action,
          entry.detail,
        ]),
      ],
      "historial-actividad-volia.csv",
    );

  const handleClear = () => {
    if (
      window.confirm(
        "¿Está seguro de que desea limpiar el historial de actividad de este dispositivo? Esta acción no se puede deshacer.",
      )
    ) {
      clearActivityLog();
    }
  };

  const getBadgeClass = (type?: ActivityType) => {
    switch (type) {
      case "create":
        return "badge-create";
      case "update":
        return "badge-update";
      case "delete":
        return "badge-delete";
      case "export":
        return "badge-export";
      case "audit":
        return "badge-audit";
      case "system":
        return "badge-system";
      default:
        return "badge-default";
    }
  };

  return (
    <section className="business-module activity-center">
      <div className="module-hero">
        <div>
          <p className="eyebrow">Control interno y trazabilidad</p>
          <h2>Historial de actividad en tiempo real</h2>
          <p>
            Registro cronológico y sincronizado de cada operación, cotización,
            documento, auditoría y movimiento realizado en esta computadora.
          </p>
        </div>
        <div className="hero-actions">
          <button className="secondary-button" onClick={exportCsv}>
            Exportar Excel/CSV
          </button>
          {entries.length > 0 && (
            <button className="text-danger-button" onClick={handleClear}>
              Limpiar historial
            </button>
          )}
        </div>
      </div>

      <div className="business-kpis">
        <article>
          <span>TOTAL ACTIVIDADES</span>
          <strong>{stats.total}</strong>
          <small>Eventos registrados</small>
        </article>
        <article>
          <span>HOY</span>
          <strong>{stats.today}</strong>
          <small>Operaciones hoy</small>
        </article>
        <article>
          <span>EXPORTACIONES</span>
          <strong>{stats.exports}</strong>
          <small>PDF / Word / CSV</small>
        </article>
        <article>
          <span>AUDITORÍAS</span>
          <strong>{stats.audits}</strong>
          <small>Procesos OCR</small>
        </article>
      </div>

      <section className="business-card">
        <div className="activity-filters-grid">
          <div className="filter-group">
            <label>
              <span>Módulo</span>
              <select
                value={selectedModule}
                onChange={(e) => setSelectedModule(e.target.value)}
              >
                {MODULES.map((mod) => (
                  <option key={mod} value={mod}>
                    {mod}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="filter-group">
            <label>
              <span>Tipo de acción</span>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
              >
                {ACTION_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="filter-group">
            <label>
              <span>Rango de fecha</span>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              >
                {DATE_RANGES.map((range) => (
                  <option key={range.id} value={range.id}>
                    {range.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="filter-group filter-search">
            <label>
              <span>Búsqueda</span>
              <input
                className="module-search"
                placeholder="Buscar módulo, acción o detalle…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="section-heading" style={{ marginTop: "16px" }}>
          <div>
            <p className="eyebrow">Registros sincronizados</p>
            <h3>
              {visible.length} de {entries.length} actividad(es)
            </h3>
          </div>
        </div>

        <div className="activity-list">
          {visible.map((entry) => (
            <article key={entry.id} className="activity-item">
              <time>{activityDateLabel(entry.timestamp)}</time>
              <div className="activity-tags">
                <span className="activity-module-tag">{entry.module}</span>
                {entry.type && (
                  <span className={`activity-badge ${getBadgeClass(entry.type)}`}>
                    {entry.type.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="activity-content">
                <strong>{entry.action}</strong>
                <small>{entry.detail}</small>
              </div>
            </article>
          ))}
          {!visible.length && (
            <div className="module-empty">
              No hay actividades que coincidan con los filtros seleccionados.
            </div>
          )}
        </div>
      </section>

      <div className="help-warning">
        <strong>Trazabilidad y Sincronización Local</strong>
        <span>
          Cada acción generada en el sistema (guardados, exportaciones PDF/Word/CSV,
          auditorías OCR, respaldos y movimientos de stock) se almacena y sincroniza
          automáticamente en la memoria de este dispositivo.
        </span>
      </div>
    </section>
  );
}
