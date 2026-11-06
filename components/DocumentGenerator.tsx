"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { exportBusinessPdf, exportBusinessWord, type BusinessExport } from "../lib/business-exports";
import { businessIsoDate } from "../lib/date-utils";
import { DEFAULT_COMPANY } from "../lib/offer-package";
import { addMonths, authorizationLetter, letterDate, authorizationMissing, parseBrandLines, prefillFromCase, prefillFromTender, suggestRegistrations, type AuthorizationInput } from "../lib/doc-templates";
import { exportAuthorizationLetter } from "../lib/authorization-docx";
import { REGULATORY_SEED, type RegulatoryRecord } from "../lib/regulatory-data";
import { normalizeTender, TENDER_STATUS, type Tender } from "../lib/tenders";
import { findResponsible, normalizeContact, type InstitutionContact } from "../lib/institution-contacts";
import { readStoredArray, readStoredObject, STORAGE_KEYS, writeStoredJson } from "../lib/storage";
import { VOLIA_LOGO_DATA_URL } from "../lib/volia-logo";
import { recordActivity } from "../lib/activity-log";

type DocType = "authorization" | "implants" | "delivery" | "technical" | "payment";
type DocData = {
  type: DocType; number: string; date: string; recipient: string; role: string; institution: string; patient: string; patientId: string; hcl: string;
  surgeryDate: string; contract: string; subject: string; detail: string; amount: string; signer: string; signerRole: string;
  // Carta de autorización de marca (la firma el fabricante o su representante)
  letterhead: "volia" | "otro"; authorized: string; authorizedRuc: string;
  issuer: string; issuerAddress: string; issuerPhone: string; issuerEmail: string; productLine: string; brands: string; validUntil: string;
};
type StoredDocument = { id: string; savedAt: string; data: DocData };
type CaseLite = { id: string; patient: string; hospital: string; surgeryDate: string; contract: string; amount: number; invoice: string };
type Issuer = Pick<DocData, "issuer" | "issuerAddress" | "issuerPhone" | "issuerEmail" | "signer" | "signerRole" | "productLine" | "brands">;

const KEY = "volia-document-draft-v1";
const VOLIA = { name: "VOLIA S.A.S.", ruc: "1793206800001" };
const TYPES: Record<DocType, { label: string; hint: string; subject: string; intro: string }> = {
  authorization: { label: "Carta de autorización de marca", hint: "Con el membrete de Volia, o con el de un fabricante para que él la firme.", subject: "Autorización de distribución", intro: "" },
  implants: { label: "Carta de implantes utilizados", hint: "Para el cobro de una cirugía.", subject: "Detalle de implantes utilizados", intro: "Por medio de la presente se deja constancia de los dispositivos e insumos utilizados durante el procedimiento indicado." },
  delivery: { label: "Acta de entrega-recepción", hint: "Entrega de bienes a la entidad.", subject: "Entrega de equipos e insumos", intro: "Las partes dejan constancia de la entrega y recepción conforme de los bienes detallados a continuación." },
  technical: { label: "Informe técnico", hint: "Revisión con hallazgos y recomendaciones.", subject: "Informe técnico de revisión", intro: "Se presenta el resultado de la revisión técnica efectuada, incluyendo antecedentes, hallazgos y recomendaciones." },
  payment: { label: "Solicitud de pago", hint: "Pide el pago de bienes ya entregados.", subject: "Solicitud de pago por bienes entregados", intro: "Se solicita gestionar el pago correspondiente a los bienes y servicios entregados conforme al proceso indicado." },
};
const today = businessIsoDate;
const INITIAL: DocData = {
  type: "authorization", number: `VOL-DOC-${today().replaceAll("-", "")}`, date: today(), recipient: "", role: "", institution: "", patient: "", patientId: "", hcl: "",
  surgeryDate: "", contract: "", subject: TYPES.authorization.subject, detail: "", amount: "", signer: "", signerRole: "REPRESENTANTE LEGAL",
  letterhead: "volia", authorized: "", authorizedRuc: "",
  issuer: "", issuerAddress: "", issuerPhone: "", issuerEmail: "", productLine: "", brands: "", validUntil: addMonths(today(), 2),
};
const FIELDS: Record<Exclude<DocType, "authorization">, Array<[keyof DocData, string]>> = {
  implants: [["institution", "Institución"], ["contract", "Contrato / proceso"], ["patient", "Paciente"], ["patientId", "Cédula"], ["hcl", "HCL"], ["surgeryDate", "Fecha de cirugía"], ["recipient", "Destinatario"], ["role", "Cargo del destinatario"], ["signer", "Firmante"], ["signerRole", "Cargo del firmante"]],
  delivery: [["institution", "Institución"], ["contract", "Contrato / proceso"], ["recipient", "Destinatario"], ["role", "Cargo del destinatario"], ["amount", "Valor relacionado (USD)"], ["signer", "Firmante"], ["signerRole", "Cargo del firmante"]],
  technical: [["institution", "Institución"], ["contract", "Contrato / proceso"], ["recipient", "Destinatario"], ["role", "Cargo del destinatario"], ["signer", "Firmante"], ["signerRole", "Cargo del firmante"]],
  payment: [["institution", "Institución"], ["contract", "Contrato / proceso"], ["patient", "Paciente"], ["surgeryDate", "Fecha de cirugía"], ["amount", "Valor relacionado (USD)"], ["recipient", "Destinatario"], ["role", "Cargo del destinatario"], ["signer", "Firmante"], ["signerRole", "Cargo del firmante"]],
};
const DATE_FIELDS = new Set<keyof DocData>(["date", "surgeryDate", "validUntil"]);

