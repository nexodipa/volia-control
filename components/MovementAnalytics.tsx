"use client";

import { useEffect, useMemo, useState } from "react";
import { exportBusinessPdf, exportBusinessWord, type BusinessExport } from "../lib/business-exports";
import { downloadCsv } from "../lib/csv";
import { businessIsoDate } from "../lib/date-utils";
import { DEFAULT_STOCK, INVENTORY_KEY, LEGACY_SAMPLE_STOCK_IDS, MOVEMENTS_KEY, MOVEMENT_LABELS, applyStockMovement, isEntry, isLoss, type MovementType, type StockItem, type StockMovement } from "../lib/inventory-data";
import { readStoredArray, writeStoredJson } from "../lib/storage";
import { recordActivity } from "../lib/activity-log";

const today = businessIsoDate;
const money = (value: number) => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value || 0);
const TYPES = Object.keys(MOVEMENT_LABELS) as MovementType[];

export default function MovementAnalytics() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [period, setPeriod] = useState("all");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState({ itemId: "", type: "sale" as MovementType, quantity: 1, date: today(), unitPrice: 0, note: "" });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stock = readStoredArray<StockItem>(INVENTORY_KEY, DEFAULT_STOCK).filter((item) => !LEGACY_SAMPLE_STOCK_IDS.has(item.id)).map((item) => ({ ...item, stock: Math.max(0, Number(item.stock) || 0), reserved: Math.min(Math.max(0, Number(item.reserved) || 0), Math.max(0, Number(item.stock) || 0)) }));
        writeStoredJson(INVENTORY_KEY, stock);
        const history = readStoredArray<StockMovement>(MOVEMENTS_KEY).filter((movement) => !LEGACY_SAMPLE_STOCK_IDS.has(movement.itemId));
        setItems(stock); setMovements(history); setDraft((current) => ({ ...current, itemId: current.itemId || stock[0]?.id || "" }));
      } catch { setItems([]); setMovements([]); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => {
    if (period === "all") return movements;
    const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0); cutoff.setDate(cutoff.getDate() - Number(period));
    return movements.filter((movement) => new Date(`${movement.date}T00:00:00`) >= cutoff);
  }, [movements, period]);

  const totals = useMemo(() => {
    const entries = filtered.filter((m) => isEntry(m.type)).reduce((sum, m) => sum + m.quantity, 0);
    const exits = filtered.filter((m) => !isEntry(m.type)).reduce((sum, m) => sum + m.quantity, 0);
    const revenue = filtered.filter((m) => m.type === "sale").reduce((sum, m) => sum + m.quantity * m.unitPrice, 0);
    const losses = filtered.filter((m) => isLoss(m.type)).reduce((sum, m) => sum + m.quantity * m.unitCost, 0);
    return { entries, exits, revenue, losses };
  }, [filtered]);

  const ranking = useMemo(() => {
    const grouped = new Map<string, { product: string; quantity: number; value: number }>();
    filtered.filter((m) => m.type === "sale").forEach((m) => { const row = grouped.get(m.itemId) || { product: m.product, quantity: 0, value: 0 }; row.quantity += m.quantity; row.value += m.quantity * m.unitPrice; grouped.set(m.itemId, row); });
    return [...grouped.values()].sort((a, b) => b.quantity - a.quantity);
  }, [filtered]);

  const lossRanking = useMemo(() => {
    const grouped = new Map<string, { product: string; quantity: number; value: number }>();
    filtered.filter((m) => isLoss(m.type)).forEach((m) => { const row = grouped.get(m.itemId) || { product: m.product, quantity: 0, value: 0 }; row.quantity += m.quantity; row.value += m.quantity * m.unitCost; grouped.set(m.itemId, row); });
    return [...grouped.values()].sort((a, b) => b.value - a.value);
  }, [filtered]);

  const register = () => {
    setMessage("");
    const item = items.find((entry) => entry.id === draft.itemId);
    const quantity = Math.max(1, Math.floor(Number(draft.quantity) || 0));
    if (!item) return setMessage("Primero registre un producto en Inventario.");
    if (draft.type === "sale" && !(Number(draft.unitPrice) > 0)) return setMessage("Ingrese un precio unitario mayor a cero para registrar la venta.");
    const stockResult = applyStockMovement(item, draft.type, quantity);
    if (stockResult.error) return setMessage(stockResult.error);
    const movement: StockMovement = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, date: draft.date || today(), type: draft.type, itemId: item.id, code: item.code, product: item.product, quantity, unitCost: item.unitCost, unitPrice: draft.type === "sale" ? Number(draft.unitPrice) || 0 : 0, note: draft.note.trim() };
    const nextItems = items.map((entry) => entry.id === item.id ? stockResult.next : entry);
    const nextMovements = [movement, ...movements];
    setItems(nextItems); setMovements(nextMovements);
    writeStoredJson(INVENTORY_KEY, nextItems); writeStoredJson(MOVEMENTS_KEY, nextMovements);
    recordActivity("Estadísticas", "Movimiento registrado", `${MOVEMENT_LABELS[movement.type]} · ${movement.product} · ${movement.quantity} unidad(es)`);
    setDraft((current) => ({ ...current, quantity: 1, unitPrice: 0, note: "" })); setMessage("Movimiento registrado y existencias actualizadas.");
  };

  const exportCsv = () => {
    const rows = [["Fecha", "Movimiento", "Código", "Producto", "Cantidad", "Costo unitario", "Precio venta", "Nota"], ...filtered.map((m) => [m.date, MOVEMENT_LABELS[m.type], m.code, m.product, m.quantity, m.unitCost, m.unitPrice, m.note])];
    downloadCsv(rows, `movimientos-volia-${today()}.csv`);
    recordActivity("Estadísticas", "Movimientos exportados en CSV", `${filtered.length} movimientos exportados`, "export");
  };

  const exportPayload = (): BusinessExport => ({ title: "Movimientos y estadísticas", subtitle: `Reporte al ${new Date().toLocaleDateString("es-EC")}`, metadata: [["Entradas", totals.entries], ["Salidas", totals.exits], ["Ingresos por ventas", money(totals.revenue)], ["Pérdidas y caducidades", money(totals.losses)], ["Producto más vendido", ranking[0]?.product || "Sin ventas registradas"]], tables: [{ title: "Historial de movimientos", headers: ["Fecha", "Tipo", "Producto", "Cantidad", "Valor"], rows: filtered.map((m) => [m.date, MOVEMENT_LABELS[m.type], m.product, m.quantity, m.type === "sale" ? money(m.quantity * m.unitPrice) : isLoss(m.type) ? money(m.quantity * m.unitCost) : "—"]) }], disclaimer: "Reporte estadístico de VOLIA S.A.S. basado en movimientos registrados en este dispositivo." });
  const maxSold = Math.max(1, ...ranking.map((row) => row.quantity));

  const exportPdf = () => {
    exportBusinessPdf(exportPayload(), "estadisticas-volia");
    recordActivity("Estadísticas", "Estadísticas exportadas en PDF", `${filtered.length} movimientos`, "export");
  };

  const exportWord = () => {
    exportBusinessWord(exportPayload(), "estadisticas-volia");
    recordActivity("Estadísticas", "Estadísticas exportadas en Word", `${filtered.length} movimientos`, "export");
  };

  return <section className="business-module analytics-module">
    <div className="module-hero"><div><p className="eyebrow">Análisis operativo</p><h2>Movimientos y estadísticas</h2><p>Registra cada entrada y salida para saber qué se vende más, cuánto ingresa y qué se pierde por daño o caducidad.</p></div><div className="hero-actions export-actions"><button className="secondary-button" onClick={exportPdf}>PDF</button><button className="secondary-button" onClick={exportWord}>Word</button><button className="secondary-button" onClick={exportCsv}>Excel/CSV</button></div></div>
    <div className="business-kpis"><article><span>Entradas</span><strong>{totals.entries}</strong><small>Unidades recibidas</small></article><article><span>Salidas</span><strong>{totals.exits}</strong><small>Ventas, cirugía y bajas</small></article><article><span>Ingresos por ventas</span><strong>{money(totals.revenue)}</strong><small>Según precio registrado</small></article><article className={totals.losses ? "danger" : ""}><span>Pérdidas</span><strong>{money(totals.losses)}</strong><small>Daños y caducidades al costo</small></article></div>
    <section className="business-card"><div className="section-heading"><div><p className="eyebrow">Nuevo movimiento</p><h3>Entrada, venta, uso o pérdida</h3></div></div><div className="movement-form"><label><span>Producto</span><select value={draft.itemId} onChange={(e) => setDraft({ ...draft, itemId: e.target.value })}><option value="">Seleccione un producto</option>{items.map((item) => <option key={item.id} value={item.id}>{item.product} · físico {item.stock} · disponible {Math.max(0, item.stock - item.reserved)}</option>)}</select></label><label><span>Tipo</span><select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as MovementType })}>{TYPES.map((type) => <option key={type} value={type}>{MOVEMENT_LABELS[type]}</option>)}</select></label><label><span>Cantidad</span><input type="number" min="1" step="1" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: Number(e.target.value) })} /></label><label><span>Fecha</span><input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label><label><span>Precio unitario de venta</span><input type="number" min="0.01" step=".01" required={draft.type === "sale"} disabled={draft.type !== "sale"} value={draft.unitPrice || ""} placeholder={draft.type === "sale" ? "Obligatorio" : "Solo para ventas"} onChange={(e) => setDraft({ ...draft, unitPrice: Number(e.target.value) })} /></label><label className="movement-note"><span>Nota / referencia</span><input value={draft.note} placeholder="Factura, cirugía o motivo de la baja" onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label></div><div className="form-end"><span className={message.startsWith("No") || message.startsWith("Primero") || message.startsWith("Ingrese") ? "form-error" : "form-success"}>{message || "El movimiento actualizará automáticamente el stock físico y las reservas."}</span><button className="primary-button" onClick={register}>Registrar movimiento</button></div></section>
    <div className="analytics-grid"><section className="business-card"><div className="section-heading"><div><p className="eyebrow">Ranking</p><h3>Productos más vendidos</h3></div><select className="period-select" value={period} onChange={(e) => setPeriod(e.target.value)}><option value="all">Todo el historial</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option></select></div>{ranking.length ? <div className="ranking-list">{ranking.slice(0, 6).map((row, index) => <div className="ranking-row" key={row.product}><span className="ranking-position">{index + 1}</span><div><strong>{row.product}</strong><div className="ranking-bar"><span style={{ width: `${row.quantity / maxSold * 100}%` }}></span></div><small>{row.quantity} unidades · {money(row.value)}</small></div></div>)}</div> : <div className="module-empty">Aún no hay ventas registradas para este periodo.</div>}</section><section className="business-card"><div className="section-heading"><div><p className="eyebrow">Control de bajas</p><h3>Pérdidas y caducidades</h3></div></div>{lossRanking.length ? <div className="loss-list">{lossRanking.slice(0, 6).map((row) => <div key={row.product}><div><strong>{row.product}</strong><span>{row.quantity} unidades</span></div><b>{money(row.value)}</b></div>)}</div> : <div className="module-empty">Sin pérdidas ni caducidades registradas.</div>}</section></div>
    <section className="business-card"><div className="section-heading"><div><p className="eyebrow">Historial</p><h3>Últimos movimientos</h3></div><span className="movement-count">{filtered.length} registros</span></div><div className="table-wrap"><table className="movement-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Cant.</th><th>Valor</th><th>Nota</th></tr></thead><tbody>{filtered.slice(0, 20).map((m) => <tr key={m.id}><td>{m.date}</td><td><span className={`movement-badge ${isLoss(m.type) ? "loss" : isEntry(m.type) ? "entry" : "exit"}`}>{MOVEMENT_LABELS[m.type]}</span></td><td>{m.product}</td><td>{isEntry(m.type) ? "+" : "−"}{m.quantity}</td><td>{m.type === "sale" ? money(m.quantity * m.unitPrice) : isLoss(m.type) ? money(m.quantity * m.unitCost) : "—"}</td><td>{m.note || "—"}</td></tr>)}</tbody></table>{!filtered.length && <div className="module-empty">Registre el primer movimiento para comenzar el análisis.</div>}</div></section>
  </section>;
}
