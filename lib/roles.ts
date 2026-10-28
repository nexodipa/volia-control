// Roles por correo. Todos pueden ver todo; quien esté en VOLIA_VIEWER_EMAILS es de "solo consulta":
// el servidor rechaza sus escrituras (datos compartidos, catálogo, vigencias, respaldo y correos).
// Sin la lista, todos son editores, igual que antes.
export type Role = "editor" | "viewer";

export function parseEmails(raw: string | undefined | null): string[] {
  return (raw ?? "").split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));
}

export function roleFor(email: string, viewersRaw: string | undefined | null): Role {
  return parseEmails(viewersRaw).includes(email.trim().toLowerCase()) ? "viewer" : "editor";
}

export const READ_ONLY_MESSAGE = "Su cuenta es de solo consulta: puede ver la información, pero no modificarla.";