export default function DocumentGenerator() {
  const [data, setData] = useState<DocData>(INITIAL);
  const [ready, setReady] = useState(false);
  const [history, setHistory] = useState<StoredDocument[]>([]);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [cases, setCases] = useState<CaseLite[]>([]);
  const [records, setRecords] = useState<RegulatoryRecord[]>(REGULATORY_SEED);
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [contacts, setContacts] = useState<InstitutionContact[]>([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setData({ ...INITIAL, ...readStoredObject<Partial<DocData>>(KEY, {}) });
      setHistory(readStoredArray<StoredDocument>(STORAGE_KEYS.documentHistory));
      setTenders(readStoredArray<unknown>(STORAGE_KEYS.tenders).map(normalizeTender).filter((t): t is Tender => !!t));
      setCases(readStoredArray<CaseLite>(STORAGE_KEYS.cases));
      const stored = readStoredArray<RegulatoryRecord>(STORAGE_KEYS.regulatoryDocs);
      if (stored.length) setRecords(stored);
      setIssuers(readStoredArray<Issuer>(STORAGE_KEYS.docIssuers));
      setContacts(readStoredArray<unknown>(STORAGE_KEYS.institutionContacts).map(normalizeContact).filter((c): c is InstitutionContact => !!c));
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => { if (ready) writeStoredJson(KEY, data); }, [data, ready]);

  const set = (patch: Partial<DocData>) => setData((c) => ({ ...c, ...patch }));
  const setType = (type: DocType) => set({ type, subject: TYPES[type].subject });
  const label = TYPES[data.type].label;
  const isAuth = data.type === "authorization";

  const auth: AuthorizationInput = useMemo(() => ({
    date: data.date, city: "Quito", institution: data.institution, distributor: data.letterhead === "volia" ? data.authorized : VOLIA.name, distributorRuc: data.letterhead === "volia" ? data.authorizedRuc : VOLIA.ruc, productLine: data.productLine,
    brands: parseBrandLines(data.brands), process: data.contract, validUntil: data.validUntil, signer: data.signer, signerRole: data.signerRole,
  }), [data]);
  const letter = useMemo(() => authorizationLetter(auth), [auth]);
  const ownLetterhead = data.letterhead === "volia";
  const head = ownLetterhead
    ? { name: DEFAULT_COMPANY.name, address: DEFAULT_COMPANY.address, phone: DEFAULT_COMPANY.phone, email: DEFAULT_COMPANY.email, voliaLogo: true }
    : { name: data.issuer, address: data.issuerAddress, phone: data.issuerPhone, email: data.issuerEmail, voliaLogo: false };
  const missing = useMemo(() => (isAuth ? authorizationMissing(auth) : []), [isAuth, auth]);

  const fillRegistrations = () => {
    let found = 0;
    const lines = parseBrandLines(data.brands).map((b) => {
      if (b.registrations.length) return b;
      const regs = suggestRegistrations(b.brand, records);
      found += regs.length ? 1 : 0;
      return { ...b, registrations: regs };
    });
    set({ brands: lines.map((b) => (b.registrations.length ? `${b.brand} | ${b.registrations.join(", ")}` : b.brand)).join("\n") });
    setNote(found ? `Encontré registros en Vigencias para ${found} marca(s). Revísalos antes de enviar.` : "No hay registros en Vigencias que mencionen esas marcas; escríbelos a mano.");
  };
  const fromSource = (value: string) => {
    if (value.startsWith("t:")) {
      const t = tenders.find((x) => x.id === value.slice(2));
      if (t) set(prefillFromTender(t));
    } else if (value.startsWith("c:")) {
      const c = cases.find((x) => x.id === value.slice(2));
      if (c) {
        const who = findResponsible(contacts, c.hospital, c.surgeryDate);
        set({ ...prefillFromCase(c), ...(who ? { recipient: who.name, role: who.role } : {}) });
        setNote(who ? `Destinatario: ${who.name}, responsable de ${c.hospital} en esa fecha.` : "");
      }
    }
  };
  const applyIssuer = (name: string) => { const i = issuers.find((x) => x.issuer === name); if (i) set(i); };
  const rememberIssuer = () => {
    if (!isAuth || ownLetterhead || !data.issuer.trim()) return;
    const entry: Issuer = { issuer: data.issuer, issuerAddress: data.issuerAddress, issuerPhone: data.issuerPhone, issuerEmail: data.issuerEmail, signer: data.signer, signerRole: data.signerRole, productLine: data.productLine, brands: data.brands };
    const next = [entry, ...issuers.filter((x) => x.issuer !== entry.issuer)].slice(0, 30);
    setIssuers(next);
    writeStoredJson(STORAGE_KEYS.docIssuers, next);
  };

  const exportPayload = (): BusinessExport => ({
    title: label, subtitle: data.subject, reference: `${data.number || "Sin número"} · ${data.date || "Sin fecha"}`,
    metadata: [["Destinatario", data.recipient], ["Cargo", data.role], ["Institución", data.institution], ["Paciente", data.patient], ["CI / HCL", `${data.patientId || "—"} / ${data.hcl || "—"}`], ["Fecha de cirugía", data.surgeryDate], ["Contrato / proceso", data.contract], ["Firmante", data.signer]],
    paragraphs: [TYPES[data.type].intro, data.detail || "Detalle pendiente de completar.", ...(data.amount ? [`Valor relacionado: USD ${Number(data.amount).toLocaleString("es-EC", { minimumFractionDigits: 2 })}`] : []), "Particular que comunico para los fines pertinentes."],
    disclaimer: "Documento institucional de VOLIA S.A.S. Revisión, aprobación y firma humana obligatorias antes de su emisión.",
  });
  const archive = () => {
    const snapshot: StoredDocument = { id: `${Date.now()}`, savedAt: new Date().toISOString(), data: { ...data } };
    const next = [snapshot, ...history.filter((e) => e.data.number !== data.number)].slice(0, 100);
    setHistory(next);
    writeStoredJson(STORAGE_KEYS.documentHistory, next);
    recordActivity("Documentos", "Documento archivado", `${data.number || "Sin número"} · ${label}`, "create");
  };
  const log = (what: string) => recordActivity("Documentos", what, `${data.number || "Sin número"} · ${label}`, "export");
  const downloadWord = async () => {
    archive();
    if (isAuth) { rememberIssuer(); await exportAuthorizationLetter(auth, head); }
    else await exportBusinessWord(exportPayload(), data.number || label);
    log("Documento exportado en Word");
  };
  const downloadPdf = async () => { archive(); if (isAuth) rememberIssuer(); await exportBusinessPdf(exportPayload(), data.number || label); log("Documento exportado en PDF"); };
  const restore = (entry: StoredDocument) => { setData({ ...INITIAL, ...entry.data }); recordActivity("Documentos", "Documento restaurado", `${entry.data.number || "Sin número"} · ${TYPES[entry.data.type].label}`, "update"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const deleteDoc = (id: string, docNumber: string) => {
    if (!window.confirm("¿Eliminar este documento del archivo histórico?")) return;
    const next = history.filter((e) => e.id !== id);
    setHistory(next);
    writeStoredJson(STORAGE_KEYS.documentHistory, next);
    recordActivity("Documentos", "Documento eliminado del archivo", `${docNumber || "Sin número"}`, "delete");
  };

  const openTenders = tenders.filter((t) => TENDER_STATUS[t.status].open);
  const input = (key: keyof DocData, text: string, wide = false) => (
    <label key={key} className={wide ? "wide-field" : ""}>
      <span>{text}</span>
      <input type={DATE_FIELDS.has(key) ? "date" : key === "amount" ? "number" : "text"} min={key === "amount" ? "0" : undefined} step={key === "amount" ? ".01" : undefined} value={data[key]} onChange={(e) => set({ [key]: e.target.value })} />
    </label>
  );

  return (
    <section className="business-module document-module">
      <div className="module-hero">
        <div><h2>Generador de documentos</h2><p>Elige el tipo, rellena con un proceso o una cirugía ya registrada y revisa la vista previa.</p></div>
        <div className="hero-actions">
          <button className="primary-button" onClick={downloadWord}>Descargar Word</button>
          {!isAuth && <button className="secondary-button" onClick={downloadPdf}>PDF</button>}
          <button className="secondary-button" onClick={() => { window.print(); log("Documento impreso"); }}>Imprimir</button>
        </div>
      </div>
      {history.length > 0 && (
        <details className="quote-memory">
          <summary><span>Archivo</span><strong>{history.length} documento(s) guardado(s)</strong></summary>
          <div className="quote-memory-list">
            {history.slice(0, 10).map((entry) => (
              <article key={entry.id}>
                <div><strong>{entry.data.number || "Sin número"}</strong><span>{TYPES[entry.data.type]?.label ?? "Documento"} · {entry.data.recipient || entry.data.institution || "Sin destinatario"}</span></div>
                <div className="memory-actions"><button onClick={() => restore(entry)}>Abrir</button><button className="memory-delete" onClick={() => deleteDoc(entry.id, entry.data.number)}>Eliminar</button></div>
              </article>
            ))}
          </div>
        </details>
      )}
      <div className="document-builder">
        <section className="business-card document-form">
          <label><span>Tipo de documento</span><select value={data.type} onChange={(e) => setType(e.target.value as DocType)}>{Object.entries(TYPES).map(([k, t]) => <option value={k} key={k}>{t.label}</option>)}</select><small className="field-hint">{TYPES[data.type].hint}</small></label>
          {(openTenders.length > 0 || cases.length > 0) && (
            <label><span>Rellenar con datos del sistema</span>
              <select value="" onChange={(e) => fromSource(e.target.value)}>
                <option value="">Elegir un proceso o una cirugía…</option>
                {openTenders.length > 0 && <optgroup label="Procesos en seguimiento">{openTenders.map((t) => <option key={t.id} value={`t:${t.id}`}>{t.ref} · {t.buyer || "sin entidad"}</option>)}</optgroup>}
                {!isAuth && cases.length > 0 && <optgroup label="Cirugías">{cases.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.patient || "Sin paciente"} · {c.hospital || "sin hospital"}</option>)}</optgroup>}
              </select>
            </label>
          )}
          {note && <p className="memory-confirmation" role="status">{note}</p>}
          {isAuth ? (
            <>
              <label><span>Membrete</span><select value={data.letterhead} onChange={(e) => set({ letterhead: e.target.value as DocData["letterhead"], signerRole: e.target.value === "volia" ? "REPRESENTANTE LEGAL" : "REPRESENTANTE" })}><option value="volia">Volia S.A.S. (nuestro logo y datos)</option><option value="otro">Otro emisor (fabricante o representante)</option></select></label>
              {!ownLetterhead && issuers.length > 0 && <label><span>Emisor anterior</span><select value="" onChange={(e) => applyIssuer(e.target.value)}><option value="">Reutilizar membrete y marcas…</option>{issuers.map((i) => <option key={i.issuer} value={i.issuer}>{i.issuer}</option>)}</select></label>}
              <div className="business-form two">
                {ownLetterhead ? <>{input("authorized", "Empresa que autorizamos", true)}{input("authorizedRuc", "RUC de esa empresa")}</> : input("issuer", "Quién emite (fabricante o representante)", true)}
                {input("institution", "Institución contratante")}
                {input("contract", "Código del proceso")}
                {input("productLine", "Línea de productos", true)}
                {input("validUntil", "Válida hasta")}
                {input("date", "Fecha de la carta")}
                {input("signer", "Quién firma")}
                {input("signerRole", "Cargo")}
              </div>
              <label><span>Marcas y registros sanitarios (una marca por línea)</span><textarea rows={4} placeholder={"MARCA | registro 1, registro 2"} value={data.brands} onChange={(e) => set({ brands: e.target.value })} /></label>
              <button type="button" className="secondary-button" onClick={fillRegistrations}>Buscar registros en Vigencias</button>
              {!ownLetterhead && <details className="form-more"><summary>Membrete del emisor</summary><div className="business-form two">{input("issuerAddress", "Dirección", true)}{input("issuerPhone", "Teléfono")}{input("issuerEmail", "Correo")}</div></details>}
              {missing.length > 0 && <p className="local-note">Falta: {missing.join(", ")}.</p>}
            </>
          ) : (
            <>
              <div className="business-form two">
                {input("number", "Número")}
                {input("date", "Fecha")}
                {FIELDS[data.type as Exclude<DocType, "authorization">].map(([k, t]) => input(k, t))}
                {input("subject", "Asunto", true)}
              </div>
              <label><span>Detalle, bienes, hallazgos o petición</span><textarea rows={7} placeholder="Escribe aquí el contenido específico. Puedes usar varias líneas." value={data.detail} onChange={(e) => set({ detail: e.target.value })} /></label>
            </>
          )}
          <p className="local-note">Borrador autoguardado en este dispositivo.</p>
        </section>
        {isAuth ? (
          <section className="generated-document letter" aria-label="Carta de autorización">
            <header>{ownLetterhead
              ? <div className="doc-brand"><img src={VOLIA_LOGO_DATA_URL} alt="Volia S.A.S." width="105" height="50" /><div><strong>{DEFAULT_COMPANY.name}</strong><small>{DEFAULT_COMPANY.address}</small><small>Telf: {DEFAULT_COMPANY.phone} · {DEFAULT_COMPANY.email}</small></div></div>
              : <div className="doc-brand"><div><strong>{data.issuer || "[Membrete del emisor]"}</strong>{data.issuerAddress && <small>{data.issuerAddress}</small>}{(data.issuerPhone || data.issuerEmail) && <small>{[data.issuerPhone && `Telf: ${data.issuerPhone}`, data.issuerEmail].filter(Boolean).join(" · ")}</small>}</div></div>}</header>
            <p>Quito, {letterDate(data.date)}</p>
            <div className="doc-addressee">{letter.salutation.slice(0, 3).map((l, i) => i === 1 ? <strong key={i}>{l}</strong> : <span key={i}>{l}</span>)}</div>
            <p>{letter.salutation[3]}</p>
            <p>{letter.intro}</p>
            <ul className="letter-brands">{letter.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
            {letter.closing.map((c) => <p key={c}>{c}</p>)}
            <div className="signature-space"><span>{letter.signoff[0]}</span><div></div><strong>{letter.signoff[1]}</strong><small>{letter.signoff[2]}</small></div>
            <footer><span>{ownLetterhead ? "Documento institucional de VOLIA S.A.S." : "Borrador preparado por VOLIA S.A.S. para la firma del emisor."}</span></footer>
          </section>
        ) : (
          <section className="generated-document" aria-label="Documento generado">
            <header>
              <div className="doc-brand"><img src={VOLIA_LOGO_DATA_URL} alt="Volia S.A.S." width="105" height="50" /><div><strong>VOLIA S.A.S.</strong><small>Insumos y equipos médico-quirúrgicos</small></div></div>
              <div className="doc-reference"><strong>{data.number || "SIN NÚMERO"}</strong><span>Quito, {data.date || "sin fecha"}</span></div>
            </header>
            <div className="doc-addressee"><strong>{data.recipient || "DESTINATARIO"}</strong><span>{data.role || "Cargo por definir"}</span><span>{data.institution || "Institución por definir"}</span></div>
            <p><strong>Asunto: {data.subject}</strong></p>
            <p>De mi consideración:</p>
            <p>{TYPES[data.type].intro}</p>
            {(data.patient || data.contract) && <div className="doc-data-grid"><div><span>Paciente</span><strong>{data.patient || "—"}</strong></div><div><span>CI / HCL</span><strong>{data.patientId || "—"} / {data.hcl || "—"}</strong></div><div><span>Fecha de cirugía</span><strong>{data.surgeryDate || "—"}</strong></div><div><span>Contrato / proceso</span><strong>{data.contract || "—"}</strong></div></div>}
            <div className="doc-body">{data.detail ? data.detail.split("\n").map((l, i) => <p key={i}>{l || <>&nbsp;</>}</p>) : <p className="placeholder-copy">Escribe el detalle del documento en el formulario.</p>}</div>
            {data.amount && <p><strong>Valor relacionado: USD {Number(data.amount).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>}
            <p>Particular que comunico para los fines pertinentes.</p>
            <div className="signature-space"><span>Atentamente,</span><div></div><strong>{data.signer}</strong><small>{data.signerRole}</small><small>VOLIA S.A.S.</small></div>
            <footer><span>Documento institucional de VOLIA S.A.S.</span><strong>Revisión y firma humana antes de su emisión</strong></footer>
          </section>
        )}
      </div>
    </section>
  );
}
