// Cliente genérico para rutas /api/* de listas (GET / PUT de cambios / DELETE por código). Nunca lanza.
export type ApiResult<T> = { ok: true; data: T } | { ok: false; reason: string };

async function reason(res: Response) {
  try { const body = await res.json(); if (body?.error) return String(body.error); } catch { /* sin cuerpo JSON */ }
  return `Error ${res.status}`;
}

export async function pullList<T>(endpoint: string, field: string): Promise<ApiResult<T[]>> {
  try {
    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) return { ok: false, reason: await reason(res) };
    const body = await res.json();
    return Array.isArray(body?.[field]) ? { ok: true, data: body[field] } : { ok: false, reason: "Respuesta inesperada del servidor." };
  } catch { return { ok: false, reason: "Sin conexión con el servidor." }; }
}

export async function pushList<T>(endpoint: string, field: string, items: T[]): Promise<ApiResult<number>> {
  try {
    const res = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: items }) });
    if (!res.ok) return { ok: false, reason: await reason(res) };
    return { ok: true, data: Number((await res.json())?.saved) || 0 };
  } catch { return { ok: false, reason: "Sin conexión con el servidor." }; }
}

export async function deleteItem(endpoint: string, code: string): Promise<ApiResult<string>> {
  try {
    const res = await fetch(`${endpoint}?code=${encodeURIComponent(code)}`, { method: "DELETE" });
    return res.ok ? { ok: true, data: code } : { ok: false, reason: await reason(res) };
  } catch { return { ok: false, reason: "Sin conexión con el servidor." }; }
}
