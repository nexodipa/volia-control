"use client";
/* eslint-disable @next/next/no-img-element */

import { Fragment, useMemo, useRef, useState } from "react";
import { auditFilesLocally, type AuditResult } from "../lib/local-audit";
import QuoteBuilder from "../components/QuoteBuilder";
import CaseTracker from "../components/CaseTracker";
import InventoryTracker from "../components/InventoryTracker";
import MarketCenter from "../components/MarketCenter";
import RegulatoryCenter from "../components/RegulatoryCenter";
import MovementAnalytics from "../components/MovementAnalytics";
import FinanceCenter from "../components/FinanceCenter";
import DocumentGenerator from "../components/DocumentGenerator";
import OfferPackage from "../components/OfferPackage";
import InstallManager from "../components/InstallManager";
import CloudSyncModal from "../components/CloudSyncModal";
import SharedSyncStatus from "../components/SharedSyncStatus";
import HomeDashboard from "../components/HomeDashboard";
import ProductCatalog from "../components/ProductCatalog";
import HelpCenter from "../components/HelpCenter";
import ActivityCenter from "../components/ActivityCenter";
import KnowledgeCenter from "../components/KnowledgeCenter";
import AccessibilityToolbar from "../components/AccessibilityToolbar";
import {
  exportBusinessPdf,
  exportBusinessWord,
  type BusinessExport,
} from "../lib/business-exports";
import { VOLIA_LOGO_DATA_URL } from "../lib/volia-logo";
import { downloadCsv } from "../lib/csv";
import { recordActivity } from "../lib/activity-log";

type AuditState = "ready" | "processing" | "complete";
type Module =
  | "home"
  | "audit"
  | "quote"
  | "catalog"
  | "cases"
  | "finance"
  | "inventory"
  | "regulatory"
  | "analytics"
  | "market"
  | "documents"
  | "activity"
  | "knowledge"
  | "help";

const MODULE_INFO: Record<Module, { eyebrow: string; title: string }> = {
  home: { eyebrow: "RESUMEN EJECUTIVO", title: "Inicio y tareas prioritarias" },
  audit: { eyebrow: "CONTROL DOCUMENTAL", title: "Auditor de cirugías y facturas" },
  quote: { eyebrow: "GESTIÓN COMERCIAL", title: "Cotizador y rentabilidad" },
  catalog: { eyebrow: "DATOS MAESTROS", title: "Catálogo de productos y precios" },
  cases: { eyebrow: "CONTROL OPERATIVO", title: "Cirugías, facturación y cobros" },
  finance: { eyebrow: "DIRECCIÓN FINANCIERA", title: "Centro financiero y tesorería" },
  inventory: { eyebrow: "TRAZABILIDAD", title: "Inventario, lotes y caducidades" },
  regulatory: { eyebrow: "CUMPLIMIENTO", title: "Registros sanitarios y vigencias" },
  analytics: { eyebrow: "ANÁLISIS OPERATIVO", title: "Movimientos y estadísticas" },
  market: { eyebrow: "INTELIGENCIA DE MERCADO", title: "Mercado público SERCOP" },
  documents: { eyebrow: "GESTIÓN ADMINISTRATIVA", title: "Generador de documentos" },
  activity: { eyebrow: "CONTROL INTERNO", title: "Historial de actividad" },
  knowledge: { eyebrow: "INTELIGENCIA Y MEMORIA", title: "Memoria y Base de Conocimiento" },
  help: { eyebrow: "ASISTENCIA", title: "Guía de uso de Volia Control" },
};

const authorityPeriods = [
  "Configure los periodos internos antes de validar destinatarios",
];

