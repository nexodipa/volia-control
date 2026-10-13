// Extrae de un proceso OCDS (SERCOP) lo que sirve para inteligencia de precios:
// ítems por CPC, presupuesto referencial, adjudicaciones y proveedores ganadores.
// Subconjunto de OCDS 1.1 que se usa aquí; el resto de campos se ignora.
type OcdsValue = { amount?: number | string };
type OcdsItem = { id?: string; description?: string; quantity?: number | string; unit?: { name?: string; value?: OcdsValue }; classification?: { id?: string } };
type OcdsAward = { suppliers?: { name?: string }[]; items?: OcdsItem[]; value?: OcdsValue; date?: string };
export type OcdsRelease = {
  ocid?: string;
  date?: string;
  buyer?: { name?: string };
  tender?: { status?: string; procurementMethod?: string; procurementMethodDetails?: string; tenderPeriod?: { startDate?: string }; items?: OcdsItem[] };
  awards?: OcdsAward[];
};

export type MarketItem = {
  ocid: string;
  buyer: string;
  method: string;
  date: string;
  cpc: string;
  description: string;
  quantity: number | null;
  unit: string;
  referenceUnitPrice: number | null; // USD, del pliego
  awardedSupplier: string;
  awardedUnitPrice: number | null; // USD, de la adjudicación si existe por ítem
  status: string;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : null);

export function cpcMatches(cpc: string, prefixes: string[]) {
  const c = String(cpc || "").replace(/\D/g, "");
  return prefixes.some((p) => c.startsWith(p));
}

export function extractMarketItems(release: OcdsRelease, cpcPrefixes: string[]): MarketItem[] {
  const tender: NonNullable<OcdsRelease["tender"]> = release?.tender ?? {};
  const awards: OcdsAward[] = Array.isArray(release?.awards) ? release.awards : [];
  const base = {
    ocid: String(release?.ocid ?? ""),
    buyer: String(release?.buyer?.name ?? ""),
    method: String(tender.procurementMethodDetails ?? tender.procurementMethod ?? ""),
    date: String(release?.date ?? tender?.tenderPeriod?.startDate ?? "").slice(0, 10),
    status: String(tender.status ?? ""),
  };
  const out: MarketItem[] = [];
  const items: OcdsItem[] = Array.isArray(tender.items) ? tender.items : [];
  for (const item of items) {
    const cpc = String(item?.classification?.id ?? "");
    if (!cpcMatches(cpc, cpcPrefixes)) continue;
    let awardedSupplier = "";
    let awardedUnitPrice: number | null = null;
    for (const a of awards) {
      const match = (Array.isArray(a.items) ? a.items : []).find((ai) => ai.id === item.id || (ai.description && ai.description === item.description));
      if (match || awards.length === 1) {
        awardedSupplier = (Array.isArray(a.suppliers) ? a.suppliers : []).map((s) => s.name).filter(Boolean).join(" / ");
        awardedUnitPrice = num(match?.unit?.value?.amount);
        break;
      }
    }
    out.push({
      ...base,
      cpc,
      description: String(item?.description ?? "").trim(),
      quantity: num(item?.quantity),
      unit: String(item?.unit?.name ?? ""),
      referenceUnitPrice: num(item?.unit?.value?.amount),
      awardedSupplier,
      awardedUnitPrice,
    });
  }
  return out;
}

// ---- Nivel proceso: la mayoría de procesos 2026 no trae ítems, pero sí comprador, oferentes y ganador.
type OcdsParty = { name?: string };
type OcdsReleaseFull = OcdsRelease & {
  tender?: NonNullable<OcdsRelease["tender"]> & { title?: string; description?: string; value?: OcdsValue; tenderers?: OcdsParty[] };
  awards?: OcdsAward[];
};

export type ProcessSummary = {
  ocid: string;
  date: string;
  buyer: string;
  method: string;
  status: string;
  description: string;
  budget: number | null;
  tenderers: number;
  winners: string;
  awardedAmount: number | null;
  weBid: boolean;
  weWon: boolean;
};

const nameMatches = (name: string | undefined, ours: string) => !!name && name.toUpperCase().includes(ours.toUpperCase());

export function summarizeProcess(release: OcdsReleaseFull, ourName = "VOLIA"): ProcessSummary {
  const t = release?.tender ?? {};
  const awards = Array.isArray(release?.awards) ? release.awards : [];
  const winners = awards.flatMap((a) => (a.suppliers ?? []).map((s) => s.name ?? "")).filter(Boolean);
  const amounts = awards.map((a) => num(a.value?.amount)).filter((v): v is number => v !== null);
  const tenderers = Array.isArray(t.tenderers) ? t.tenderers : [];
  return {
    ocid: String(release?.ocid ?? ""),
    date: String(release?.date ?? "").slice(0, 10),
    buyer: String(release?.buyer?.name ?? ""),
    method: String(t.procurementMethodDetails ?? t.procurementMethod ?? ""),
    status: String(t.status ?? ""),
    description: String(t.description || t.title || "").replace(/\s+/g, " ").trim(),
    budget: num(t.value?.amount),
    tenderers: tenderers.length,
    winners: [...new Set(winners)].join(" / "),
    awardedAmount: amounts.length ? Math.round(amounts.reduce((s, v) => s + v, 0) * 100) / 100 : null,
    weBid: tenderers.some((p) => nameMatches(p.name, ourName)) || winners.some((w) => nameMatches(w, ourName)),
    weWon: winners.some((w) => nameMatches(w, ourName)),
  };
}

/** Procesos de insumos y dispositivos médicos, sin el catálogo electrónico de limpieza ni medicamentos. */
export const MEDICAL_PROCESS_PATTERN = /insumos? m[eé]dic|dispositivos? m[eé]dic|material (de )?curaci|guante|jeringa|gasa\b|mascarilla|papanicol|indicador(es)? (biol|qu[ií]mic)|osteos[ií]ntesis|traumatolog|ortop|pr[oó]tesis|implante/i;
/** Servicios (mantenimiento, auditoría, transporte…) no son mercado de Volia salvo que haya ofertado. */
const SERVICE_PATTERN = /^\s*(contrataci[oó]n (del|de) )?servicios?\b|auditor[ií]a|mantenimiento|consultor[ií]a|transporte|arrendamiento/i;

export function isRelevantProcess(release: OcdsReleaseFull, pattern = MEDICAL_PROCESS_PATTERN, ourName = "VOLIA") {
  const t = release?.tender ?? {};
  const method = String(t.procurementMethodDetails ?? "");
  if (/cat[aá]logo electr[oó]nico/i.test(method) && /limpieza|medicamentos/i.test(method)) return false;
  const s = summarizeProcess(release, ourName);
  if (s.weBid) return true;
  const text = `${t.title ?? ""} ${t.description ?? ""}`;
  return pattern.test(text) && !SERVICE_PATTERN.test(t.description || t.title || "");
}
