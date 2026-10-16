"use client";

import { useEffect, useState } from "react";
import { activityDateLabel, type ActivityEntry } from "../lib/activity-log";
import { daysUntil } from "../lib/business-alerts";
import { businessIsoDate } from "../lib/date-utils";
import { type StockItem } from "../lib/inventory-data";
import { REGULATORY_SEED, type RegulatoryRecord } from "../lib/regulatory-data";
import { getCloudState } from "../lib/cloud-sync";
import { costAboveMarket, loadPriceData, marketReference } from "../lib/price-intel";
import { getMemorySummary, type MemorySummary } from "../lib/volia-memory";
import { readStoredArray, STORAGE_KEYS } from "../lib/storage";

type CaseSummary = { status: string; amount: number; paidAmount: number; dueDate: string; patient: string };
type FinanceSummary = { status: string; direction: "income" | "expense"; dueDate: string; subtotal: number; iva: number; withholding: number; counterparty: string };
type Task = { tone: "urgent" | "soon" | "info"; title: string; detail: string; target: string; action: string };

const EMPTY: MemorySummary = { quotes: 0, cases: 0, inventory: 0, movements: 0, finance: 0, documents: 0, lastBackup: null };
const money = (value: number) => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value || 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function greeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("es-EC", { hour: "numeric", hourCycle: "h23", timeZone: "America/Guayaquil" }).format(now));
  return hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
}

const ACTIONS = [
  { target: "quote", title: "Nueva cotización", detail: "Pegue el requerimiento del hospital y calcule el margen" },
  { target: "cases", title: "Registrar cirugía", detail: "Documentos, factura y fecha de cobro" },
  { target: "inventory", title: "Mover inventario", detail: "Entradas, salidas, reservas y lotes" },
  { target: "market", title: "Ver el mercado", detail: "Quién gana en SERCOP y a qué precio" },
];

