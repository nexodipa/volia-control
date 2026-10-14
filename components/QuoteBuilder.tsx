"use client";
/* eslint-disable @next/next/no-img-element */

import MarketHint from "./MarketHint";
import RequirementImporter, { type ImportedLine } from "./RequirementImporter";
import { findRegulatoryDoc, type LineRegulatoryStatus } from "../lib/regulatory-check";
import { REGULATORY_SEED, type RegulatoryRecord } from "../lib/regulatory-data";
import { useEffect, useMemo, useState } from "react";
import { exportBusinessWord, type BusinessExport } from "../lib/business-exports";
import { downloadCsv } from "../lib/csv";
import { businessIsoDate } from "../lib/date-utils";
import { exportQuotePdf } from "../lib/quote-pdf";
import { readStoredArray, STORAGE_KEYS, writeStoredJson } from "../lib/storage";
import {
  getSavedQuotes,
  removeQuoteFromMemory,
  saveQuoteToMemory,
  type StoredQuote,
} from "../lib/volia-memory";
import { VOLIA_LOGO_DATA_URL } from "../lib/volia-logo";
import { getCatalog, type CatalogProduct } from "../lib/product-catalog";
import { recordActivity } from "../lib/activity-log";
import {
  VOLIA_SYSTEM_PRODUCTS,
  VOLIA_SYSTEMS,
  type VoliaSystemProduct,
  type VoliaSystemTemplate,
} from "../lib/volia-system-catalog";
import { getInsightsForEntity, learnFromQuote } from "../lib/knowledge-memory";

type QuoteItem = {
  id: string;
  code: string;
  description: string;
  brand: string;
  origin: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
};

type QuoteMeta = {
  number: string;
  date: string;
  validity: number;
  customer: string;
  taxId: string;
  hospital: string;
  contact: string;
  contract: string;
  patient: string;
  hcl: string;
  patientAddress: string;
  surgeryDate: string;
  doctor: string;
  delivery: string;
  payment: string;
  warranty: string;
  notes: string;
  overhead: number;
  minimumMargin: number;
  applyVat: boolean;
  discountType: "percent" | "amount";
  discountValue: number;
};

const today = businessIsoDate;
const quoteNumber = (sequence = 1, date = today()) => `VOL-${date.replaceAll("-", "")}-${String(sequence).padStart(3, "0")}`;
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const money = (value: number) => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Number.isFinite(value) ? value : 0);
const decimal = (value: string) => Math.max(0, Number(value) || 0);
const normalizeSearch = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const matchesSearch = (value: string, query: string) => query.split(" ").filter(Boolean).every((term) => normalizeSearch(value).includes(term));

const INITIAL_META: QuoteMeta = {
  number: quoteNumber(), date: today(), validity: 15, customer: "", taxId: "", hospital: "", contact: "", contract: "",
  patient: "", hcl: "", patientAddress: "", surgeryDate: "", doctor: "",
  delivery: "Inmediata", payment: "Contado",
  warranty: "Garantía técnica conforme a las especificaciones del fabricante.", notes: "",
  overhead: 0, minimumMargin: 25, applyVat: true, discountType: "percent", discountValue: 0,
};

const INITIAL_ITEMS: QuoteItem[] = [{ id: "initial", code: "3433461002033", description: "PLACA LCP ANATÓMICA", brand: "", origin: "", quantity: 1, unitCost: 0, unitPrice: 441.17 }];

const COMPANY = { ruc: "1793206800001", address: "General Ulpiano Páez E2-20 y Alonso de Mercadillo, Edificio María Teresa, Local No. 2", phone: "0983323436", email: "voliasas@hotmail.com" };

