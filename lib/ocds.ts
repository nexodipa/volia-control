// Extrae de un proceso OCDS (SERCOP) lo que sirve para inteligencia de precios:
// ítems por CPC, presupuesto referencial, adjudicaciones y proveedores ganadores.
// Subconjunto de OCDS 1.1 que se usa aquí; el resto de campos se ignora.
type OcdsValue = { amount?: number | string };
type OcdsItem = { id?: string; description?: string; quantity?: number | string; unit?: { name?: string; value?: OcdsValue }; classification?: { id?: string } };
type OcdsAward = { suppliers?: { name?: string }[]; items?: OcdsItem[] };
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
