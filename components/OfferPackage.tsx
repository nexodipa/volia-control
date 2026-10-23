"use client";

import { useEffect, useMemo, useState } from "react";
import { businessIsoDate } from "../lib/date-utils";
import { readStoredArray, readStoredObject, STORAGE_KEYS, writeStoredJson } from "../lib/storage";
import { getSavedQuotes, type StoredQuote } from "../lib/volia-memory";
import { REGULATORY_SEED, type RegulatoryRecord } from "../lib/regulatory-data";
import { pullRegulatory } from "../lib/regulatory-sync";
import { loadPriceData, supplierOffers, type SupplierItem } from "../lib/price-intel";
import { buildLines, checklist, DEFAULT_COMPANY, groupBySupplier, missingFields, type CompanyInfo, type ProcessInfo, type QuoteLike } from "../lib/offer-package";
import { exportOfferPackage, OFFER_DOCS, type OfferDocKind } from "../lib/offer-docx";
import { recordActivity } from "../lib/activity-log";

type Draft = { source: string; process: ProcessInfo; company: CompanyInfo; suppliers: Record<string, string>; docs: OfferDocKind[] };
type QuoteData = { meta?: { number?: string; customer?: string; contract?: string; validity?: number; delivery?: string }; items?: QuoteLike[] };

const EMPTY_PROCESS: ProcessInfo = { code: "", entity: "", object: "", date: businessIsoDate(), recipient: "", recipientRole: "", award: "", awardDate: "", deliveryDays: "", validityDays: "" };
const ALL_DOCS = Object.keys(OFFER_DOCS) as OfferDocKind[];
const INITIAL: Draft = { source: "draft", process: EMPTY_PROCESS, company: DEFAULT_COMPANY, suppliers: {}, docs: ALL_DOCS };

const STATE_LABEL: Record<string, string> = { vigente: "Vigente", "por vencer": "Por vencer", vencido: "Vencido", "sin fecha": "Sin fecha", "sin registro": "Sin registro" };