const demoResult: AuditResult = {
  extracted: {
    document_type: "Carta de implantes utilizados",
    patient_name: null,
    patient_id: null,
    hcl: null,
    contract: null,
    hospital: null,
    letter_date: "17/07/2026",
    surgery_date: "16/07/2026",
    addressed_to: "Autoridad de demostración",
    signer: "Representante VOLIA S.A.S.",
    detected_signatures: true,
    missing_documents: [],
    notes: [],
    confidence: 0.96,
    observed_subtotal: 874.67,
    observed_iva: 131.2,
    observed_total: 1005.87,
    items: [
      {
        code: "3433461002033",
        description: "PLACA LCP ANATÓMICA",
        quantity: 1,
        unit_value: 441.17,
        line_total: 441.17,
      },
      {
        code: "3433461002039",
        description: "TORNILLO DE CORTICAL",
        quantity: 7,
        unit_value: 54.5,
        line_total: 381.5,
      },
      {
        code: "3433461002040",
        description: "BROCA DESECHABLE",
        quantity: 1,
        unit_value: 52,
        line_total: 52,
      },
    ],
  },
  calculations: { subtotal: 874.67, iva: 131.2, total: 1005.87 },
  score: 87,
  status: "warning",
  itemErrors: {},
  authority: {
    name: "Revisión manual requerida",
    role: "Configure la autoridad responsable según la fecha",
    period: "Sin periodos institucionales precargados",
    matched: false,
  },
  findings: [
    {
      severity: "ok",
      title: "Productos y códigos legibles",
      detail: "Se identificaron 3 líneas completas.",
    },
    {
      severity: "ok",
      title: "Cálculos correctos",
      detail: "Subtotal $874,67, IVA $131,20 y total $1.005,87 coinciden.",
    },
    {
      severity: "warning",
      title: "Destinatario por confirmar",
      detail:
        "La cirugía corresponde a un periodo configurado, pero el destinatario de demostración no coincide.",
    },
    {
      severity: "ok",
      title: "Secuencia de fechas válida",
      detail: "El documento fue emitido 1 día después de la cirugía.",
    },
    {
      severity: "ok",
      title: "Firma detectada",
      detail:
        "Se observa al menos una firma. Su autenticidad no ha sido validada.",
    },
  ],
};

const formatMoney = (value: number | null) =>
  value === null
    ? "No legible"
    : new Intl.NumberFormat("es-EC", {
        style: "currency",
        currency: "USD",
      }).format(value);

