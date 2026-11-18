// Traspaso de un correo de cotización al cotizador: la bandeja deja los renglones en sessionStorage (solo en esta pestaña)
// y el cotizador los lee al abrir, los muestra en el importador de requerimientos y los borra. Nada sale del navegador.
export type QuoteHandoff = { customer: string; subject: string; text: string; count: number };

const KEY = "volia-correo-cotizacion-v1";

export function setQuoteHandoff(customer: string, subject: string, items: { text: string; quantity: number }[]): void {
  try {
    const handoff: QuoteHandoff = { customer: customer.slice(0, 120), subject: subject.slice(0, 160), text: items.map((i) => `${i.quantity} ${i.text}`).join("\n"), count: items.length };
    sessionStorage.setItem(KEY, JSON.stringify(handoff));
  } catch { /* sin almacenamiento de sesión: el botón no hace nada */ }
}

export function peekQuoteHandoff(): QuoteHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as Partial<QuoteHandoff>;
    return typeof h.text === "string" && h.text ? { customer: String(h.customer ?? ""), subject: String(h.subject ?? ""), text: h.text, count: Number(h.count) || 0 } : null;
  } catch { return null; }
}

export function clearQuoteHandoff(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* nada que borrar */ }
}