export default function OfferPackage() {
  const [draft, setDraft] = useState<Draft>(INITIAL);
  const [ready, setReady] = useState(false);
  const [quotes, setQuotes] = useState<StoredQuote[]>([]);
  const [current, setCurrent] = useState<QuoteData | null>(null);
  const [records, setRecords] = useState<RegulatoryRecord[]>(REGULATORY_SEED);
  const [priceList, setPriceList] = useState<SupplierItem[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = readStoredObject<Draft>(STORAGE_KEYS.offerDraft, INITIAL);
      setDraft({ ...INITIAL, ...saved, process: { ...EMPTY_PROCESS, ...saved.process }, company: { ...DEFAULT_COMPANY, ...saved.company } });
      setQuotes(getSavedQuotes());
      setCurrent(readStoredObject<QuoteData>(STORAGE_KEYS.quoteDraft, {}));
      const stored = readStoredArray<RegulatoryRecord>(STORAGE_KEYS.regulatoryDocs);
      if (stored.length) setRecords(stored);
      setReady(true);
    }, 0);
    pullRegulatory().then((r) => { if (r.ok && r.data.length) setRecords(r.data); });
    loadPriceData().then((d) => setPriceList(d.suppliers));
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (ready) writeStoredJson(STORAGE_KEYS.offerDraft, draft); }, [draft, ready]);

  const source: QuoteData | null = useMemo(() => {
    if (draft.source === "draft") return current;
    const q = quotes.find((x) => x.savedAt === draft.source);
    return (q?.data as QuoteData) ?? null;
  }, [draft.source, quotes, current]);

  const lines = useMemo(() => {
    const items = Array.isArray(source?.items) ? source.items : [];
    const overrides = Object.fromEntries(Object.entries(draft.suppliers).map(([k, v]) => [Number(k), v]));
    const guess = (description: string, brand: string) => supplierOffers(description, priceList)[0]?.item.p ?? brand;
    return buildLines(items, records, businessIsoDate(), guess, overrides);
  }, [source, records, priceList, draft.suppliers]);

  // Al abrir Documentos (o al cambiar la cotización de origen) se completan solos los datos del proceso que estén vacíos.
  const metaContract = source?.meta?.contract ?? "";
  const metaCustomer = source?.meta?.customer ?? "";
  const metaValidity = source?.meta?.validity ? String(source.meta.validity) : "";
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      setDraft((d) => {
        const code = d.process.code || metaContract;
        const entity = d.process.entity || metaCustomer;
        const validityDays = d.process.validityDays || metaValidity;
        if (code === d.process.code && entity === d.process.entity && validityDays === d.process.validityDays) return d;
        return { ...d, process: { ...d.process, code, entity, validityDays } };
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [ready, metaContract, metaCustomer, metaValidity]);

  const rows = useMemo(() => checklist(lines), [lines]);
  const groups = useMemo(() => groupBySupplier(lines), [lines]);
  const missing = missingFields(draft.process, draft.company, lines);

  const setProcess = (key: keyof ProcessInfo, value: string) => setDraft((d) => ({ ...d, process: { ...d.process, [key]: value } }));
  const setCompany = (key: keyof CompanyInfo, value: string) => setDraft((d) => ({ ...d, company: { ...d.company, [key]: value } }));
  const setSupplier = (item: number, value: string) => setDraft((d) => ({ ...d, suppliers: { ...d.suppliers, [item]: value } }));
  const toggleDoc = (kind: OfferDocKind) => setDraft((d) => ({ ...d, docs: d.docs.includes(kind) ? d.docs.filter((k) => k !== kind) : [...d.docs, kind] }));

  const chooseSource = (value: string) => {
    const data = value === "draft" ? current : (quotes.find((x) => x.savedAt === value)?.data as QuoteData | undefined);
    const meta = data?.meta ?? {};
    setDraft((d) => ({
      ...d,
      source: value,
      suppliers: {},
      process: {
        ...d.process,
        code: d.process.code || meta.contract || "",
        entity: d.process.entity || meta.customer || "",
        validityDays: d.process.validityDays || (meta.validity ? String(meta.validity) : ""),
      },
    }));
  };

  const download = async (kinds: OfferDocKind[]) => {
    if (!kinds.length) { setMessage("Elija al menos un documento."); return; }
    const n = await exportOfferPackage(kinds, draft.process, draft.company, lines);
    setMessage(`Se descargó el Word con ${n} documento(s). Revíselo y fírmelo antes de subirlo al portal.`);
    recordActivity("Documentos", "Paquete de oferta generado", `${draft.process.code || "Sin código"} · ${n} documento(s)`, "export");
  };

  const sourceLabel = (q: StoredQuote) => `${q.number || "Sin número"} · ${q.customer || "Sin cliente"} · ${q.date || ""}`;

  return (
    <section className="business-card offer-package">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Procesos SERCOP</p>
          <h3>Paquete de oferta</h3>
          <p className="offer-lead">Elija una cotización, complete los datos del proceso y descargue en Word la carta de presentación, la declaración de integridad, las cartas de compromiso por proveedor, el componente de los bienes y el control de respaldos.</p>
        </div>
      </div>

      <div className="business-form two">
        <label className="wide-field"><span>Cotización de origen</span>
          <select value={draft.source} onChange={(e) => chooseSource(e.target.value)}>
            <option value="draft">Cotización abierta en el Cotizador{current?.meta?.number ? ` (${current.meta.number})` : ""}</option>
            {quotes.map((q) => <option key={q.savedAt} value={q.savedAt}>{sourceLabel(q)}</option>)}
          </select>
        </label>
        <label><span>Código del proceso</span><input value={draft.process.code} placeholder="SIE-MDMQ-2026-0000" onChange={(e) => setProcess("code", e.target.value)} /></label>
        <label><span>Fecha de los documentos</span><input type="date" value={draft.process.date} onChange={(e) => setProcess("date", e.target.value)} /></label>
        <label className="wide-field"><span>Entidad contratante</span><input value={draft.process.entity} placeholder="Gobierno Autónomo Descentralizado del Distrito Metropolitano de Quito" onChange={(e) => setProcess("entity", e.target.value)} /></label>
        <label className="wide-field"><span>Objeto de contratación</span><input value={draft.process.object} placeholder="Adquisición de dispositivos médicos de uso general" onChange={(e) => setProcess("object", e.target.value)} /></label>
        <label><span>Dirigida a (carta de presentación)</span><input value={draft.process.recipient} placeholder="Nombre de la autoridad" onChange={(e) => setProcess("recipient", e.target.value)} /></label>
        <label><span>Cargo</span><input value={draft.process.recipientRole} onChange={(e) => setProcess("recipientRole", e.target.value)} /></label>
        <label><span>Plazo de entrega (días)</span><input value={draft.process.deliveryDays} onChange={(e) => setProcess("deliveryDays", e.target.value)} /></label>
        <label><span>Validez de la oferta (días)</span><input value={draft.process.validityDays} onChange={(e) => setProcess("validityDays", e.target.value)} /></label>
        <label><span>Resolución de adjudicación (si ya existe)</span><input value={draft.process.award} placeholder="Resolución Administrativa Nro. …" onChange={(e) => setProcess("award", e.target.value)} /></label>
        <label><span>Fecha de la resolución</span><input type="date" value={draft.process.awardDate} onChange={(e) => setProcess("awardDate", e.target.value)} /></label>
      </div>

      <details className="offer-company">
        <summary>Datos de la empresa que firman los documentos{draft.company.representative ? ` · ${draft.company.representative}` : " · falta el representante legal"}</summary>
        <div className="business-form two">
          {([["representative", "Representante legal"], ["role", "Cargo"], ["name", "Razón social"], ["ruc", "RUC"], ["phone", "Teléfono"], ["email", "Correo"], ["city", "Ciudad"], ["address", "Dirección"]] as const).map(([key, label]) => (
            <label key={key} className={key === "address" ? "wide-field" : ""}><span>{label}</span><input value={draft.company[key]} onChange={(e) => setCompany(key, e.target.value)} /></label>
          ))}
        </div>
      </details>

      {lines.length === 0 ? (
        <p className="offer-empty">La cotización elegida no tiene ítems. Ármela en el Cotizador o elija una guardada.</p>
      ) : (
        <div className="offer-table-wrap">
          <table className="offer-table">
            <thead><tr><th>Ítem</th><th>Descripción</th><th>Cant.</th><th>Proveedor (carta de compromiso)</th><th>Registro sanitario</th></tr></thead>
            <tbody>
              {lines.map((l) => {
                const r = rows.find((x) => x.item === l.item);
                return (
                  <tr key={l.item}>
                    <td>{l.item}</td>
                    <td>{l.description}{l.brand ? <small> · {l.brand}</small> : null}</td>
                    <td>{l.quantity.toLocaleString("es-EC")}</td>
                    <td><input aria-label={`Proveedor del ítem ${l.item}`} value={l.supplier} placeholder="Proveedor" onChange={(e) => setSupplier(l.item, e.target.value)} /></td>
                    <td><span className={`offer-state state-${(r?.state ?? "").replace(" ", "-")}`}>{STATE_LABEL[r?.state ?? ""] ?? ""}</span>{r?.reference ? <small> {r.reference}</small> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="offer-note">{groups.length} carta(s) de compromiso: {groups.map((g) => `${g.supplier} (${g.lines.length})`).join(", ") || "ninguna"}. El proveedor sale de las listas de precios o de la marca; corríjalo si compra a otro distribuidor. El registro de cada línea es una propuesta: confírmelo contra el PDF.</p>
        </div>
      )}

      <fieldset className="offer-docs">
        <legend>Documentos a generar</legend>
        {ALL_DOCS.map((kind) => (
          <label key={kind} className="offer-doc-option"><input type="checkbox" checked={draft.docs.includes(kind)} onChange={() => toggleDoc(kind)} />{OFFER_DOCS[kind]}</label>
        ))}
      </fieldset>

      {missing.length > 0 && <p className="offer-missing" role="note">Falta: {missing.join(", ")}. Puede descargar igual: los datos que faltan quedan entre corchetes y los ítems sin proveedor no llevan carta de compromiso.</p>}
      <div className="hero-actions">
        <button className="primary-button" onClick={() => download(draft.docs)} disabled={!lines.length}>Descargar paquete en Word</button>
      </div>
      {message && <p className="memory-confirmation">{message}</p>}
    </section>
  );
}
