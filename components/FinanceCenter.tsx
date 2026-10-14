"use client";

import { useEffect, useMemo, useState } from "react";
import {
  exportBusinessPdf,
  exportBusinessWord,
  type BusinessExport,
} from "../lib/business-exports";
import { downloadCsv } from "../lib/csv";
import { businessIsoDate } from "../lib/date-utils";
import {
  LEGACY_SAMPLE_STOCK_IDS,
  MOVEMENTS_KEY,
  isLoss,
  type StockMovement,
} from "../lib/inventory-data";
import { readStoredArray, readStoredObject, writeStoredJson } from "../lib/storage";
import { recordActivity } from "../lib/activity-log";

type Direction = "income" | "expense";
type FinanceStatus = "paid" | "pending";
type FinanceView = "overview" | "ledger" | "receivables" | "budget" | "taxes";
type FinanceRecord = {
  id: string;
  direction: Direction;
  status: FinanceStatus;
  date: string;
  dueDate: string;
  counterparty: string;
  document: string;
  category: string;
  costCenter: string;
  description: string;
  subtotal: number;
  iva: number;
  withholding: number;
  paymentMethod: string;
  sourceCaseId?: string;
};
type FinanceSettings = {
  openingBalance: number;
  monthlyExpenseBudget: number;
  monthlySalesTarget: number;
};
type CaseLink = {
  id: string;
  patient: string;
  hospital?: string;
  contract?: string;
  invoice: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: string;
};

const RECORDS_KEY = "volia-finance-records-v1";
const SETTINGS_KEY = "volia-finance-settings-v1";
const CASES_KEY = "volia-case-tracker-v1";
const today = businessIsoDate;
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const money = (value: number) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(
    Number.isFinite(value) ? value : 0,
  );
