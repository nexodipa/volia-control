"use client";

import { useEffect, useMemo, useState } from "react";
import { buyerProfile, pricingRisk, type MarketProcess } from "../lib/market";

const DATA_URL = "/data/mercado-sercop-2026.json";
let cache: Promise<MarketProcess[]> | null = null;
const loadMarket = () => (cache ??= fetch(DATA_URL, { cache: "force-cache" }).then((r) => (r.ok ? r.json() : { processes: [] })).then((d) => d.processes ?? []).catch(() => []));
const money = (v: number) => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

/** Contexto de mercado para la entidad de la cotización. No muestra nada si no hay datos de esa entidad. */
export default function MarketHint({ buyers, marginPct }: { buyers: string[]; marginPct: number }) {
  const [processes, setProcesses] = useState<MarketProcess[]>([]);
  useEffect(() => { let alive = true; void loadMarket().then((p) => { if (alive) setProcesses(p); }); return () => { alive = false; }; }, []);
  const key = buyers.join("|");
  const profile = useMemo(() => key.split("|").map((b) => buyerProfile(processes, b)).find(Boolean) ?? null, [processes, key]);
  if (!profile) return null;
  const risk = pricingRisk(marginPct, profile.avgTenderers);
  return <div className={`market-hint ${risk ? `risk-${risk.level}` : ""}`} role="note">
    <strong>Mercado SERCOP 2026 · {profile.buyers.length === 1 ? profile.buyers[0] : `${profile.buyers.length} entidades coinciden`}</strong>
    <span>{profile.processes} procesos del rubro · {profile.avgTenderers ?? "—"} oferentes promedio · Volia ofertó en {profile.ourBids} y ganó {profile.ourWins}.</span>
    {profile.topWinners.length > 0 && <span>Suelen ganar: {profile.topWinners.map((w) => `${w.name} (${money(w.amount)})`).join("; ")}.</span>}
    {risk && <span className="market-hint-risk">{risk.message}</span>}
  </div>;
}
