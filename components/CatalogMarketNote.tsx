"use client";

import { costAboveMarket, marketReference, type PriceData } from "../lib/price-intel";

/** Nota bajo cada producto del catálogo: precio de mercado y alerta si el costo ya lo supera. */
export default function CatalogMarketNote({ description, unitCost, data }: { description: string; unitCost: number; data: PriceData | null }) {
  if (!data) return null;
  const ref = marketReference(description, data);
  if (!ref) return null;
  const usd = (v: number) => `$${v < 1 ? v.toFixed(4) : v.toFixed(2)}`;
  const alert = costAboveMarket(unitCost, ref);
  return <small className={`catalog-market ${alert ? "alert" : ""}`}>{alert ? "Costo sobre el mercado: " : "Mercado: "}{usd(ref.price)} ({ref.detail}).{alert ? " Busque otro proveedor antes de cotizar este producto." : ""}</small>;
}