function SmallIcon({ name }: { name: "plus" | "trash" | "print" | "download" | "calculator" | "check" | "warning" }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14"/>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></>,
    print: <><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/></>,
    calculator: <><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    warning: <><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L14.7 2.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></>,
  };
  return <svg className="quote-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function QuoteBuilder() {
  const [meta, setMeta] = useState<QuoteMeta>(INITIAL_META);
  const [items, setItems] = useState<QuoteItem[]>(INITIAL_ITEMS);
  const [restored, setRestored] = useState(false);
  const [memoryMessage, setMemoryMessage] = useState("");
  const [savedQuotes, setSavedQuotes] = useState<StoredQuote[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [systemSearch, setSystemSearch] = useState("");
  const [selectedSystem, setSelectedSystem] = useState<VoliaSystemTemplate | null>(null);
  const [systemQuantities, setSystemQuantities] = useState<number[]>([]);
  const [systemMessage, setSystemMessage] = useState("");

  const normalizedSystemSearch = normalizeSearch(systemSearch);
  const systemMatches = useMemo(() => {
    if (normalizedSystemSearch.length < 2) return [];
    return VOLIA_SYSTEMS
      .filter((system) => matchesSearch([
        system.name,
        system.category,
        system.sourceSheet,
        ...system.items.flatMap((item) => [item.code, item.description]),
      ].join(" "), normalizedSystemSearch))
      .sort((a, b) => {
        const aStarts = normalizeSearch(a.name).startsWith(normalizedSystemSearch) ? 0 : 1;
        const bStarts = normalizeSearch(b.name).startsWith(normalizedSystemSearch) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name, "es");
      })
      .slice(0, 8);
  }, [normalizedSystemSearch]);

  const productMatches = useMemo(() => {
    if (normalizedSystemSearch.length < 2) return [];
    return VOLIA_SYSTEM_PRODUCTS
      .filter((product) => matchesSearch(`${product.code} ${product.description}`, normalizedSystemSearch))
      .sort((a, b) => {
        const aExact = normalizeSearch(a.code) === normalizedSystemSearch ? 0 : 1;
        const bExact = normalizeSearch(b.code) === normalizedSystemSearch ? 0 : 1;
        return aExact - bExact || a.description.localeCompare(b.description, "es");
      })
      .slice(0, 8);
  }, [normalizedSystemSearch]);

  const selectedSystemTotal = useMemo(() => selectedSystem?.items.reduce(
    (sum, item, index) => sum + item.unitPrice * (systemQuantities[index] || 0),
    0,
  ) || 0, [selectedSystem, systemQuantities]);

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.quoteDraft);
        if (saved) {
          const parsed = JSON.parse(saved) as { meta?: QuoteMeta; items?: QuoteItem[] };
          if (parsed.meta) setMeta({ ...INITIAL_META, ...parsed.meta });
          if (parsed.items?.length) setItems(parsed.items.map((item) => ({ ...item, brand: item.brand ?? "", origin: item.origin ?? "" })));
        } else setMeta((current) => ({ ...current, date: today(), number: nextQuoteNumber() }));
      } catch { /* El borrador local es auxiliar; un valor dañado se ignora. */ }
      setSavedQuotes(getSavedQuotes());
      setCatalog(getCatalog());
      setRestored(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  // El historial también llega desde otros equipos por la base compartida.
  useEffect(() => {
    const refresh = () => setSavedQuotes(getSavedQuotes());
    window.addEventListener("volia-memory-updated", refresh);
    return () => window.removeEventListener("volia-memory-updated", refresh);
  }, []);

  useEffect(() => {
    const refresh = () => setCatalog(getCatalog());
    window.addEventListener("volia-catalog-updated", refresh);
    return () => window.removeEventListener("volia-catalog-updated", refresh);
  }, []);

  useEffect(() => {
    if (!restored) return;
    try { writeStoredJson(STORAGE_KEYS.quoteDraft, { meta, items }); }
    catch { /* El cotizador continúa aunque el navegador bloquee el almacenamiento local. */ }
  }, [meta, items, restored]);

  const totals = useMemo(() => {
    const grossSubtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const requestedDiscount = meta.discountType === "percent"
      ? grossSubtotal * Math.min(100, meta.discountValue) / 100
      : meta.discountValue;
    const discount = Math.min(grossSubtotal, requestedDiscount);
    const netSubtotal = Math.max(0, grossSubtotal - discount);
    const baseCost = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    const totalCost = baseCost * (1 + meta.overhead / 100);
    const profit = netSubtotal - totalCost;
    const margin = netSubtotal > 0 ? profit / netSubtotal * 100 : 0;
    const markup = totalCost > 0 ? profit / totalCost * 100 : 0;
    const iva = meta.applyVat ? netSubtotal * .15 : 0;
    const total = netSubtotal + iva;
    const recommendedSubtotal = totalCost > 0 && meta.minimumMargin < 100 ? totalCost / (1 - meta.minimumMargin / 100) : 0;
    const missingCosts = items.filter((item) => item.unitCost <= 0).length;
    return { grossSubtotal, discount, netSubtotal, baseCost, totalCost, profit, margin, markup, iva, total, recommendedSubtotal, missingCosts };
  }, [items, meta.overhead, meta.minimumMargin, meta.applyVat, meta.discountType, meta.discountValue]);

  const [regulatoryDocs, setRegulatoryDocs] = useState<RegulatoryRecord[]>(REGULATORY_SEED);
  useEffect(() => {
    const timer = window.setTimeout(() => { const stored = readStoredArray<RegulatoryRecord>(STORAGE_KEYS.regulatoryDocs); if (stored.length) setRegulatoryDocs(stored); }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const regulatoryByLine = useMemo(() => {
    const todayIso = today();
    return new Map<string, LineRegulatoryStatus | null>(items.map((item) => [item.id, item.description.trim() ? findRegulatoryDoc(item.description, regulatoryDocs, todayIso) : null]));
  }, [items, regulatoryDocs]);
  const regulatorySummary = useMemo(() => {
    const described = items.filter((item) => item.description.trim());
    const statuses = described.map((item) => regulatoryByLine.get(item.id) ?? null);
    return {
      expired: statuses.filter((s) => s?.status === "vencido").length,
      soon: statuses.filter((s) => s?.status === "critico" || s?.status === "proximo").length,
      undated: statuses.filter((s) => s?.status === "sin-fecha").length,
      missing: statuses.filter((s) => !s).length,
      total: described.length,
    };
  }, [items, regulatoryByLine]);
  const risk = totals.missingCosts ? "incomplete" : totals.profit < 0 ? "danger" : totals.margin < meta.minimumMargin ? "warning" : "healthy";
  const setField = <K extends keyof QuoteMeta>(field: K, value: QuoteMeta[K]) => setMeta((current) => ({ ...current, [field]: value }));
  const updateItem = (id: string, patch: Partial<QuoteItem>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));

  const selectProduct = (id: string, code: string) => {
    const product = catalog.find((entry) => entry.code === code);
    if (product) updateItem(id, { code: product.code, description: product.description, brand: product.brand, origin: product.origin, unitCost: product.unitCost, unitPrice: product.salePrice });
    else updateItem(id, { code: "", description: "", unitPrice: 0 });
  };

  const quoteHasOnlyUntouchedExample = (current: QuoteItem[]) => current.length === 1
    && current[0].id === INITIAL_ITEMS[0].id
    && current[0].code === INITIAL_ITEMS[0].code
    && current[0].description === INITIAL_ITEMS[0].description
    && current[0].quantity === INITIAL_ITEMS[0].quantity
    && current[0].unitCost === INITIAL_ITEMS[0].unitCost
    && current[0].unitPrice === INITIAL_ITEMS[0].unitPrice;

  const appendSuggestedItems = (additions: QuoteItem[]) => {
    setItems((current) => [
      ...(quoteHasOnlyUntouchedExample(current) ? [] : current),
      ...additions,
    ]);
  };

  const chooseSystem = (system: VoliaSystemTemplate) => {
    setSelectedSystem(system);
    setSystemQuantities(system.items.map((item) => item.suggestedQuantity));
    setSystemMessage("");
  };

  const addSelectedSystem = () => {
    if (!selectedSystem) return;
    const additions = selectedSystem.items.flatMap((item, index) => {
      const quantity = Math.max(0, Math.floor(systemQuantities[index] || 0));
      if (!quantity) return [];
      return [{
        id: uid(),
        code: item.code,
        description: item.description,
        brand: "",
        origin: "",
        quantity,
        unitCost: 0,
        unitPrice: item.unitPrice,
      }];
    });
    if (!additions.length) {
      setSystemMessage("Ingrese al menos una cantidad mayor que cero.");
      return;
    }
    appendSuggestedItems(additions);
    setSystemMessage(`${selectedSystem.name}: ${additions.length} componente(s) agregados.`);
    recordActivity("Cotizador", "Sistema agregado desde Excel", `${selectedSystem.name} · ${additions.length} componentes`, "create");
  };

  const addSuggestedProduct = (product: VoliaSystemProduct) => {
    appendSuggestedItems([{
      id: uid(),
      code: product.code,
      description: product.description,
      brand: "",
      origin: "",
      quantity: 1,
      unitCost: 0,
      unitPrice: product.unitPrice,
    }]);
    setSystemMessage(`${product.code} agregado a la cotización.`);
    recordActivity("Cotizador", "Producto agregado desde Excel", `${product.code} · ${product.description}`, "create");
  };

  const addItem = () => setItems((current) => [...current, { id: uid(), code: "", description: "", brand: "", origin: "", quantity: 1, unitCost: 0, unitPrice: 0 }]);
  const addRequirementLines = (lines: ImportedLine[]) => setItems((current) => {
    const mapped: QuoteItem[] = lines.map((line) => line.product
      ? { id: uid(), code: line.product.code, description: line.product.description, brand: line.product.brand, origin: line.product.origin, quantity: line.quantity, unitCost: line.product.unitCost, unitPrice: line.product.salePrice }
      : { id: uid(), code: "", description: line.text, brand: "", origin: "", quantity: line.quantity, unitCost: 0, unitPrice: 0 });
    const onlyPlaceholder = current.length === 1 && current[0].id === "initial";
    return onlyPlaceholder ? mapped : [...current, ...mapped];
  });
  const removeItem = (id: string) => setItems((current) => current.length === 1 ? current : current.filter((item) => item.id !== id));

  const resetDraft = () => {
    if (!window.confirm("¿Desea borrar el borrador actual y comenzar una cotización nueva?")) return;
    const next = { ...INITIAL_META, number: nextQuoteNumber(), date: today() };
    setMeta(next); setItems(INITIAL_ITEMS.map((item) => ({ ...item })));
    localStorage.removeItem(STORAGE_KEYS.quoteDraft);
    recordActivity("Cotizador", "Nueva oferta iniciada", "Borrador de cotización reiniciado", "create");
  };

  const exportCsv = () => {
    const rows = [
      ["Oferta comercial", meta.number], ["Cliente", meta.customer], ["Paciente", meta.patient], ["HC", meta.hcl], ["Dirección / hospital", meta.patientAddress || meta.hospital], ["Fecha de cirugía", meta.surgeryDate], ["Médico", meta.doctor], [],
      ["Código IESS", "Producto", "Marca", "Procedencia", "Cantidad", "Costo unitario", "Precio unitario", "Venta", "Costo total", "Utilidad"],
      ...items.map((item) => [item.code, item.description, item.brand, item.origin, item.quantity, item.unitCost, item.unitPrice, item.quantity * item.unitPrice, item.quantity * item.unitCost * (1 + meta.overhead / 100), item.quantity * (item.unitPrice - item.unitCost * (1 + meta.overhead / 100))]),
      [], ["Subtotal bruto", totals.grossSubtotal], ["Descuento", totals.discount], ["Venta neta sin IVA", totals.netSubtotal], ["Costo real", totals.totalCost], ["Utilidad", totals.profit], ["Margen %", totals.margin], ["Aplica IVA 15 %", meta.applyVat ? "Sí" : "No"], ["IVA", totals.iva], ["Total", totals.total],
    ];
    downloadCsv(rows, `${meta.number || "cotizacion-volia"}.csv`);
    recordActivity("Cotizador", "Oferta exportada en CSV", `${meta.number || "Sin número"} · ${meta.customer || "Cliente por definir"} · ${items.length} productos`, "export");
  };

  const sharedBrand = new Set(items.map((item) => item.brand.trim()).filter(Boolean));
  const sharedOrigin = new Set(items.map((item) => item.origin.trim()).filter(Boolean));
  const brandSummary = sharedBrand.size === 1 ? [...sharedBrand][0] : sharedBrand.size > 1 ? "Ver detalle por producto" : "No registrada";
  const originSummary = sharedOrigin.size === 1 ? [...sharedOrigin][0] : sharedOrigin.size > 1 ? "Ver detalle por producto" : "No registrada";

  function nextQuoteNumber() {
    const date = today();
    const prefix = `VOL-${date.replaceAll("-", "")}-`;
    const highest = getSavedQuotes().reduce((max, saved) => {
      if (!saved.number.startsWith(prefix)) return max;
      const sequence = Number(saved.number.slice(prefix.length));
      return Number.isInteger(sequence) ? Math.max(max, sequence) : max;
    }, 0);
    return quoteNumber(highest + 1, date);
  }

  const exportPayload = (): BusinessExport => ({
    title: "OFERTA COMERCIAL",
    subtitle: meta.customer || "Cliente por definir",
    reference: `${meta.number || "SIN NÚMERO"} · ${meta.date}`,
    metadata: [["RUC VOLIA S.A.S.", COMPANY.ruc], ["Cliente / entidad", meta.customer], ["RUC / identificación", meta.taxId], ["Paciente", meta.patient], ["HC", meta.hcl], ["Dirección / hospital", meta.patientAddress || meta.hospital], ["Fecha de cirugía", meta.surgeryDate], ["Médico", meta.doctor], ["Contacto", meta.contact], ["Contrato / proceso", meta.contract], ["Validez", `${meta.validity} días`]],
    tables: [{ title: "Productos", headers: ["Código", "Descripción", "Marca", "Procedencia", "Cantidad", "Precio unitario", "Total"], rows: items.map((item) => [item.code, item.description, item.brand, item.origin, item.quantity, money(item.unitPrice), money(item.quantity * item.unitPrice)]) }],
    summary: [["Subtotal", money(totals.grossSubtotal)], ["Descuento", `- ${money(totals.discount)}`], ["Base imponible", money(totals.netSubtotal)], [`IVA 15 % (${meta.applyVat ? "Sí" : "No"})`, money(totals.iva)], ["TOTAL", money(totals.total)]],
    afterword: [`Marca: ${brandSummary}`, `Procedencia: ${originSummary}`, `Tiempo de entrega: ${meta.delivery}`, `Forma de pago: ${meta.payment}`, `Garantía: ${meta.warranty}`, ...(meta.notes ? [`Nota: ${meta.notes}`] : []), `VOLIA S.A.S. · RUC ${COMPANY.ruc} · ${COMPANY.address} · Telf. ${COMPANY.phone} · ${COMPANY.email}`],
    disclaimer: "Oferta comercial de VOLIA S.A.S. Los costos internos y la rentabilidad no se incluyen en este documento.",
  });

  const archiveQuote = () => {
    saveQuoteToMemory({
      number: meta.number,
      date: meta.date,
      customer: meta.customer,
      total: totals.total,
      savedAt: new Date().toISOString(),
      data: { meta, items, totals },
    });
    learnFromQuote(meta, items, totals);
    recordActivity("Cotizador", "Oferta guardada", `${meta.number || "Sin número"} · ${meta.customer || "Cliente por definir"} · ${money(totals.total)}`, "create");
    setSavedQuotes(getSavedQuotes());
    setMemoryMessage("Oferta guardada y aprendizaje registrado en memoria");
    window.setTimeout(() => setMemoryMessage(""), 2200);
  };

  const entityInsights = useMemo(() => {
    const target = meta.customer || meta.hospital;
    return target ? getInsightsForEntity(target) : [];
  }, [meta.customer, meta.hospital]);

  const quotePdfPayload = () => ({
    ...meta,
    brandSummary,
    originSummary,
    items,
    totals,
    company: COMPANY,
  });

  const downloadPdf = async () => {
    archiveQuote();
    await exportQuotePdf(quotePdfPayload(), meta.number || "cotizacion-volia");
    recordActivity("Cotizador", "Oferta exportada en PDF", `${meta.number || "Sin número"} · ${meta.customer || "Cliente por definir"} · ${money(totals.total)}`, "export");
  };

  const downloadWord = async () => {
    archiveQuote();
    await exportBusinessWord(exportPayload(), meta.number || "cotizacion-volia");
    recordActivity("Cotizador", "Oferta exportada en Word", `${meta.number || "Sin número"} · ${meta.customer || "Cliente por definir"} · ${money(totals.total)}`, "export");
  };

  const restoreQuote = (saved: StoredQuote) => {
    const snapshot = saved.data as { meta?: QuoteMeta; items?: QuoteItem[] };
    if (!snapshot.meta || !snapshot.items?.length) return;
    setMeta({ ...INITIAL_META, ...snapshot.meta });
    setItems(snapshot.items.map((item) => ({ ...item, brand: item.brand ?? "", origin: item.origin ?? "" })));
    setMemoryMessage(`Oferta ${saved.number || "sin número"} abierta`);
    recordActivity("Cotizador", "Oferta restaurada", `${saved.number || "Sin número"} · ${saved.customer || "Cliente"}`, "update");
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => setMemoryMessage(""), 2200);
  };

  const deleteSavedQuote = (saved: StoredQuote) => {
    if (!window.confirm(`¿Eliminar de la memoria la oferta ${saved.number || "sin número"}?`)) return;
    setSavedQuotes(removeQuoteFromMemory(saved.savedAt));
    recordActivity("Cotizador", "Oferta eliminada", `${saved.number || "Sin número"} · ${saved.customer || "Cliente"}`, "delete");
  };

  const goToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="quote-module">
      <div className="quote-hero">
        <div><p className="eyebrow">MÓDULO COMERCIAL</p><h2>Cotizador y calculador de rentabilidad</h2><p>Construye la oferta, verifica el margen antes de enviarla y genera una versión limpia para el cliente.</p></div>
        <div className="draft-state"><span></span>BORRADOR LOCAL AUTOGUARDADO</div>
      </div>

      <nav className="quote-workflow" aria-label="Pasos de la cotización">
        <button type="button" onClick={() => goToSection("quote-products")}><b>1</b><span><strong>Buscar productos</strong><small>Por sistema, código o nombre</small></span></button>
        <button type="button" onClick={() => goToSection("quote-customer")}><b>2</b><span><strong>Datos del cliente</strong><small>Paciente, hospital y proceso</small></span></button>
        <button type="button" onClick={() => goToSection("quote-terms")}><b>3</b><span><strong>Revisar y generar</strong><small>Margen, condiciones y PDF</small></span></button>
      </nav>

      {savedQuotes.length > 0 && <details className="quote-memory"><summary><span>MEMORIA VOLIA</span><strong>{savedQuotes.length} oferta{savedQuotes.length === 1 ? "" : "s"} guardada{savedQuotes.length === 1 ? "" : "s"}</strong></summary><div className="quote-memory-list">{savedQuotes.slice(0, 8).map((saved) => <article key={saved.savedAt}><div><strong>{saved.number || "Oferta sin número"}</strong><span>{saved.customer || "Cliente por definir"} · {saved.date || "Sin fecha"}</span></div><b>{money(saved.total)}</b><button onClick={() => restoreQuote(saved)}>Abrir</button><button className="memory-delete" onClick={() => deleteSavedQuote(saved)}>Eliminar</button></article>)}</div></details>}

      <div className="quote-layout">
        <div className="quote-main">
          <section className="quote-card" id="quote-customer">
            <div className="quote-card-title"><div><span>01</span><div><p className="eyebrow">ENCABEZADO</p><h3>Datos de la oferta comercial</h3></div></div><button className="quote-link" onClick={resetDraft}>Nueva oferta</button></div>
            <div className="quote-form-grid">
              <label><span>N.º de oferta</span><input value={meta.number} onChange={(event) => setField("number", event.target.value)} /></label>
              <label><span>Fecha</span><input type="date" value={meta.date} onChange={(event) => setField("date", event.target.value)} /></label>
              <label><span>Cliente / entidad</span><input placeholder="Nombre de la institución o cliente" value={meta.customer} onChange={(event) => setField("customer", event.target.value)} /></label>
              <label><span>RUC / identificación</span><input placeholder="Opcional" value={meta.taxId} onChange={(event) => setField("taxId", event.target.value)} /></label>
              <label><span>Hospital / dependencia</span><input placeholder="Unidad o área solicitante" value={meta.hospital} onChange={(event) => setField("hospital", event.target.value)} /></label>
              <label><span>Contacto</span><input placeholder="Nombre del responsable" value={meta.contact} onChange={(event) => setField("contact", event.target.value)} /></label>
              <label><span>Contrato / proceso</span><input placeholder="Ej. SIE-MDMQ-2026-2503 (enlaza con Mercado)" value={meta.contract} onChange={(event) => setField("contract", event.target.value)} /></label>
              <label><span>Validez (días)</span><input type="number" min="1" value={meta.validity} onChange={(event) => setField("validity", decimal(event.target.value))} /></label>
              <label><span>Paciente</span><input placeholder="Nombre completo" value={meta.patient} onChange={(event) => setField("patient", event.target.value)} /></label>
              <label><span>Historia clínica (HC)</span><input placeholder="Número de historia clínica" value={meta.hcl} onChange={(event) => setField("hcl", event.target.value)} /></label>
              <label><span>Dirección / hospital</span><input placeholder="Hospital, sede o dirección" value={meta.patientAddress} onChange={(event) => setField("patientAddress", event.target.value)} /></label>
              <label><span>Fecha de cirugía</span><input type="date" value={meta.surgeryDate} onChange={(event) => setField("surgeryDate", event.target.value)} /></label>
              <label className="wide-field"><span>Médico</span><input placeholder="Nombre del médico" value={meta.doctor} onChange={(event) => setField("doctor", event.target.value)} /></label>
            </div>
            {entityInsights.length > 0 && (
              <div className="memory-insight-box" style={{ marginTop: "14px" }}>
                <div className="insight-header">
                  <strong>Antecedente y aprendizaje en memoria:</strong>
                  <span>{entityInsights.length} regla(s) identificada(s)</span>
                </div>
                {entityInsights.slice(0, 2).map((ins) => (
                  <p key={ins.id} className="insight-text">
                    <strong>[{ins.category.toUpperCase()}] {ins.title}:</strong> {ins.content}
                  </p>
                ))}
              </div>
            )}
          </section>

          <section className="quote-card" id="quote-products">
            <div className="quote-card-title"><div><span>02</span><div><p className="eyebrow">PRODUCTOS</p><h3>Implantes y consumibles</h3></div></div><button className="quote-link" onClick={addItem}><SmallIcon name="plus" />Agregar línea</button></div>
            <p className="catalog-warning">Los precios precargados son referenciales y provienen de los documentos previamente revisados. Confírmalos contra el contrato vigente.</p>
            <section className="system-assistant" aria-label="Asistente de sistemas del Excel">
              <div className="system-assistant-heading">
                <div><p className="eyebrow">LISTA SISTEMA VOLIA</p><h4>Buscar y rellenar automáticamente</h4><span>Escriba el nombre del sistema, producto o código. El sistema completo mostrará sus componentes y cantidades sugeridas.</span></div>
                <b>{VOLIA_SYSTEMS.length} sistemas · {VOLIA_SYSTEM_PRODUCTS.length} productos</b>
              </div>
              <label className="system-search-field">
                <span>Buscar por código o nombre</span>
                <input
                  value={systemSearch}
                  onChange={(event) => setSystemSearch(event.target.value)}
                  placeholder="Ej. placa en T 1,5 o F14AB-PA01329"
                  autoComplete="off"
                />
              </label>

              {normalizedSystemSearch.length >= 2 && <div className="system-suggestions">
                {systemMatches.length > 0 && <div className="suggestion-group"><strong>Sistemas recomendados</strong>{systemMatches.map((system) => <button type="button" key={system.id} className={selectedSystem?.id === system.id ? "selected" : ""} onClick={() => chooseSystem(system)}><span><b>{system.name}</b><small>{system.category} · {system.items.length} componente(s)</small></span><em>Ver sistema</em></button>)}</div>}
                {productMatches.length > 0 && <div className="suggestion-group"><strong>Productos por código o nombre</strong>{productMatches.map((product) => <button type="button" key={product.id} onClick={() => addSuggestedProduct(product)}><span><b>{product.code}</b><small>{product.description}</small></span><em>+ {money(product.unitPrice)}</em></button>)}</div>}
                {!systemMatches.length && !productMatches.length && <p className="system-empty">No se encontró una coincidencia. Puede agregar una línea personalizada debajo.</p>}
              </div>}

              {selectedSystem && <div className="system-preview">
                <header><div><span>{selectedSystem.category}</span><h4>{selectedSystem.name}</h4><p>Cantidades sugeridas tomadas de la columna C del Excel. Escriba 0 para excluir un componente.</p></div><button type="button" aria-label="Cerrar sistema seleccionado" onClick={() => setSelectedSystem(null)}>×</button></header>
                <div className="system-component-list">
                  {selectedSystem.items.map((component, index) => <div className="system-component" key={`${selectedSystem.id}-${component.code}-${index}`}>
                    <div><strong>{component.description}</strong><span>{component.code} · {money(component.unitPrice)} por unidad</span></div>
                    <label><span>Cantidad</span><input type="number" min="0" step="1" value={systemQuantities[index] ?? component.suggestedQuantity} onChange={(event) => setSystemQuantities((current) => current.map((quantity, quantityIndex) => quantityIndex === index ? Math.max(0, Math.floor(decimal(event.target.value))) : quantity))} /></label>
                    <b>{money(component.unitPrice * (systemQuantities[index] || 0))}</b>
                  </div>)}
                </div>
                <footer><div><span>Total referencial del sistema</span><strong>{money(selectedSystemTotal)}</strong></div><button type="button" className="primary-button" onClick={addSelectedSystem}><SmallIcon name="plus" />Agregar sistema a la cotización</button></footer>
              </div>}
              {systemMessage && <p className="system-message" role="status">{systemMessage}</p>}
            </section>
            <RequirementImporter catalog={catalog} customer={meta.customer} onAdd={addRequirementLines} />
            <div className="quote-items">
              {items.map((item, index) => {
                const lineSale = item.quantity * item.unitPrice;
                const lineCost = item.quantity * item.unitCost * (1 + meta.overhead / 100);
                const lineMargin = lineSale > 0 ? (lineSale - lineCost) / lineSale * 100 : 0;
                return <article className="quote-item" key={item.id}>
                  <div className="quote-item-head"><strong>Producto {index + 1}</strong><button onClick={() => removeItem(item.id)} disabled={items.length === 1} aria-label={`Eliminar producto ${index + 1}`}><SmallIcon name="trash" /></button></div>
                  <div className="product-picker"><label><span>Catálogo</span><select value={catalog.some((entry) => entry.code === item.code) ? item.code : "custom"} onChange={(event) => selectProduct(item.id, event.target.value)}><option value="custom">Producto personalizado</option>{catalog.filter((product) => product.active).map((product) => <option key={product.id} value={product.code}>{product.code} — {product.description}</option>)}</select></label></div>
                  <div className="item-fields">
                    <label className="code-field"><span>Código IESS</span><input value={item.code} onChange={(event) => updateItem(item.id, { code: event.target.value })} /></label>
                    <label className="description-field"><span>Descripción</span><input value={item.description} onChange={(event) => updateItem(item.id, { description: event.target.value })} /></label>
                    <label className="brand-field"><span>Marca</span><input placeholder="Ej. Mindray" value={item.brand} onChange={(event) => updateItem(item.id, { brand: event.target.value })} /></label>
                    <label className="origin-field"><span>Procedencia</span><input placeholder="Ej. China" value={item.origin} onChange={(event) => updateItem(item.id, { origin: event.target.value })} /></label>
                    <label className="quantity-field"><span>Cantidad</span><input type="number" min="1" value={item.quantity} onChange={(event) => updateItem(item.id, { quantity: Math.max(1, decimal(event.target.value)) })} /></label>
                    <label className="cost-field"><span>Costo unitario interno</span><input type="number" min="0" step="0.01" placeholder="0.00" value={item.unitCost || ""} onChange={(event) => updateItem(item.id, { unitCost: decimal(event.target.value) })} /></label>
                    <label className="price-field"><span>Precio unitario ofertado</span><input type="number" min="0" step="0.01" value={item.unitPrice || ""} onChange={(event) => updateItem(item.id, { unitPrice: decimal(event.target.value) })} /></label>
                  </div>
                  <div className="line-result"><span>Venta: <strong>{money(lineSale)}</strong></span><span>Costo real: <strong>{item.unitCost ? money(lineCost) : "Pendiente"}</strong></span><span>Margen: <strong className={item.unitCost && lineMargin < meta.minimumMargin ? "negative" : ""}>{item.unitCost ? `${lineMargin.toFixed(1)} %` : "Pendiente"}</strong></span></div>
                  {item.description.trim() && (() => { const reg = regulatoryByLine.get(item.id); return <p className={`line-regulatory ${reg ? reg.status : "sin-documento"}`}>{reg ? <>Registro probable <strong>{reg.record.reference}</strong> · {reg.status === "vigente" ? `vigente (${reg.days} días)` : reg.status === "sin-fecha" ? "sin fecha de vencimiento cargada" : reg.status === "vencido" ? `vencido hace ${-(reg.days ?? 0)} días` : `vence en ${reg.days} días`}</> : "Sin registro sanitario identificado en Vigencias"}</p>; })()}
                </article>;
              })}
            </div>
            <button className="add-line-button" onClick={addItem}><SmallIcon name="plus" />Añadir otro producto</button>
          </section>

          <section className="quote-card" id="quote-terms">
            <div className="quote-card-title"><div><span>03</span><div><p className="eyebrow">CONDICIONES</p><h3>Costos y términos comerciales</h3></div></div></div>
            <div className="commercial-grid">
              <label><span>Costos adicionales sobre compra (%)</span><input type="number" min="0" step="0.1" value={meta.overhead} onChange={(event) => setField("overhead", decimal(event.target.value))} /><small>Flete, importación, logística u otros costos indirectos.</small></label>
              <label><span>Margen mínimo objetivo (%)</span><input type="number" min="0" max="95" step="0.5" value={meta.minimumMargin} onChange={(event) => setField("minimumMargin", Math.min(95, decimal(event.target.value)))} /><small>El sistema advertirá si la oferta queda por debajo.</small></label>
              <div className="discount-control">
                <label><span>Tipo de descuento</span><select value={meta.discountType} onChange={(event) => setField("discountType", event.target.value as QuoteMeta["discountType"])}><option value="percent">Porcentaje (%)</option><option value="amount">Valor fijo (USD)</option></select></label>
                <label><span>{meta.discountType === "percent" ? "Descuento (%)" : "Descuento (USD)"}</span><input type="number" min="0" max={meta.discountType === "percent" ? 100 : undefined} step="0.01" value={meta.discountValue || ""} placeholder="0.00" onChange={(event) => setField("discountValue", meta.discountType === "percent" ? Math.min(100, decimal(event.target.value)) : decimal(event.target.value))} /><small>Opcional para hospitales o pacientes.</small></label>
              </div>
              <label className={`vat-switch ${meta.applyVat ? "active" : ""}`}><input type="checkbox" checked={meta.applyVat} onChange={(event) => setField("applyVat", event.target.checked)} /><span><strong>{meta.applyVat ? "Sí aplica IVA" : "No aplica IVA"}</strong>15 % sobre el valor después del descuento.</span></label>
              <label><span>Tiempo de entrega</span><textarea value={meta.delivery} onChange={(event) => setField("delivery", event.target.value)} /></label>
              <label><span>Forma de pago</span><textarea value={meta.payment} onChange={(event) => setField("payment", event.target.value)} /></label>
              <label><span>Garantía</span><textarea value={meta.warranty} onChange={(event) => setField("warranty", event.target.value)} /></label>
              <label className="wide-field"><span>Nota</span><textarea placeholder="Nota comercial, descuento mediante nota de crédito u otra aclaración" value={meta.notes} onChange={(event) => setField("notes", event.target.value)} /></label>
            </div>
          </section>
        </div>

        <aside className="profit-panel">
          <div className="profit-heading"><SmallIcon name="calculator" /><div><p className="eyebrow">ANÁLISIS INTERNO</p><h3>Rentabilidad de la oferta</h3></div></div>
          <div className={`profit-status ${risk}`}><SmallIcon name={risk === "healthy" ? "check" : "warning"} /><div><strong>{risk === "healthy" ? "Margen saludable" : risk === "danger" ? "Oferta con pérdida" : risk === "warning" ? "Margen inferior al objetivo" : "Ingrese todos los costos"}</strong><span>{risk === "healthy" ? `Supera el objetivo de ${meta.minimumMargin.toFixed(1)} %.` : risk === "incomplete" ? `Faltan costos en ${totals.missingCosts} línea(s).` : "Revise precios o costos antes de enviar."}</span></div></div>
          <MarketHint buyers={[meta.customer, meta.hospital]} marginPct={totals.margin} />
          {regulatorySummary.total > 0 && (regulatorySummary.expired + regulatorySummary.soon + regulatorySummary.undated + regulatorySummary.missing) > 0 && <div className={`market-hint ${regulatorySummary.expired ? "risk-alto" : "risk-medio"}`} role="note"><strong>Documentos regulatorios</strong><span>{[regulatorySummary.expired && `${regulatorySummary.expired} línea(s) con registro vencido`, regulatorySummary.soon && `${regulatorySummary.soon} con registro por vencer en 90 días`, regulatorySummary.undated && `${regulatorySummary.undated} con registro sin fecha cargada`, regulatorySummary.missing && `${regulatorySummary.missing} sin registro identificado`].filter(Boolean).join(" · ")}.</span><span>Verifique en Vigencias antes de presentar la oferta.</span></div>}
          <dl className="profit-list">
            <div><dt>Subtotal antes de descuento</dt><dd>{money(totals.grossSubtotal)}</dd></div>
            <div className="discount-value"><dt>Descuento comercial</dt><dd>- {money(totals.discount)}</dd></div>
            <div><dt>Venta neta sin IVA</dt><dd>{money(totals.netSubtotal)}</dd></div>
            <div><dt>Costo base</dt><dd>{money(totals.baseCost)}</dd></div>
            <div><dt>Costo real + adicionales</dt><dd>{money(totals.totalCost)}</dd></div>
            <div className="profit-emphasis"><dt>Utilidad bruta</dt><dd className={totals.profit < 0 ? "negative" : ""}>{money(totals.profit)}</dd></div>
            <div><dt>Margen sobre venta</dt><dd>{totals.missingCosts ? "Pendiente" : `${totals.margin.toFixed(2)} %`}</dd></div>
            <div><dt>Markup sobre costo</dt><dd>{totals.missingCosts ? "Pendiente" : `${totals.markup.toFixed(2)} %`}</dd></div>
            <div><dt>IVA 15 % ({meta.applyVat ? "Sí" : "No"})</dt><dd>{money(totals.iva)}</dd></div>
            <div className="quote-total"><dt>Total ofertado</dt><dd>{money(totals.total)}</dd></div>
          </dl>
          {!totals.missingCosts && totals.recommendedSubtotal > totals.netSubtotal + .01 && <div className="price-advice"><span>Venta neta mínima recomendada</span><strong>{money(totals.recommendedSubtotal)}</strong><small>Después del descuento y antes del IVA, aumente la oferta en {money(totals.recommendedSubtotal - totals.netSubtotal)} para alcanzar un margen de {meta.minimumMargin.toFixed(1)} %.</small></div>}
          <div className="quote-actions"><button className="primary-button" onClick={downloadPdf}><SmallIcon name="download" />Descargar PDF</button><button className="secondary-button" onClick={downloadWord}><SmallIcon name="download" />Descargar Word</button><button className="secondary-button" onClick={archiveQuote}><SmallIcon name="check" />Guardar oferta</button><button className="secondary-button" onClick={() => { window.print(); recordActivity("Cotizador", "Oferta impresa", `${meta.number || "Sin número"} · ${meta.customer || "Cliente"}`, "export"); }}><SmallIcon name="print" />Imprimir</button><button className="secondary-button" onClick={() => { archiveQuote(); exportCsv(); }}><SmallIcon name="download" />Exportar Excel/CSV</button></div>
          {memoryMessage && <p className="memory-confirmation">{memoryMessage}</p>}
          <p className="privacy-copy">Los costos y el margen solo aparecen en este panel interno; no se muestran en la cotización para el cliente.</p>
        </aside>
      </div>

      <section className="quote-document" aria-label="Vista imprimible de la cotización">
        <header><div className="quote-logo"><img src={VOLIA_LOGO_DATA_URL} alt="Volia S.A.S." width="120" height="58" /><div><strong>VOLIA S.A.S.</strong><small>{COMPANY.address}<br />Telf. {COMPANY.phone} · {COMPANY.email}</small></div></div><div className="quote-number"><span>RUC</span><strong>{COMPANY.ruc}</strong><small>{meta.date || "Sin fecha"}<br />Quito, Ecuador</small></div></header>
        <div className="document-parties"><div><span>Cliente / entidad</span><strong>{meta.customer || "Cliente por definir"}</strong><p>{meta.taxId && `RUC/CI: ${meta.taxId}`}{meta.contact && <><br />Atención: {meta.contact}</>}{meta.contract && <><br />Proceso: {meta.contract}</>}</p></div><div><span>Referencia</span><strong>OFERTA COMERCIAL</strong><b className="offer-number">{meta.number || "SIN NÚMERO"}</b><p>Validez: {meta.validity} días<br />IVA 15 %: {meta.applyVat ? "SÍ APLICA" : "NO APLICA"}<br />Quito, Ecuador</p></div></div>
        <div className="patient-data"><div><span>Paciente</span><strong>{meta.patient || "—"}</strong></div><div><span>HC</span><strong>{meta.hcl || "—"}</strong></div><div><span>Dirección / hospital</span><strong>{meta.patientAddress || meta.hospital || "—"}</strong></div><div><span>Fecha de cirugía</span><strong>{meta.surgeryDate || "—"}</strong></div><div><span>Médico</span><strong>{meta.doctor || "—"}</strong></div></div>
        <table className="proforma-products"><thead><tr><th>Código</th><th>Descripción</th><th>Marca</th><th>Procedencia</th><th>Cant.</th><th>Precio unitario</th><th>Total</th></tr></thead><tbody>{items.map((item) => <tr key={`print-${item.id}`}><td>{item.code || "—"}</td><td>{item.description || "Producto por definir"}</td><td>{item.brand || "—"}</td><td>{item.origin || "—"}</td><td>{item.quantity}</td><td>{money(item.unitPrice)}</td><td>{money(item.quantity * item.unitPrice)}</td></tr>)}</tbody></table>
        <div className="document-totals"><div><span>Subtotal</span><strong>{money(totals.grossSubtotal)}</strong></div>{totals.discount > 0 && <><div className="document-discount"><span>Descuento</span><strong>- {money(totals.discount)}</strong></div><div><span>Base después del descuento</span><strong>{money(totals.netSubtotal)}</strong></div></>}<div><span>IVA 15 % — {meta.applyVat ? "Sí aplica" : "No aplica"}</span><strong>{money(totals.iva)}</strong></div><div className="grand-total"><span>TOTAL</span><strong>{money(totals.total)}</strong></div></div>
        <div className="document-terms"><div><span>Marca</span><p>{brandSummary}</p></div><div><span>Procedencia</span><p>{originSummary}</p></div><div><span>Tiempo de entrega</span><p>{meta.delivery}</p></div><div><span>Forma de pago</span><p>{meta.payment}</p></div><div><span>Garantía</span><p>{meta.warranty}</p></div>{meta.notes && <div className="note-term"><span>Nota</span><p>{meta.notes}</p></div>}</div>
        <footer><div><strong>VOLIA S.A.S. · RUC {COMPANY.ruc}</strong><span>{COMPANY.address}</span><span>Telf. {COMPANY.phone} · {COMPANY.email} · Quito, Ecuador</span><strong>Revisión comercial obligatoria antes del envío</strong></div></footer>
      </section>
    </section>
  );
}
