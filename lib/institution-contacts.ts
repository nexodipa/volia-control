// Responsable de cada institución (hospital, GAD…) en cada periodo: a quién se dirigen las cartas y los
// cobros de una cirugía según su fecha. Funciones puras para poder probarlas sin navegador.

export type InstitutionContact = {
  id: string;
  institution: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  /** Primer día en que ejerce (AAAA-MM-DD); vacío = desde siempre. */
  from: string;
  /** Último día en que ejerce; vacío = sigue en el cargo. */
  to: string;
  notes: string;
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function normalizeContact(raw: unknown): InstitutionContact | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id, 80);
  const institution = text(r.institution, 200);
  if (!id || !institution) return null;
  return { id, institution, name: text(r.name, 120), role: text(r.role, 120), phone: text(r.phone, 40), email: text(r.email, 120), from: isoDate(r.from), to: isoDate(r.to), notes: text(r.notes, 400) };
}

/** Misma institución aunque cambie el orden de palabras, las tildes o se abrevie ("Hospital General Ibarra" ~ "HOSPITAL GENERAL IBARRA"). */
export function sameInstitution(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const short = x.length <= y.length ? x : y, long = short === x ? y : x;
  return short.length >= 8 && long.includes(short);
}

/** Quién era responsable de la institución en esa fecha: coincide el periodo y, si hay varios, gana el que empezó más tarde. */
export function findResponsible(contacts: InstitutionContact[], institution: string, date: string): InstitutionContact | null {
  if (!institution.trim()) return null;
  const fits = contacts.filter((c) => sameInstitution(c.institution, institution) && (!date || ((!c.from || c.from <= date) && (!c.to || c.to >= date))));
  return fits.sort((a, b) => (b.from || "").localeCompare(a.from || ""))[0] ?? null;
}

/** Texto corto para mostrar en la ficha de una cirugía. */
export function responsibleSummary(contact: InstitutionContact | null, institution: string, date: string): { name: string; detail: string; matched: boolean } {
  if (!date) return { name: "Pendiente", detail: "Ingresa la fecha de la cirugía", matched: false };
  if (!contact) return { name: "Sin registrar", detail: institution ? "Añade el responsable de esta institución" : "Indica el hospital", matched: false };
  return { name: contact.name || "Sin nombre", detail: [contact.role, contact.phone, contact.email].filter(Boolean).join(" · "), matched: true };
}

/** Contactos de una institución, el vigente primero y luego los anteriores del más reciente al más antiguo. */
export function contactsFor(contacts: InstitutionContact[], institution: string, today: string): InstitutionContact[] {
  const mine = contacts.filter((c) => sameInstitution(c.institution, institution));
  const current = (c: InstitutionContact) => (!c.from || c.from <= today) && (!c.to || c.to >= today);
  return mine.sort((a, b) => Number(current(b)) - Number(current(a)) || (b.from || "").localeCompare(a.from || ""));
}