export default function HomeDashboard({ onNavigate }: { onNavigate: (module: string) => void }) {
  const [memory, setMemory] = useState<MemorySummary>(EMPTY);
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [finance, setFinance] = useState<FinanceSummary[]>([]);
  const [inventory, setInventory] = useState<StockItem[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [docs, setDocs] = useState<RegulatoryRecord[]>([]);
  const [catalogCount, setCatalogCount] = useState(0);
  const [hasBackup, setHasBackup] = useState(true);
  const [costAlerts, setCostAlerts] = useState<string[]>([]);
  const [marketDate, setMarketDate] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/data/mercado-sercop-2026.json", { cache: "force-cache" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d?.generatedAt) setMarketDate(String(d.generatedAt)); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    let alive = true;
    loadPriceData().then((data) => {
      if (!alive) return;
      const products = readStoredArray<{ description: string; unitCost: number; active?: boolean }>(STORAGE_KEYS.productCatalog);
      setCostAlerts(products.filter((p) => p.active !== false && costAboveMarket(p.unitCost, marketReference(p.description, data))).map((p) => p.description));
    });
    return () => { alive = false; };
  }, [catalogCount]);
  const [now] = useState(() => new Date());
  const today = businessIsoDate();

  useEffect(() => {
    const load = () => {
      setMemory(getMemorySummary());
      setCases(readStoredArray<CaseSummary>(STORAGE_KEYS.cases));
      setFinance(readStoredArray<FinanceSummary>(STORAGE_KEYS.financeRecords));
      setInventory(readStoredArray<StockItem>(STORAGE_KEYS.inventory));
      setActivity(readStoredArray<ActivityEntry>(STORAGE_KEYS.activityLog));
      const stored = readStoredArray<RegulatoryRecord>(STORAGE_KEYS.regulatoryDocs);
      setDocs(stored.length ? stored : REGULATORY_SEED);
      setCatalogCount(readStoredArray(STORAGE_KEYS.productCatalog).length);
      setHasBackup(getCloudState().revision > 0 || !!getMemorySummary().lastBackup);
    };
    load();
    window.addEventListener("volia-memory-updated", load);
    window.addEventListener("volia-activity-updated", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("volia-memory-updated", load);
      window.removeEventListener("volia-activity-updated", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const pendingCases = cases.filter((item) => item.status !== "paid");
  const pendingValue = pendingCases.reduce((sum, item) => sum + Math.max(0, Number(item.amount || 0) - Number(item.paidAmount || 0)), 0);
  const overdueCases = pendingCases.filter((item) => item.dueDate && item.dueDate < today);
  const overdueFinance = finance.filter((item) => item.status !== "paid" && item.dueDate && item.dueDate < today);
  const lowStock = inventory.filter((item) => Math.max(0, item.stock - item.reserved) <= item.minimum);
  const expiringLots = inventory.filter((item) => item.expiry && daysUntil(item.expiry, today) <= 120);
  const expiredDocs = docs.filter((d) => d.expiresAt && daysUntil(d.expiresAt, today) < 0);
  const soonDocs = docs.filter((d) => d.expiresAt && daysUntil(d.expiresAt, today) >= 0 && daysUntil(d.expiresAt, today) <= 90)
    .sort((a, b) => (a.expiresAt ?? "").localeCompare(b.expiresAt ?? ""));

  const undatedDocs = docs.filter((d) => !d.expiresAt && (d.kind === "Registro sanitario" || d.kind === "Notificación sanitaria"));
  const marketStale = !!marketDate && /^\d{4}-\d{2}-\d{2}$/.test(marketDate) && daysUntil(marketDate, today) < -35;

  const tasks: Task[] = [
    ...(overdueCases.length ? [{ tone: "urgent" as const, title: `${plural(overdueCases.length, "cobro vencido", "cobros vencidos")}`, detail: "Llame o escriba a la entidad y registre el compromiso de pago.", target: "cases", action: "Ver cobros" }] : []),
    ...(expiredDocs.length ? [{ tone: "urgent" as const, title: `${plural(expiredDocs.length, "documento regulatorio vencido", "documentos regulatorios vencidos")}`, detail: "No los presente en una oferta hasta renovarlos.", target: "regulatory", action: "Ver vigencias" }] : []),
    ...(overdueFinance.length ? [{ tone: "urgent" as const, title: `${plural(overdueFinance.length, "pago vencido", "pagos vencidos")} en finanzas`, detail: "Registre el pago o actualice la fecha.", target: "finance", action: "Ver finanzas" }] : []),
    ...(soonDocs.length ? [{ tone: "soon" as const, title: `${soonDocs[0].reference} vence en ${daysUntil(soonDocs[0].expiresAt!, today)} días`, detail: soonDocs.length > 1 ? `Y ${plural(soonDocs.length - 1, "documento más", "documentos más")} en los próximos 90 días.` : soonDocs[0].subject, target: "regulatory", action: "Ver vigencias" }] : []),
    ...(lowStock.length ? [{ tone: "soon" as const, title: `${plural(lowStock.length, "producto con stock bajo", "productos con stock bajo")}`, detail: "Confirme existencias y prepare la reposición.", target: "inventory", action: "Ver inventario" }] : []),
    ...(expiringLots.length ? [{ tone: "soon" as const, title: `${plural(expiringLots.length, "lote por caducar", "lotes por caducar")}`, detail: "Úselos primero o gestione la devolución.", target: "inventory", action: "Ver inventario" }] : []),
    ...(costAlerts.length ? [{ tone: "soon" as const, title: `${plural(costAlerts.length, "producto cuesta", "productos cuestan")} más que el precio de mercado`, detail: `Con ese costo no se puede ganar sin perder dinero. Empiece por: ${costAlerts.slice(0, 2).join("; ")}.`, target: "catalog", action: "Ver catálogo" }] : []),
    ...(undatedDocs.length ? [{ tone: "info" as const, title: `${plural(undatedDocs.length, "registro sanitario sin fecha", "registros sanitarios sin fecha")} de vencimiento`, detail: "Consulte la vigencia en ARCSA y regístrela: sin fecha, el sistema no puede avisar antes de que venzan.", target: "regulatory", action: "Ver vigencias" }] : []),
    ...(marketStale ? [{ tone: "info" as const, title: "Actualizar el mercado SERCOP", detail: `Los datos son del ${marketDate}. Descargue el archivo del mes en data.open-contracting.org y haga doble clic en «actualizar-mercado» en la carpeta de Volia Control.`, target: "market", action: "Ver mercado" }] : []),
    ...(!hasBackup ? [{ tone: "info" as const, title: "Aún no hay una copia de respaldo", detail: "Pulse «Respaldo cifrado» arriba a la derecha y elija una frase. Solo quien la conozca podrá abrir la copia.", target: "help", action: "Más detalles" }] : []),
  ];

  const setup = [
    { done: catalogCount > 0, title: "Cargar el catálogo", detail: "Productos con costo y precio de venta.", target: "catalog" },
    { done: inventory.length > 0, title: "Registrar el inventario", detail: "Stock real, lotes y caducidades.", target: "inventory" },
    { done: memory.quotes > 0, title: "Guardar la primera cotización", detail: "Con el código del proceso para compararla con SERCOP.", target: "quote" },
  ];
  const setupLeft = setup.filter((s) => !s.done).length;
  const dateLabel = new Intl.DateTimeFormat("es-EC", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Guayaquil" }).format(now);

  return (
    <section className="home-dashboard home-v2">
      <header className="home-hello">
        <p className="home-date">{dateLabel}</p>
        <h2>{greeting(now)}.</h2>
        <p className="home-lede">{tasks.some((t) => t.tone !== "info") ? `Hay ${plural(tasks.filter((t) => t.tone !== "info").length, "asunto", "asuntos")} que conviene revisar hoy.` : "No hay vencimientos ni alertas pendientes. Buen momento para avanzar con las cotizaciones."}</p>
      </header>

      <div className="home-columns">
        <section className="home-today" aria-labelledby="home-today-title">
          <h3 id="home-today-title">Para hoy</h3>
          {tasks.length ? (
            <ul className="task-list">
              {tasks.map((task) => (
                <li key={task.title} className={`task ${task.tone}`}>
                  <span className="task-mark" aria-hidden="true" />
                  <div><strong>{task.title}</strong><small>{task.detail}</small></div>
                  <button type="button" className="text-button" onClick={() => onNavigate(task.target)}>{task.action}</button>
                </li>
              ))}
            </ul>
          ) : <p className="task-clear">Todo al día.</p>}

          {setupLeft > 0 && (
            <div className="setup-card">
              <h4>Para dejar Volia Control listo</h4>
              <p>{setupLeft === 1 ? "Falta un paso." : `Faltan ${setupLeft} pasos.`} Cada uno hace más útiles las alertas y la comparación con el mercado.</p>
              <ol>
                {setup.map((s) => (
                  <li key={s.title} className={s.done ? "done" : ""}>
                    <button type="button" onClick={() => onNavigate(s.target)} disabled={s.done}>
                      <span className="setup-check" aria-hidden="true">{s.done ? "✓" : ""}</span>
                      <span><strong>{s.title}</strong><small>{s.done ? "Listo" : s.detail}</small></span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        <aside className="home-side">
          <section aria-labelledby="home-start-title">
            <h3 id="home-start-title">Empezar algo</h3>
            <div className="start-list">
              {ACTIONS.map((a) => (
                <button key={a.target} type="button" onClick={() => onNavigate(a.target)}>
                  <strong>{a.title}</strong><small>{a.detail}</small>
                </button>
              ))}
            </div>
          </section>

          <section className="home-figures" aria-label="Cifras principales">
            <div><span>Por cobrar</span><strong>{money(pendingValue)}</strong><small>{pendingCases.length ? plural(pendingCases.length, "expediente abierto", "expedientes abiertos") : "Sin expedientes abiertos"}</small></div>
            <div><span>Productos en inventario</span><strong>{inventory.length}</strong><small>{lowStock.length ? `${lowStock.length} con stock bajo` : inventory.length ? "Stock en orden" : "Aún sin registrar"}</small></div>
            <div><span>Cotizaciones guardadas</span><strong>{memory.quotes}</strong><small>Compartidas entre sus equipos</small></div>
          </section>
        </aside>
      </div>

      <section className="home-activity" aria-labelledby="home-activity-title">
        <div className="home-activity-head"><h3 id="home-activity-title">Lo último que se hizo</h3><button className="text-button" onClick={() => onNavigate("activity")}>Ver historial</button></div>
        {activity.length ? (
          <ul>{activity.slice(0, 5).map((entry) => <li key={entry.id}><div><strong>{entry.action}</strong><span>{entry.module}: {entry.detail}</span></div><time>{activityDateLabel(entry.timestamp)}</time></li>)}</ul>
        ) : <p className="task-clear">Aquí aparecerán las cotizaciones, movimientos y cambios a medida que se registren.</p>}
      </section>
    </section>
  );
}