const dateLabel = (value: string) =>
  value
    ? new Intl.DateTimeFormat("es-EC", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${value}T00:00:00Z`))
    : "Sin fecha";
const CATEGORIES: Record<Direction, string[]> = {
  income: ["Venta de insumos", "Servicio", "Otros ingresos"],
  expense: [
    "Compra de inventario",
    "Importación y flete",
    "Nómina",
    "Transporte",
    "Servicios",
    "Impuestos",
    "Administración",
    "Otros gastos",
  ],
};
const COST_CENTERS = [
  "Comercial",
  "Cirugías",
  "Inventario",
  "Administración",
  "Importaciones",
];
const EMPTY_SETTINGS: FinanceSettings = {
  openingBalance: 0,
  monthlyExpenseBudget: 5000,
  monthlySalesTarget: 15000,
};
const newRecord = (): FinanceRecord => ({
  id: "",
  direction: "income",
  status: "pending",
  date: today(),
  dueDate: today(),
  counterparty: "",
  document: "",
  category: CATEGORIES.income[0],
  costCenter: "Comercial",
  description: "",
  subtotal: 0,
  iva: 0,
  withholding: 0,
  paymentMethod: "Transferencia",
});

function daysFromToday(value: string) {
  if (!value) return 0;
  const base = new Date(`${today()}T00:00:00Z`).getTime();
  return Math.ceil(
    (new Date(`${value}T00:00:00Z`).getTime() - base) / 86400000,
  );
}

export default function FinanceCenter() {
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [settings, setSettings] = useState<FinanceSettings>(EMPTY_SETTINGS);
  const [linkedCases, setLinkedCases] = useState<CaseLink[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [view, setView] = useState<FinanceView>("overview");
  const [draft, setDraft] = useState<FinanceRecord>(newRecord());
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const cases = readStoredArray<CaseLink>(CASES_KEY).filter((record) => !["demo-1", "demo-2", "demo-3"].includes(record.id));
        const loadedRecords = readStoredArray<FinanceRecord>(RECORDS_KEY).map((record) => {
          const linked = record.sourceCaseId
            ? cases.find((entry) => entry.id === record.sourceCaseId)
            : cases.find((entry) => record.document === entry.invoice || record.document === `CIR-${entry.id}`);
          const migrated = linked && !record.sourceCaseId ? { ...record, sourceCaseId: linked.id } : record;
          return linked?.status === "paid" ? { ...migrated, status: "paid" as const } : migrated;
        });
        setRecords(loadedRecords);
        setSettings(readStoredObject(SETTINGS_KEY, EMPTY_SETTINGS));
        setLinkedCases(cases);
        setStockMovements(readStoredArray<StockMovement>(MOVEMENTS_KEY).filter((movement) => !LEGACY_SAMPLE_STOCK_IDS.has(movement.itemId)));
      } catch {
        setRecords([]);
        setSettings(EMPTY_SETTINGS);
      }
      setRestored(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (restored) writeStoredJson(RECORDS_KEY, records);
  }, [records, restored]);
  useEffect(() => {
    if (restored) writeStoredJson(SETTINGS_KEY, settings);
  }, [settings, restored]);

  const enriched = useMemo(
    () =>
      records.map((record) => ({
        ...record,
        total: record.subtotal + record.iva - record.withholding,
        overdue:
          record.status === "pending" &&
          !!record.dueDate &&
          daysFromToday(record.dueDate) < 0,
      })),
    [records],
  );
  const currentMonth = today().slice(0, 7);
  const monthRecords = enriched.filter((record) =>
    record.date.startsWith(currentMonth),
  );
  const paidIncome = enriched
    .filter((r) => r.direction === "income" && r.status === "paid")
    .reduce((sum, r) => sum + r.total, 0);
  const paidExpense = enriched
    .filter((r) => r.direction === "expense" && r.status === "paid")
    .reduce((sum, r) => sum + r.total, 0);
  const cash = settings.openingBalance + paidIncome - paidExpense;
  const receivables = enriched
    .filter((r) => r.direction === "income" && r.status === "pending")
    .reduce((sum, r) => sum + r.total, 0);
  const payables = enriched
    .filter((r) => r.direction === "expense" && r.status === "pending")
    .reduce((sum, r) => sum + r.total, 0);
  const incomeAccrual = monthRecords
    .filter((r) => r.direction === "income")
    .reduce((sum, r) => sum + r.subtotal, 0);
  const expenseAccrual = monthRecords
    .filter((r) => r.direction === "expense")
    .reduce((sum, r) => sum + r.subtotal, 0);
  const operatingProfit = incomeAccrual - expenseAccrual;
  const margin = incomeAccrual ? (operatingProfit / incomeAccrual) * 100 : 0;
  const next30Income = enriched
    .filter(
      (r) =>
        r.direction === "income" &&
        r.status === "pending" &&
        daysFromToday(r.dueDate) >= 0 &&
        daysFromToday(r.dueDate) <= 30,
    )
    .reduce((sum, r) => sum + r.total, 0);
  const next30Expense = enriched
    .filter(
      (r) =>
        r.direction === "expense" &&
        r.status === "pending" &&
        daysFromToday(r.dueDate) >= 0 &&
        daysFromToday(r.dueDate) <= 30,
    )
    .reduce((sum, r) => sum + r.total, 0);
  const projectedCash = cash + next30Income - next30Expense;
  const overdueReceivables = enriched.filter(
    (r) => r.direction === "income" && r.overdue,
  );
  const overduePayables = enriched.filter(
    (r) => r.direction === "expense" && r.overdue,
  );
  const ivaSales = monthRecords
    .filter((r) => r.direction === "income")
    .reduce((sum, r) => sum + r.iva, 0);
  const ivaPurchases = monthRecords
    .filter((r) => r.direction === "expense")
    .reduce((sum, r) => sum + r.iva, 0);
  const withheldToUs = monthRecords
    .filter((r) => r.direction === "income")
    .reduce((sum, r) => sum + r.withholding, 0);
  const withheldByUs = monthRecords
    .filter((r) => r.direction === "expense")
    .reduce((sum, r) => sum + r.withholding, 0);
  const linkedPending = linkedCases.reduce(
    (sum, record) =>
      sum +
      Math.max(
        0,
        (Number(record.amount) || 0) - (Number(record.paidAmount) || 0),
      ),
    0,
  );
  const inventoryLoss = stockMovements
    .filter((movement) => isLoss(movement.type))
    .reduce((sum, movement) => sum + movement.quantity * movement.unitCost, 0);

  const categoryMap = new Map<string, number>();
  monthRecords
    .filter((r) => r.direction === "expense")
    .forEach((r) =>
      categoryMap.set(
        r.category,
        (categoryMap.get(r.category) || 0) + r.subtotal,
      ),
    );
  const categories = [...categoryMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const maxCategory = Math.max(
    1,
    ...categories.map((category) => category.value),
  );

  const weeklyFlow = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => {
        const start = index * 7;
        const end = start + 6;
        const projected = enriched.filter(
          (r) =>
            r.status === "pending" &&
            daysFromToday(r.dueDate) >= start &&
            daysFromToday(r.dueDate) <= end,
        );
        return {
          label: index === 0 ? "Esta semana" : `Semana ${index + 1}`,
          income: projected
            .filter((r) => r.direction === "income")
            .reduce((sum, r) => sum + r.total, 0),
          expense: projected
            .filter((r) => r.direction === "expense")
            .reduce((sum, r) => sum + r.total, 0),
        };
      }),
    [enriched],
  );
  const maxWeek = Math.max(
    1,
    ...weeklyFlow.flatMap((week) => [week.income, week.expense]),
  );

  const setDirection = (direction: Direction) =>
    setDraft((current) => ({
      ...current,
      direction,
      category: CATEGORIES[direction][0],
    }));
  const calculateIva = () =>
    setDraft((current) => ({
      ...current,
      iva: Math.round(current.subtotal * 0.15 * 100) / 100,
    }));
  const save = () => {
    setMessage("");
    if (!draft.counterparty.trim() || draft.subtotal <= 0)
      return setMessage("Complete la contraparte y un subtotal mayor a cero.");
    const next = {
      ...draft,
      id: draft.id || uid(),
      counterparty: draft.counterparty.trim(),
      description: draft.description.trim(),
    };
    setRecords((current) =>
      draft.id
        ? current.map((record) => (record.id === draft.id ? next : record))
        : [next, ...current],
    );
    setDraft(newRecord());
    setShowForm(false);
    setMessage("Movimiento financiero registrado.");
    recordActivity("Finanzas", draft.id ? "Movimiento actualizado" : "Movimiento registrado", `${next.counterparty} · ${money(next.subtotal + next.iva - next.withholding)}`);
  };
  const edit = (record: FinanceRecord) => {
    setDraft({ ...record });
    setShowForm(true);
    setMessage("");
  };
  const importCases = () => {
    const existing = new Set(
      records.map((record) => record.document).filter(Boolean),
    );
    const candidates = linkedCases
      .filter(
        (record) =>
          Math.max(
            0,
            Number(record.amount || 0) - Number(record.paidAmount || 0),
          ) > 0,
      )
      .filter((record) => !existing.has(record.invoice || `CIR-${record.id}`));
    if (!candidates.length)
      return setMessage("No hay nuevas cuentas de cirugías para importar.");
    const imported: FinanceRecord[] = candidates.map((record) => ({
      id: uid(),
      direction: "income",
      status: "pending",
      date: today(),
      dueDate: record.dueDate || today(),
      counterparty:
        record.hospital || record.patient || "Cliente por confirmar",
      document: record.invoice || `CIR-${record.id}`,
      category: "Venta de insumos",
      costCenter: "Cirugías",
      description: `Paciente: ${record.patient || "—"}${record.contract ? ` · Contrato: ${record.contract}` : ""}. Revisar desglose tributario del valor importado.`,
      subtotal: Math.max(
        0,
        Number(record.amount || 0) - Number(record.paidAmount || 0),
      ),
      iva: 0,
      withholding: 0,
      paymentMethod: "Transferencia",
      sourceCaseId: record.id,
    }));
    setRecords((current) => [...imported, ...current]);
    recordActivity("Finanzas", "Cuentas importadas", `${imported.length} cuenta(s) desde Cirugías`);
    setMessage(
      `${imported.length} cuenta(s) por cobrar importada(s) desde Cirugías.`,
    );
  };
  const toggleStatus = (id: string) => {
    const target = records.find((record) => record.id === id);
    if (!target) return;
    const nextStatus: FinanceStatus = target.status === "paid" ? "pending" : "paid";
    setRecords((current) => current.map((record) => record.id === id ? { ...record, status: nextStatus } : record));
    recordActivity("Finanzas", nextStatus === "paid" ? "Pago confirmado" : "Pago reabierto", `${target.counterparty} · ${target.document || "Sin documento"}`);
    if (target.sourceCaseId) {
      const cases = readStoredArray<CaseLink & { paidAmount: number }>(CASES_KEY);
      const updated = cases.map((record) => record.id === target.sourceCaseId ? { ...record, paidAmount: nextStatus === "paid" ? Number(record.amount) || 0 : 0, status: nextStatus === "paid" ? "paid" : record.status === "paid" ? "approved" : record.status } : record);
      writeStoredJson(CASES_KEY, updated);
      setLinkedCases(updated);
    }
  };
  const remove = (id: string) => {
    if (window.confirm("¿Eliminar definitivamente este movimiento financiero?")) {
      const target = records.find((record) => record.id === id);
      setRecords((current) => current.filter((record) => record.id !== id));
      if (target) recordActivity("Finanzas", "Movimiento eliminado", target.counterparty);
    }
  };

  const exportCsv = () => {
    const rows = [
      [
        "Fecha",
        "Tipo",
        "Estado",
        "Contraparte",
        "Documento",
        "Categoría",
        "Centro de costo",
        "Subtotal",
        "IVA",
        "Retención",
        "Total",
        "Vencimiento",
      ],
      ...enriched.map((r) => [
        r.date,
        r.direction === "income" ? "Ingreso" : "Egreso",
        r.status === "paid" ? "Pagado" : "Pendiente",
        r.counterparty,
        r.document,
        r.category,
        r.costCenter,
        r.subtotal,
        r.iva,
        r.withholding,
        r.total,
        r.dueDate,
      ]),
    ];
    downloadCsv(rows, `finanzas-volia-${today()}.csv`);
    recordActivity("Finanzas", "Movimientos exportados en CSV", `${enriched.length} registros exportados`, "export");
  };
  const exportPayload = (): BusinessExport => ({
    title: "Informe financiero gerencial",
    subtitle: `VOLIA S.A.S. · ${dateLabel(today())}`,
    metadata: [
      ["Caja registrada", money(cash)],
      ["Cuentas por cobrar", money(receivables)],
      ["Cuentas por pagar", money(payables)],
      ["Resultado operativo del mes", money(operatingProfit)],
      ["Margen operativo", `${margin.toFixed(1)} %`],
      ["Caja proyectada a 30 días", money(projectedCash)],
    ],
    tables: [
      {
        title: "Movimientos financieros",
        headers: [
          "Fecha",
          "Tipo",
          "Contraparte",
          "Documento",
          "Estado",
          "Total",
        ],
        rows: enriched.map((r) => [
          dateLabel(r.date),
          r.direction === "income" ? "Ingreso" : "Egreso",
          r.counterparty,
          r.document || "—",
          r.status === "paid" ? "Pagado" : r.overdue ? "Vencido" : "Pendiente",
          money(r.total),
        ]),
      },
    ],
    summary: [
      ["IVA en ventas", money(ivaSales)],
      ["IVA en compras", money(ivaPurchases)],
      ["Diferencia referencial", money(ivaSales - ivaPurchases)],
    ],
    disclaimer:
      "Reporte gerencial de VOLIA S.A.S. No sustituye la contabilidad, conciliación bancaria ni declaración tributaria oficial.",
  });

  const exportPdf = () => {
    exportBusinessPdf(exportPayload(), "informe-financiero-volia");
    recordActivity("Finanzas", "Informe financiero exportado en PDF", `Resumen financiero al ${dateLabel(today())}`, "export");
  };

  const exportWord = () => {
    exportBusinessWord(exportPayload(), "informe-financiero-volia");
    recordActivity("Finanzas", "Informe financiero exportado en Word", `Resumen financiero al ${dateLabel(today())}`, "export");
  };

  const viewLabels: Array<[FinanceView, string]> = [
    ["overview", "Resumen"],
    ["ledger", "Movimientos"],
    ["receivables", "CxC y CxP"],
    ["budget", "Presupuesto"],
    ["taxes", "Tributario"],
  ];
  return (
    <section className="business-module finance-module">
      <div className="module-hero">
        <div>
          <p className="eyebrow">Departamento financiero</p>
          <h2>Centro financiero y tesorería</h2>
          <p>
            Convierte ventas, cobros, compras y gastos en decisiones: liquidez,
            utilidad, vencimientos, presupuesto y obligaciones por revisar.
          </p>
        </div>
        <div className="hero-actions export-actions">
          <button
            className="secondary-button"
            onClick={exportPdf}
          >
            PDF
          </button>
          <button
            className="secondary-button"
            onClick={exportWord}
          >
            Word
          </button>
          <button className="secondary-button" onClick={exportCsv}>
            Excel/CSV
          </button>
          <button
            className="primary-button"
            onClick={() => setShowForm((value) => !value)}
          >
            {showForm ? "Cerrar" : "+ Registrar movimiento"}
          </button>
        </div>
      </div>

      <div
        className="finance-nav"
        role="tablist"
        aria-label="Secciones financieras"
      >
        {viewLabels.map(([key, label]) => (
          <button
            key={key}
            className={view === key ? "active" : ""}
            onClick={() => setView(key)}
            role="tab"
            aria-selected={view === key}
          >
            {label}
          </button>
        ))}
      </div>

      {showForm && (
        <section className="business-card finance-entry">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Registro financiero</p>
              <h3>{draft.id ? "Editar movimiento" : "Ingreso, cobro, compra o gasto"}</h3>
            </div>
            <div className="direction-switch">
              <button
                className={draft.direction === "income" ? "active" : ""}
                onClick={() => setDirection("income")}
              >
                Ingreso
              </button>
              <button
                className={
                  draft.direction === "expense" ? "active expense" : ""
                }
                onClick={() => setDirection("expense")}
              >
                Egreso
              </button>
            </div>
          </div>
          <div className="finance-form">
            <label>
              <span>Contraparte *</span>
              <input
                value={draft.counterparty}
                placeholder={
                  draft.direction === "income"
                    ? "Cliente o institución"
                    : "Proveedor"
                }
                onChange={(e) =>
                  setDraft({ ...draft, counterparty: e.target.value })
                }
              />
            </label>
            <label>
              <span>Documento</span>
              <input
                value={draft.document}
                placeholder="Factura, retención o referencia"
                onChange={(e) =>
                  setDraft({ ...draft, document: e.target.value })
                }
              />
            </label>
            <label>
              <span>Categoría</span>
              <select
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              >
                {CATEGORIES[draft.direction].map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Centro de costo</span>
              <select
                value={draft.costCenter}
                onChange={(e) =>
                  setDraft({ ...draft, costCenter: e.target.value })
                }
              >
                {COST_CENTERS.map((center) => (
                  <option key={center}>{center}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Fecha</span>
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </label>
            <label>
              <span>Vencimiento / cobro</span>
              <input
                type="date"
                value={draft.dueDate}
                onChange={(e) =>
                  setDraft({ ...draft, dueDate: e.target.value })
                }
              />
            </label>
            <label>
              <span>Estado</span>
              <select
                value={draft.status}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    status: e.target.value as FinanceStatus,
                  })
                }
              >
                <option value="pending">Pendiente</option>
                <option value="paid">Pagado / cobrado</option>
              </select>
            </label>
            <label>
              <span>Medio de pago</span>
              <select
                value={draft.paymentMethod}
                onChange={(e) =>
                  setDraft({ ...draft, paymentMethod: e.target.value })
                }
              >
                <option>Transferencia</option>
                <option>Efectivo</option>
                <option>Cheque</option>
                <option>Tarjeta</option>
                <option>Crédito</option>
              </select>
            </label>
            <label>
              <span>Subtotal *</span>
              <input
                type="number"
                min="0"
                step=".01"
                value={draft.subtotal || ""}
                placeholder="0.00"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    subtotal: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </label>
            <label>
              <span>IVA</span>
              <div className="money-input-action">
                <input
                  type="number"
                  min="0"
                  step=".01"
                  value={draft.iva || ""}
                  placeholder="0.00"
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      iva: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
                <button onClick={calculateIva}>15 %</button>
              </div>
            </label>
            <label>
              <span>Retención</span>
              <input
                type="number"
                min="0"
                step=".01"
                value={draft.withholding || ""}
                placeholder="0.00"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    withholding: Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </label>
            <label>
              <span>Total efectivo</span>
              <strong className="calculated-total">
                {money(draft.subtotal + draft.iva - draft.withholding)}
              </strong>
            </label>
            <label className="finance-wide">
              <span>Descripción</span>
              <input
                value={draft.description}
                placeholder="Detalle del concepto"
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
          </div>
          <div className="form-end">
            <span className={message.includes("Complete") ? "form-error" : ""}>
              {message || "Registre valores respaldados por comprobantes."}
            </span>
            <div className="finance-form-actions">
              {draft.id && <button className="secondary-button" onClick={() => { setDraft(newRecord()); setShowForm(false); }}>Cancelar</button>}
              <button className="primary-button" onClick={save}>
                {draft.id ? "Guardar cambios" : "Guardar movimiento"}
              </button>
            </div>
          </div>
        </section>
      )}
      {!!message && !showForm && (
        <div className="finance-message">{message}</div>
      )}

      {view === "overview" && (
        <>
          <div className="finance-kpis">
            <article>
              <span>Caja registrada</span>
              <strong>{money(cash)}</strong>
              <small>Saldo inicial + cobros - pagos</small>
            </article>
            <article>
              <span>Por cobrar</span>
              <strong>{money(receivables)}</strong>
              <small>{overdueReceivables.length} vencido(s)</small>
            </article>
            <article>
              <span>Por pagar</span>
              <strong>{money(payables)}</strong>
              <small>{overduePayables.length} vencido(s)</small>
            </article>
            <article className={projectedCash < 0 ? "danger" : ""}>
              <span>Caja a 30 días</span>
              <strong>{money(projectedCash)}</strong>
              <small>Con vencimientos registrados</small>
            </article>
            <article>
              <span>Ventas del mes</span>
              <strong>{money(incomeAccrual)}</strong>
              <small>
                {settings.monthlySalesTarget
                  ? `${((incomeAccrual / settings.monthlySalesTarget) * 100).toFixed(0)} % de meta`
                  : "Sin meta"}
              </small>
            </article>
            <article className={operatingProfit < 0 ? "danger" : ""}>
              <span>Resultado operativo</span>
              <strong>{money(operatingProfit)}</strong>
              <small>Margen {margin.toFixed(1)} %</small>
            </article>
          </div>
          <div className="finance-grid">
            <section className="business-card cash-forecast">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Tesorería</p>
                  <h3>Flujo de caja proyectado</h3>
                </div>
                <span>Próximas 8 semanas</span>
              </div>
              <div className="week-chart">
                {weeklyFlow.map((week) => (
                  <div className="week-column" key={week.label}>
                    <div className="week-bars">
                      <i
                        className="income"
                        style={{
                          height: `${Math.max(3, (week.income / maxWeek) * 100)}%`,
                        }}
                        title={`Entradas ${money(week.income)}`}
                      ></i>
                      <i
                        className="expense"
                        style={{
                          height: `${Math.max(3, (week.expense / maxWeek) * 100)}%`,
                        }}
                        title={`Salidas ${money(week.expense)}`}
                      ></i>
                    </div>
                    <strong>{week.label}</strong>
                    <small>
                      +{money(week.income)}
                      <br />-{money(week.expense)}
                    </small>
                  </div>
                ))}
              </div>
              <div className="chart-legend">
                <span>
                  <i className="income"></i>Entradas previstas
                </span>
                <span>
                  <i className="expense"></i>Salidas previstas
                </span>
              </div>
            </section>
            <section className="business-card finance-alerts">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Control diario</p>
                  <h3>Alertas prioritarias</h3>
                </div>
              </div>
              {projectedCash < 0 && (
                <div className="finance-alert danger">
                  <strong>Riesgo de caja</strong>
                  <span>
                    La proyección a 30 días queda negativa en{" "}
                    {money(Math.abs(projectedCash))}.
                  </span>
                </div>
              )}
              {overdueReceivables.length > 0 && (
                <div className="finance-alert warn">
                  <strong>Cobros vencidos</strong>
                  <span>
                    {overdueReceivables.length} cuenta(s) por{" "}
                    {money(overdueReceivables.reduce((s, r) => s + r.total, 0))}{" "}
                    requieren gestión.
                  </span>
                </div>
              )}
              {overduePayables.length > 0 && (
                <div className="finance-alert warn">
                  <strong>Pagos vencidos</strong>
                  <span>
                    {overduePayables.length} obligación(es) pendientes.
                  </span>
                </div>
              )}
              {!projectedCash &&
                !overdueReceivables.length &&
                !overduePayables.length && (
                  <div className="module-empty">
                    Registre vencimientos para activar alertas y proyecciones.
                  </div>
                )}
              <div className="linked-sources">
                <div>
                  <span>Cirugías por cobrar</span>
                  <strong>{money(linkedPending)}</strong>
                  <small>Fuente: Cirugías y cobros</small>
                </div>
                <button className="sync-button" onClick={importCases}>Importar pendientes</button>
                <div>
                  <span>Pérdidas de inventario</span>
                  <strong>{money(inventoryLoss)}</strong>
                  <small>Fuente: Estadísticas</small>
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {view === "ledger" && (
        <section className="business-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Libro de movimientos</p>
              <h3>Ingresos y egresos</h3>
            </div>
            <span className="movement-count">{enriched.length} registros</span>
          </div>
          <div className="table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Contraparte</th>
                  <th>Documento / categoría</th>
                  <th>Subtotal</th>
                  <th>Total efectivo</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((record) => (
                  <tr key={record.id}>
                    <td>{dateLabel(record.date)}</td>
                    <td>
                      <span className={`finance-type ${record.direction}`}>
                        {record.direction === "income" ? "Ingreso" : "Egreso"}
                      </span>
                    </td>
                    <td>
                      <strong>{record.counterparty}</strong>
                      <small>{record.description || record.costCenter}</small>
                    </td>
                    <td>
                      {record.document || "—"}
                      <small>{record.category}</small>
                    </td>
                    <td>{money(record.subtotal)}</td>
                    <td>{money(record.total)}</td>
                    <td>
                      <button
                        className={`finance-status ${record.overdue ? "overdue" : record.status}`}
                        onClick={() => toggleStatus(record.id)}
                      >
                        {record.overdue
                          ? "Vencido"
                          : record.status === "paid"
                            ? "Pagado"
                            : "Pendiente"}
                      </button>
                    </td>
                    <td><div className="record-actions">
                      <button className="edit-record" onClick={() => edit(record)} aria-label={`Editar movimiento de ${record.counterparty}`}>Editar</button>
                      <button className="delete-record" onClick={() => remove(record.id)} aria-label={`Eliminar movimiento de ${record.counterparty}`}>×</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!enriched.length && (
              <div className="module-empty">
                Aún no hay movimientos financieros registrados.
              </div>
            )}
          </div>
        </section>
      )}

      {view === "receivables" && (
        <div className="finance-grid">
          <section className="business-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Cuentas por cobrar</p>
                <h3>Agenda de cobranza</h3>
              </div>
              <strong>{money(receivables)}</strong>
            </div>
            <div className="account-list">
              {enriched
                .filter(
                  (r) => r.direction === "income" && r.status === "pending",
                )
                .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                .map((r) => (
                  <article className={r.overdue ? "overdue" : ""} key={r.id}>
                    <div>
                      <strong>{r.counterparty}</strong>
                      <span>
                        {r.document || r.category} · {dateLabel(r.dueDate)}
                      </span>
                    </div>
                    <div>
                      <b>{money(r.total)}</b>
                      <button onClick={() => toggleStatus(r.id)}>
                        Marcar cobrado
                      </button>
                    </div>
                  </article>
                ))}
              {!enriched.some(
                (r) => r.direction === "income" && r.status === "pending",
              ) && (
                <div className="module-empty">No hay cobros pendientes.</div>
              )}
            </div>
          </section>
          <section className="business-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Cuentas por pagar</p>
                <h3>Calendario de pagos</h3>
              </div>
              <strong>{money(payables)}</strong>
            </div>
            <div className="account-list">
              {enriched
                .filter(
                  (r) => r.direction === "expense" && r.status === "pending",
                )
                .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                .map((r) => (
                  <article className={r.overdue ? "overdue" : ""} key={r.id}>
                    <div>
                      <strong>{r.counterparty}</strong>
                      <span>
                        {r.document || r.category} · {dateLabel(r.dueDate)}
                      </span>
                    </div>
                    <div>
                      <b>{money(r.total)}</b>
                      <button onClick={() => toggleStatus(r.id)}>
                        Marcar pagado
                      </button>
                    </div>
                  </article>
                ))}
              {!enriched.some(
                (r) => r.direction === "expense" && r.status === "pending",
              ) && <div className="module-empty">No hay pagos pendientes.</div>}
            </div>
          </section>
        </div>
      )}

      {view === "budget" && (
        <>
          <section className="business-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Plan financiero</p>
                <h3>Metas y límites mensuales</h3>
              </div>
            </div>
            <div className="settings-grid">
              <label>
                <span>Saldo inicial de caja</span>
                <input
                  type="number"
                  step=".01"
                  value={settings.openingBalance || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      openingBalance: Number(e.target.value) || 0,
                    })
                  }
                />
              </label>
              <label>
                <span>Meta mensual de ventas</span>
                <input
                  type="number"
                  min="0"
                  step=".01"
                  value={settings.monthlySalesTarget || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      monthlySalesTarget: Math.max(
                        0,
                        Number(e.target.value) || 0,
                      ),
                    })
                  }
                />
              </label>
              <label>
                <span>Presupuesto mensual de gastos</span>
                <input
                  type="number"
                  min="0"
                  step=".01"
                  value={settings.monthlyExpenseBudget || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      monthlyExpenseBudget: Math.max(
                        0,
                        Number(e.target.value) || 0,
                      ),
                    })
                  }
                />
              </label>
            </div>
          </section>
          <div className="finance-grid">
            <section className="business-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Ejecución</p>
                  <h3>Ventas frente a meta</h3>
                </div>
                <strong>
                  {settings.monthlySalesTarget
                    ? `${Math.min(999, (incomeAccrual / settings.monthlySalesTarget) * 100).toFixed(1)} %`
                    : "—"}
                </strong>
              </div>
              <div className="budget-progress">
                <span
                  style={{
                    width: `${settings.monthlySalesTarget ? Math.min(100, (incomeAccrual / settings.monthlySalesTarget) * 100) : 0}%`,
                  }}
                ></span>
              </div>
              <p className="budget-copy">
                {money(incomeAccrual)} de {money(settings.monthlySalesTarget)}
              </p>
            </section>
            <section className="business-card">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Control</p>
                  <h3>Gastos frente a presupuesto</h3>
                </div>
                <strong>
                  {settings.monthlyExpenseBudget
                    ? `${Math.min(999, (expenseAccrual / settings.monthlyExpenseBudget) * 100).toFixed(1)} %`
                    : "—"}
                </strong>
              </div>
              <div
                className={`budget-progress expense ${expenseAccrual > settings.monthlyExpenseBudget ? "over" : ""}`}
              >
                <span
                  style={{
                    width: `${settings.monthlyExpenseBudget ? Math.min(100, (expenseAccrual / settings.monthlyExpenseBudget) * 100) : 0}%`,
                  }}
                ></span>
              </div>
              <p className="budget-copy">
                {money(expenseAccrual)} de{" "}
                {money(settings.monthlyExpenseBudget)}
              </p>
            </section>
          </div>
          <section className="business-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Distribución</p>
                <h3>Gastos por categoría</h3>
              </div>
            </div>
            {categories.length ? (
              <div className="expense-ranking">
                {categories.map((category) => (
                  <div key={category.name}>
                    <div>
                      <strong>{category.name}</strong>
                      <span>{money(category.value)}</span>
                    </div>
                    <i>
                      <span
                        style={{
                          width: `${(category.value / maxCategory) * 100}%`,
                        }}
                      ></span>
                    </i>
                  </div>
                ))}
              </div>
            ) : (
              <div className="module-empty">
                Registre egresos para analizar su distribución.
              </div>
            )}
          </section>
        </>
      )}

      {view === "taxes" && (
        <>
          <div className="tax-notice">
            <strong>Panel de preparación, no declaración automática</strong>
            <span>
              Resume los valores registrados para revisión contable. Las
              tarifas, retenciones y créditos deben validarse contra
              comprobantes y normativa vigente.
            </span>
          </div>
          <div className="finance-kpis tax-kpis">
            <article>
              <span>IVA EN VENTAS</span>
              <strong>{money(ivaSales)}</strong>
              <small>Débito fiscal registrado</small>
            </article>
            <article>
              <span>IVA EN COMPRAS</span>
              <strong>{money(ivaPurchases)}</strong>
              <small>Crédito potencial registrado</small>
            </article>
            <article className={ivaSales - ivaPurchases > 0 ? "warn" : ""}>
              <span>DIFERENCIA REFERENCIAL</span>
              <strong>{money(ivaSales - ivaPurchases)}</strong>
              <small>Antes de ajustes y créditos</small>
            </article>
            <article>
              <span>RETENCIONES RECIBIDAS</span>
              <strong>{money(withheldToUs)}</strong>
              <small>Crédito por verificar</small>
            </article>
            <article>
              <span>RETENCIONES EFECTUADAS</span>
              <strong>{money(withheldByUs)}</strong>
              <small>Obligación por verificar</small>
            </article>
          </div>
          <section className="business-card tax-checklist">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Cierre mensual</p>
                <h3>Lista de control financiero-contable</h3>
              </div>
            </div>
            {[
              "Conciliar saldos con los estados bancarios",
              "Verificar facturas de ventas, compras y notas de crédito",
              "Cruzar IVA y retenciones con los comprobantes electrónicos",
              "Revisar cartera vencida y confirmar provisiones",
              "Validar inventario, costo de ventas, pérdidas y caducidades",
              "Entregar el respaldo al contador para declaraciones y cierre",
            ].map((item, index) => (
              <label key={item}>
                <input type="checkbox" />
                <span>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  {item}
                </span>
              </label>
            ))}
          </section>
        </>
      )}
    </section>
  );
}
