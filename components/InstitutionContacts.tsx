"use client";

import { useMemo, useState } from "react";
import { businessIsoDate } from "../lib/date-utils";
import { contactsFor, type InstitutionContact } from "../lib/institution-contacts";

const blank = (institution = ""): InstitutionContact => ({ id: "", institution, name: "", role: "", phone: "", email: "", from: "", to: "", notes: "" });
const uid = () => `ic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Directorio de responsables por institución y periodo. Se comparte entre equipos como el resto de los registros.
export default function InstitutionContacts({ contacts, onChange, institutions }: { contacts: InstitutionContact[]; onChange: (next: InstitutionContact[]) => void; institutions: string[] }) {
  const [draft, setDraft] = useState<InstitutionContact>(blank());
  const [open, setOpen] = useState(false);
  const today = businessIsoDate();
  const groups = useMemo(() => {
    const names = [...new Set(contacts.map((c) => c.institution))].sort((a, b) => a.localeCompare(b, "es"));
    return names.map((name) => ({ name, list: contactsFor(contacts, name, today) }));
  }, [contacts, today]);
  const options = useMemo(() => [...new Set([...institutions, ...contacts.map((c) => c.institution)])].filter(Boolean).sort((a, b) => a.localeCompare(b, "es")), [institutions, contacts]);
  const set = (patch: Partial<InstitutionContact>) => setDraft((d) => ({ ...d, ...patch }));
  const valid = draft.institution.trim() && draft.name.trim();
  const save = () => {
    if (!valid) return;
    const entry = { ...draft, id: draft.id || uid() };
    onChange(draft.id ? contacts.map((c) => (c.id === entry.id ? entry : c)) : [entry, ...contacts]);
    setDraft(blank(entry.institution));
  };
  const remove = (c: InstitutionContact) => { if (window.confirm(`¿Quitar a ${c.name || "este responsable"} de ${c.institution}?`)) onChange(contacts.filter((x) => x.id !== c.id)); };

  return (
    <details className="business-card contacts-panel" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary><strong>Responsables por institución</strong> <span className="module-note">{contacts.length ? `${contacts.length} registrado(s)` : "Aún no hay ninguno"}</span></summary>
      <p className="module-note">Quién atiende los cobros en cada hospital y desde cuándo. La ficha de cada cirugía usa su fecha para mostrar al responsable que correspondía, y Documentos lo pone como destinatario.</p>
      <div className="business-form two">
        <label><span>Institución</span><input list="contact-institutions" value={draft.institution} onChange={(e) => set({ institution: e.target.value })} /></label>
        <label><span>Nombre</span><input value={draft.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label><span>Cargo</span><input value={draft.role} onChange={(e) => set({ role: e.target.value })} placeholder="Administrador, Gerente, Financiero…" /></label>
        <label><span>Teléfono</span><input value={draft.phone} onChange={(e) => set({ phone: e.target.value })} /></label>
        <label><span>Correo</span><input type="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} /></label>
        <label><span>En el cargo desde</span><input type="date" value={draft.from} onChange={(e) => set({ from: e.target.value })} /></label>
        <label><span>Hasta (vacío si sigue)</span><input type="date" value={draft.to} onChange={(e) => set({ to: e.target.value })} /></label>
      </div>
      <datalist id="contact-institutions">{options.map((o) => <option key={o} value={o} />)}</datalist>
      <div className="inline-actions">
        <button type="button" className="primary-button" onClick={save} disabled={!valid}>{draft.id ? "Guardar cambios" : "Añadir responsable"}</button>
        {draft.id && <button type="button" className="secondary-button" onClick={() => setDraft(blank())}>Cancelar</button>}
      </div>
      {groups.map((g) => (
        <div key={g.name} className="contact-group">
          <h4>{g.name}</h4>
          <ul>
            {g.list.map((c) => (
              <li key={c.id}>
                <span><strong>{c.name}</strong> · {c.role || "sin cargo"}{c.phone ? ` · ${c.phone}` : ""}{c.email ? ` · ${c.email}` : ""}<small>{c.from || "siempre"} → {c.to || "actualidad"}</small></span>
                <span className="memory-actions"><button type="button" onClick={() => { setDraft(c); setOpen(true); }}>Editar</button><button type="button" className="memory-delete" onClick={() => remove(c)}>Quitar</button></span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </details>
  );
}