function Icon({
  name,
}: {
  name:
    | "file"
    | "scan"
    | "shield"
    | "check"
    | "warning"
    | "error"
    | "download"
    | "chevron"
    | "spark"
    | "close"
    | "cases"
    | "finance"
    | "inventory"
    | "analytics"
    | "documents"
    | "home"
    | "catalog"
    | "activity"
    | "knowledge"
    | "help";
}) {
  const paths = {
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8M8 17h5" />
      </>
    ),
    scan: (
      <>
        <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
        <path d="M7 12h10M7 15h7" />
      </>
    ),
    shield: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    warning: (
      <>
        <path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L14.7 2.9a2 2 0 0 0-3.4 0z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    error: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="m15 9-6 6M9 9l6 6" />
      </>
    ),
    download: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="m7 10 5 5 5-5M12 15V3" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    spark: (
      <>
        <path d="m12 3-1.6 4.4L6 9l4.4 1.6L12 15l1.6-4.4L18 9l-4.4-1.6L12 3Z" />
        <path d="m5 16-.8 2.2L2 19l2.2.8L5 22l.8-2.2L8 19l-2.2-.8L5 16Z" />
      </>
    ),
    close: <path d="m18 6-12 12M6 6l12 12" />,
    cases: (
      <>
        <path d="M4 5h16v15H4zM8 2v6M16 2v6M4 10h16" />
        <path d="M8 14h3M8 17h6" />
      </>
    ),
    finance: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 15h4M16 9v6M13.5 11.5h5" />
        <path d="M3 9h18" />
      </>
    ),
    inventory: (
      <>
        <path d="m3 7 9-4 9 4-9 4-9-4Z" />
        <path d="m3 7 9 4 9-4M3 7v10l9 4 9-4V7M12 11v10" />
      </>
    ),
    analytics: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        <path d="m4 7 6-4 6 7 5-4" />
      </>
    ),
    documents: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M8 13h8M8 17h8" />
      </>
    ),
    home: <><path d="M3 11 12 3l9 8"/><path d="M5 10v11h14V10M9 21v-7h6v7"/></>,
    catalog: <><path d="M4 5h16v16H4zM8 2v6M16 2v6M4 10h16"/><path d="M8 14h8M8 17h5"/></>,
    activity: <><path d="M3 12h4l2-6 4 12 2-6h6"/><path d="M4 3h16v18H4z"/></>,
    knowledge: <><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7z"/><path d="M9 22h6"/></>,
    help: <><circle cx="12" cy="12" r="10"/><path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8M12 17h.01"/></>,
  };
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export default function Home() {
  const [module, setModule] = useState<Module>("home");
  // Sube cuando llegan cambios de otro equipo; remonta los módulos que leen esos datos.
  const [dataVersion, setDataVersion] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [state, setState] = useState<AuditState>("ready");
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const totalSize = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files],
  );

  const navigateTo = (target: Module) => {
    setModule(target);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addFiles = (incoming: File[]) => {
    setError("");
    const accepted = incoming.filter((file) =>
      /^(application\/pdf|image\/(jpeg|png|webp))$/.test(file.type),
    );
    if (files.length + accepted.length > 6)
      return setError("Puede revisar un máximo de 6 archivos por expediente.");
    const combined = [...files, ...accepted].slice(0, 6);
    if (combined.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024)
      return setError("El expediente supera el límite combinado de 20 MB.");
    if (accepted.length !== incoming.length)
      setError("Se descartaron archivos que no son PDF, JPG, PNG o WEBP.");
    setFiles(combined);
    setResult(null);
    setState("ready");
  };

  const runAudit = async () => {
    if (!files.length || !consent) return;
    setState("processing");
    setError("");
    setResult(null);
    setProgress("Iniciando lectura local…");
    try {
      const data = await auditFilesLocally(files, setProgress);
      setResult(data);
      setState("complete");
      setProgress("");
      recordActivity(
        "Auditor",
        "Auditoría completada",
        `${data.extracted.patient_name || "Sin paciente"} · ${data.extracted.items.length} ítem(s) · Score ${data.score}/100 · ${data.status === "approved" ? "Aprobado" : data.status === "error" ? "Inconsistencias" : "Por revisar"}`,
        "audit"
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible completar la auditoría.",
      );
      setState("ready");
      setProgress("");
    }
  };

  const useDemo = () => {
    setFiles([]);
    setConsent(true);
    setError("");
    setResult(demoResult);
    setState("complete");
    recordActivity("Auditor", "Demostración cargada", "Expediente de demostración", "audit");
  };
  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
    setResult(null);
    setState("ready");
  };

  const exportCsv = () => {
    if (!result) return;
    const rows = [
      ["Código IESS", "Detalle", "Cantidad", "Valor unitario", "Valor total"],
      ...result.extracted.items.map((item) => [
        item.code ?? "",
        item.description,
        item.quantity ?? "",
        item.unit_value ?? "",
        item.line_total ?? "",
      ]),
    ];
    downloadCsv(rows, `auditoria-${result.extracted.patient_name ?? "volia"}.csv`);
    recordActivity("Auditor", "Reporte CSV exportado", `${result.extracted.patient_name || "Expediente"} · ${result.extracted.items.length} ítems`, "export");
  };

  const auditPayload = (): BusinessExport | null =>
    result
      ? {
          title: "Informe de auditoría documental",
          subtitle:
            result.extracted.patient_name ||
            "Expediente sin paciente identificado",
          reference:
            result.extracted.letter_date ||
            new Date().toLocaleDateString("es-EC"),
          metadata: [
            ["Paciente", result.extracted.patient_name],
            ["Cédula", result.extracted.patient_id],
            ["HCL", result.extracted.hcl],
            ["Hospital", result.extracted.hospital],
            ["Contrato", result.extracted.contract],
            ["Fecha de cirugía", result.extracted.surgery_date],
            ["Autoridad por fecha", result.authority?.name],
            ["Puntuación", `${result.score}/100`],
          ],
          tables: [
            {
              title: "Implantes y consumibles",
              headers: [
                "Código IESS",
                "Detalle",
                "Cantidad",
                "Valor unitario",
                "Valor total",
              ],
              rows: result.extracted.items.map((item) => [
                item.code,
                item.description,
                item.quantity,
                formatMoney(item.unit_value),
                formatMoney(item.line_total),
              ]),
            },
            {
              title: "Hallazgos",
              headers: ["Nivel", "Control", "Resultado"],
              rows: result.findings.map((finding) => [
                finding.severity === "ok"
                  ? "Correcto"
                  : finding.severity === "warning"
                    ? "Advertencia"
                    : "Error",
                finding.title,
                finding.detail,
              ]),
            },
          ],
          summary: [
            ["Subtotal verificado", formatMoney(result.calculations.subtotal)],
            ["IVA", formatMoney(result.calculations.iva)],
            ["Total verificado", formatMoney(result.calculations.total)],
          ],
          disclaimer:
            "Informe de VOLIA S.A.S. generado mediante OCR y reglas locales. Requiere validación humana contra los documentos originales.",
        }
      : null;

  const resultLabel =
    result?.status === "approved"
      ? "Expediente sin inconsistencias detectadas"
      : result?.status === "error"
        ? "Se detectaron errores que deben corregirse"
        : "Requiere verificación antes de presentar";
  const resultDetail =
    result?.status === "approved"
      ? "Los controles automáticos no encontraron diferencias. Mantenga la validación humana final."
      : result?.status === "error"
        ? "Revise los hallazgos marcados en rojo antes de continuar."
        : "Existen datos que deben confirmarse manualmente antes de enviar el expediente.";

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "mobile-nav-open" : ""}`}>
        <div className="brand">
          <div className="brand-logo">
            <img
              src={VOLIA_LOGO_DATA_URL}
              alt="Volia S.A.S."
              width="84"
              height="40"
            />
          </div>
          <div>
            <strong>VOLIA</strong>
            <small>Control empresarial</small>
          </div>
        </div>
        <button
          type="button"
          className="mobile-menu-toggle"
          aria-label={mobileNavOpen ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          <span aria-hidden="true">{mobileNavOpen ? "×" : "☰"}</span>
          <b>Menú</b>
        </button>
        <nav aria-label="Navegación principal">
          <button className={`nav-item ${module === "home" ? "active" : ""}`} onClick={() => navigateTo("home")}><Icon name="home" />Inicio</button>
          <button
            className={`nav-item ${module === "audit" ? "active" : ""}`}
            onClick={() => navigateTo("audit")}
          >
            <Icon name="scan" />
            Auditor inteligente
          </button>
          <button
            className={`nav-item ${module === "quote" ? "active" : ""}`}
            onClick={() => navigateTo("quote")}
          >
            <Icon name="file" />
            Cotizador
          </button>
          <button className={`nav-item ${module === "catalog" ? "active" : ""}`} onClick={() => navigateTo("catalog")}><Icon name="catalog" />Catálogo maestro</button>
          <button
            className={`nav-item ${module === "cases" ? "active" : ""}`}
            onClick={() => navigateTo("cases")}
          >
            <Icon name="cases" />
            Cirugías y cobros
          </button>
          <button
            className={`nav-item ${module === "finance" ? "active" : ""}`}
            onClick={() => navigateTo("finance")}
          >
            <Icon name="finance" />
            Finanzas
          </button>
          <button
            className={`nav-item ${module === "inventory" ? "active" : ""}`}
            onClick={() => navigateTo("inventory")}
          >
            <Icon name="inventory" />
            Inventario
          </button>
          <button
            className={`nav-item ${module === "regulatory" ? "active" : ""}`}
            onClick={() => navigateTo("regulatory")}
          >
            <Icon name="shield" />
            Vigencias
          </button>
          <button
            className={`nav-item ${module === "analytics" ? "active" : ""}`}
            onClick={() => navigateTo("analytics")}
          >
            <Icon name="analytics" />
            Estadísticas
          </button>
          <button
            className={`nav-item ${module === "market" ? "active" : ""}`}
            onClick={() => navigateTo("market")}
          >
            <Icon name="analytics" />
            Mercado SERCOP
          </button>
          <button
            className={`nav-item ${module === "documents" ? "active" : ""}`}
            onClick={() => navigateTo("documents")}
          >
            <Icon name="documents" />
            Documentos
          </button>
          <div className="nav-separator">Control y ayuda</div>
          <button className={`nav-item ${module === "knowledge" ? "active" : ""}`} onClick={() => navigateTo("knowledge")}><Icon name="knowledge" />Memoria y reglas</button>
          <button className={`nav-item ${module === "activity" ? "active" : ""}`} onClick={() => navigateTo("activity")}><Icon name="activity" />Historial</button>
          <button className={`nav-item ${module === "help" ? "active" : ""}`} onClick={() => navigateTo("help")}><Icon name="help" />Guía de uso</button>
        </nav>
        <div className="sidebar-foot">
          <div className="security-note">
            <Icon name="shield" />
            <div>
              <strong>Acceso protegido</strong>
              <span>
                Solo las personas autorizadas de Volia pueden entrar. Los datos se comparten entre sus equipos.
              </span>
            </div>
          </div>
          <div className="user">
            <div className="avatar">VS</div>
            <div>
              <strong>VOLIA S.A.S.</strong>
              <span>Administrador</span>
            </div>
          </div>
        </div>
      </aside>
      {mobileNavOpen && <button className="mobile-nav-backdrop" type="button" aria-label="Cerrar menú" onClick={() => setMobileNavOpen(false)} />}

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <span className="topbar-crumb">Volia Control</span>
            <h1>{MODULE_INFO[module].title}</h1>
          </div>
          <div className="topbar-actions">
            <SharedSyncStatus onRemoteChange={() => setDataVersion((v) => v + 1)} />
            <CloudSyncModal />
            <AccessibilityToolbar onHelp={() => navigateTo("help")} />
            <InstallManager />
          </div>
        </header>
        <div className="content">
          <div
            className="module-tabs"
            role="tablist"
            aria-label="Módulos de Volia Control"
          >
            <button className={`module-tab ${module === "home" ? "active" : ""}`} onClick={() => setModule("home")} role="tab" aria-selected={module === "home"}><Icon name="home" />Inicio</button>
            <button
              className={`module-tab ${module === "audit" ? "active" : ""}`}
              onClick={() => setModule("audit")}
              role="tab"
              aria-selected={module === "audit"}
            >
              <Icon name="scan" />
              Auditor inteligente
            </button>
            <button
              className={`module-tab ${module === "quote" ? "active" : ""}`}
              onClick={() => setModule("quote")}
              role="tab"
              aria-selected={module === "quote"}
            >
              <Icon name="file" />
              Cotizador
            </button>
            <button className={`module-tab ${module === "catalog" ? "active" : ""}`} onClick={() => setModule("catalog")} role="tab" aria-selected={module === "catalog"}><Icon name="catalog" />Catálogo</button>
            <button
              className={`module-tab ${module === "cases" ? "active" : ""}`}
              onClick={() => setModule("cases")}
              role="tab"
              aria-selected={module === "cases"}
            >
              <Icon name="cases" />
              Cirugías y cobros
            </button>
            <button
              className={`module-tab ${module === "finance" ? "active" : ""}`}
              onClick={() => setModule("finance")}
              role="tab"
              aria-selected={module === "finance"}
            >
              <Icon name="finance" />
              Finanzas
            </button>
            <button
              className={`module-tab ${module === "inventory" ? "active" : ""}`}
              onClick={() => setModule("inventory")}
              role="tab"
              aria-selected={module === "inventory"}
            >
              <Icon name="inventory" />
              Inventario
            </button>
            <button
              className={`module-tab ${module === "analytics" ? "active" : ""}`}
              onClick={() => setModule("analytics")}
              role="tab"
              aria-selected={module === "analytics"}
            >
              <Icon name="analytics" />
              Estadísticas
            </button>
            <button
              className={`module-tab ${module === "documents" ? "active" : ""}`}
              onClick={() => setModule("documents")}
              role="tab"
              aria-selected={module === "documents"}
            >
              <Icon name="documents" />
              Documentos
            </button>
            <button className={`module-tab ${module === "knowledge" ? "active" : ""}`} onClick={() => setModule("knowledge")} role="tab" aria-selected={module === "knowledge"}><Icon name="knowledge" />Memoria</button>
            <button className={`module-tab ${module === "activity" ? "active" : ""}`} onClick={() => setModule("activity")} role="tab" aria-selected={module === "activity"}><Icon name="activity" />Historial</button>
            <button className={`module-tab ${module === "help" ? "active" : ""}`} onClick={() => setModule("help")} role="tab" aria-selected={module === "help"}><Icon name="help" />Ayuda</button>
          </div>
          <Fragment key={["home", "inventory", "analytics", "finance"].includes(module) ? `datos-${dataVersion}` : "fijo"}>
          {module === "home" ? (
            <HomeDashboard onNavigate={(target) => setModule(target as Module)} />
          ) : module === "audit" ? (
            <>
              <section className="intro-card">
                <div>
                  <span className="step">01</span>
                  <h2>Carga el expediente</h2>
                  <p>
                    Selecciona hasta seis cartas, facturas o fotografías. El
                    lector gratuito funciona en tu navegador, sin créditos ni
                    envío de los documentos a una API.
                  </p>
                </div>
                <button className="ghost-button" onClick={useDemo}>
                  <Icon name="spark" />
                  Usar caso de ejemplo
                </button>
              </section>
              <section className="upload-grid">
                <div
                  className={`dropzone ${files.length ? "has-file" : ""}`}
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    addFiles(Array.from(event.dataTransfer.files));
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) =>
                    event.key === "Enter" && inputRef.current?.click()
                  }
                >
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(event) =>
                      addFiles(Array.from(event.target.files ?? []))
                    }
                    hidden
                  />
                  <div className="upload-icon">
                    <Icon name={files.length ? "check" : "file"} />
                  </div>
                  {files.length ? (
                    <>
                      <strong>{files.length} archivo(s) seleccionado(s)</strong>
                      <span>
                        {(totalSize / 1024 / 1024).toFixed(2)} MB en total
                      </span>
                      <small>Haz clic para agregar más documentos</small>
                    </>
                  ) : (
                    <>
                      <strong>Arrastra los documentos aquí</strong>
                      <span>o haz clic para seleccionar</span>
                      <small>
                        PDF, JPG, PNG o WEBP · Hasta 6 archivos · 20 MB
                        combinados · PDF: hasta 8 páginas
                      </small>
                    </>
                  )}
                </div>
                <div className="checklist-card">
                  <p className="eyebrow">Controles activos</p>
                  {[
                    ["Datos del paciente", "Nombre, cédula, HCL y fechas"],
                    ["Valores y códigos", "Precios, cantidades, IVA y total"],
                    [
                      "Autoridad por fecha",
                      "Contraste con periodos registrados",
                    ],
                    [
                      "Integridad documental",
                      "Firmas, anexos y campos ilegibles",
                    ],
                  ].map((rule, index) => (
                    <div className="rule" key={rule[0]}>
                      <span className="rule-number">0{index + 1}</span>
                      <div>
                        <strong>{rule[0]}</strong>
                        <small>{rule[1]}</small>
                      </div>
                      <Icon name="check" />
                    </div>
                  ))}
                </div>
              </section>

              {!!files.length && (
                <div className="file-list">
                  {files.map((file, index) => (
                    <div className="file-chip" key={`${file.name}-${index}`}>
                      <Icon name="file" />
                      <div>
                        <strong>{file.name}</strong>
                        <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                      <button
                        onClick={() => removeFile(index)}
                        aria-label={`Quitar ${file.name}`}
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {!!error && (
                <div className="status-banner error">
                  <Icon name="error" />
                  <div>
                    <strong>No se pudo completar la operación</strong>
                    <span>{error}</span>
                  </div>
                </div>
              )}
              {!!files.length && (
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <span>
                    Confirmo que estoy autorizado para revisar estos documentos.
                    El procesamiento ocurre localmente en este dispositivo.
                  </span>
                </label>
              )}
              <button
                className="primary-button"
                disabled={!files.length || !consent || state === "processing"}
                onClick={runAudit}
              >
                {state === "processing" ? (
                  <>
                    <span className="spinner"></span>
                    {progress || "Leyendo y verificando el expediente…"}
                  </>
                ) : (
                  <>
                    <Icon name="scan" />
                    Ejecutar auditoría gratuita
                  </>
                )}
              </button>
              <p className="local-note">
                <Icon name="shield" />
                Sin suscripciones ni consumo de API. En la primera lectura, el
                navegador carga el motor OCR incluido y puede tardar un poco
                más. En PDF escaneado, aplica OCR intensivo a las primeras 4
                páginas.
              </p>

              {state === "complete" && result && (
                <section className="results" aria-live="polite">
                  <div className="result-heading">
                    <div>
                      <span className="step">02</span>
                      <h2>Resultado de la auditoría</h2>
                      <p>
                        Lectura OCR y controles completados localmente. Confirma
                        los datos contra el documento original antes de
                        presentar.
                      </p>
                    </div>
                    <div className="score">
                      <strong>{result.score}</strong>
                      <span>/ 100</span>
                      <small>
                        CONFIANZA{" "}
                        {result.score >= 80
                          ? "ALTA"
                          : result.score >= 60
                            ? "MEDIA"
                            : "BAJA"}
                      </small>
                    </div>
                  </div>
                  <div className={`status-banner ${result.status}`}>
                    <Icon
                      name={
                        result.status === "approved"
                          ? "check"
                          : result.status === "error"
                            ? "error"
                            : "warning"
                      }
                    />
                    <div>
                      <strong>{resultLabel}</strong>
                      <span>{resultDetail}</span>
                    </div>
                  </div>
                  <div className="summary-grid">
                    <article>
                      <span>Paciente</span>
                      <strong>
                        {result.extracted.patient_name ?? "No identificado"}
                      </strong>
                      <small>
                        CI {result.extracted.patient_id ?? "—"} · HCL{" "}
                        {result.extracted.hcl ?? "—"}
                      </small>
                    </article>
                    <article>
                      <span>Fecha de cirugía</span>
                      <strong>
                        {result.extracted.surgery_date ?? "No identificada"}
                      </strong>
                      <small>
                        Documento: {result.extracted.letter_date ?? "—"}
                      </small>
                    </article>
                    <article>
                      <span>Contrato</span>
                      <strong>
                        {result.extracted.contract ?? "No identificado"}
                      </strong>
                      <small>
                        {result.extracted.hospital ??
                          "Hospital no identificado"}
                      </small>
                    </article>
                    <article>
                      <span>Total verificado</span>
                      <strong>{formatMoney(result.calculations.total)}</strong>
                      <small>
                        IVA 15 %: {formatMoney(result.calculations.iva)}
                      </small>
                    </article>
                  </div>
                  <div className="two-column">
                    <div className="panel">
                      <div className="panel-title">
                        <div>
                          <p className="eyebrow">Hallazgos</p>
                          <h3>Controles aplicados</h3>
                        </div>
                        <span className="count">{result.findings.length}</span>
                      </div>
                      {result.findings.map((finding, index) => (
                        <div
                          className={`finding ${finding.severity === "warning" ? "alert" : finding.severity}`}
                          key={`${finding.title}-${index}`}
                        >
                          <Icon
                            name={
                              finding.severity === "ok"
                                ? "check"
                                : finding.severity
                            }
                          />
                          <div>
                            <strong>{finding.title}</strong>
                            <span>{finding.detail}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="panel authority-panel">
                      <div className="panel-title">
                        <div>
                          <p className="eyebrow">Regla temporal</p>
                          <h3>Autoridad por fecha</h3>
                        </div>
                        <Icon name="shield" />
                      </div>
                      <div
                        className={`authority-card ${result.authority?.matched === false ? "manual" : ""}`}
                      >
                        <span className="authority-label">
                          {result.authority?.matched
                            ? "CORRESPONDE POR FECHA"
                            : "VALIDACIÓN NECESARIA"}
                        </span>
                        <strong>
                          {result.authority?.name ?? "Sin fecha suficiente"}
                        </strong>
                        <p>
                          {result.authority?.role ??
                            "No fue posible aplicar la regla temporal."}
                        </p>
                        <div className="period">
                          <span>Periodo aplicable</span>
                          <strong>{result.authority?.period ?? "—"}</strong>
                        </div>
                      </div>
                      <details>
                        <summary>
                          Ver periodos registrados <Icon name="chevron" />
                        </summary>
                        {authorityPeriods.map((period) => (
                          <p key={period}>{period}</p>
                        ))}
                      </details>
                      <div className="document-meta">
                        <span>Dirigido a</span>
                        <strong>
                          {result.extracted.addressed_to ?? "No identificado"}
                        </strong>
                        <span>Firmante detectado</span>
                        <strong>
                          {result.extracted.signer ?? "No identificado"}
                        </strong>
                      </div>
                    </div>
                  </div>
                  <div className="panel items-panel">
                    <div className="panel-title">
                      <div>
                        <p className="eyebrow">Extracción</p>
                        <h3>Implantes y consumibles</h3>
                      </div>
                      <button className="text-button" onClick={exportCsv}>
                        <Icon name="download" />
                        Exportar CSV
                      </button>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Código IESS</th>
                            <th>Detalle</th>
                            <th>Cant.</th>
                            <th>V. unitario</th>
                            <th>V. total</th>
                            <th>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.extracted.items.map((item, index) => (
                            <tr key={`${item.code}-${index}`}>
                              <td className="mono">{item.code ?? "—"}</td>
                              <td>{item.description}</td>
                              <td>{item.quantity ?? "—"}</td>
                              <td>{formatMoney(item.unit_value)}</td>
                              <td>{formatMoney(item.line_total)}</td>
                              <td>
                                {result.itemErrors[String(index)] ? (
                                  <span className="unverified">
                                    <Icon name="warning" />
                                    Revisar
                                  </span>
                                ) : (
                                  <span className="verified">
                                    <Icon name="check" />
                                    Verificado
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!result.extracted.items.length && (
                        <p className="empty-table">
                          No se identificaron líneas de productos.
                        </p>
                      )}
                    </div>
                  </div>
                  {!!result.extracted.notes.length && (
                    <div className="panel notes-panel">
                      <p className="eyebrow">Observaciones de lectura</p>
                      {result.extracted.notes.map((note, index) => (
                        <p key={index}>{note}</p>
                      ))}
                    </div>
                  )}
                  <div className="action-bar">
                    <div>
                      <strong>Siguiente acción sugerida</strong>
                      <span>
                        {result.status === "approved"
                          ? "Realizar la aprobación humana y archivar el informe."
                          : "Revisar los hallazgos, corregir el expediente y ejecutar nuevamente la auditoría."}
                      </span>
                    </div>
                    <div className="report-actions">
                      <button
                        className="secondary-button"
                        onClick={() => {
                          const payload = auditPayload();
                          if (payload) {
                            exportBusinessPdf(
                              payload,
                              `auditoria-${result.extracted.patient_name || "volia"}`,
                            );
                            recordActivity("Auditor", "Reporte PDF exportado", `${result.extracted.patient_name || "Expediente"}`, "export");
                          }
                        }}
                      >
                        <Icon name="download" />
                        PDF
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => {
                          const payload = auditPayload();
                          if (payload) {
                            exportBusinessWord(
                              payload,
                              `auditoria-${result.extracted.patient_name || "volia"}`,
                            );
                            recordActivity("Auditor", "Reporte Word exportado", `${result.extracted.patient_name || "Expediente"}`, "export");
                          }
                        }}
                      >
                        <Icon name="download" />
                        Word
                      </button>
                      <button className="secondary-button" onClick={exportCsv}>
                        <Icon name="download" />
                        Excel/CSV
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => {
                          window.print();
                          recordActivity("Auditor", "Reporte impreso", `${result.extracted.patient_name || "Expediente"}`, "export");
                        }}
                      >
                        <Icon name="file" />
                        Imprimir
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </>
          ) : module === "quote" ? (
            <QuoteBuilder />
          ) : module === "catalog" ? (
            <ProductCatalog />
          ) : module === "cases" ? (
            <CaseTracker />
          ) : module === "finance" ? (
            <FinanceCenter />
          ) : module === "inventory" ? (
            <InventoryTracker />
          ) : module === "regulatory" ? (
            <RegulatoryCenter />
          ) : module === "analytics" ? (
            <MovementAnalytics />
          ) : module === "market" ? (
            <MarketCenter />
          ) : module === "documents" ? (
            <><OfferPackage /><DocumentGenerator /></>
          ) : module === "knowledge" ? (
            <KnowledgeCenter />
          ) : module === "activity" ? (
            <ActivityCenter />
          ) : (
            <HelpCenter />
          )}
          </Fragment>
        </div>
      </section>
      <nav className="mobile-bottom-nav" aria-label="Accesos rápidos">
        <button className={module === "home" ? "active" : ""} onClick={() => navigateTo("home")}><Icon name="home" /><span>Inicio</span></button>
        <button className={module === "quote" ? "active" : ""} onClick={() => navigateTo("quote")}><Icon name="file" /><span>Cotizar</span></button>
        <button className={module === "cases" ? "active" : ""} onClick={() => navigateTo("cases")}><Icon name="cases" /><span>Cirugías</span></button>
        <button className={module === "inventory" ? "active" : ""} onClick={() => navigateTo("inventory")}><Icon name="inventory" /><span>Inventario</span></button>
        <button className={mobileNavOpen ? "active" : ""} onClick={() => setMobileNavOpen(true)}><span className="more-icon" aria-hidden="true">•••</span><span>Más</span></button>
      </nav>
    </main>
  );
}
