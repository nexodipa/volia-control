// Utilidades compartidas por las rutas /api/* que leen o escriben la base de negocio (D1).
// Misma regla que /api/sync: usuario autenticado y presente en VOLIA_ALLOWED_OWNER_IDS.
import { NextResponse } from "next/server";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { READ_ONLY_MESSAGE, roleFor, type Role } from "./roles";

// Interfaz mínima de D1 que usan estas rutas (el proyecto no incluye los tipos de Cloudflare).
export interface BusinessStatement {
  bind(...values: unknown[]): BusinessStatement;
  all<T>(): Promise<{ results: T[] }>;
}
export interface BusinessDb {
  prepare(query: string): BusinessStatement;
  batch(statements: BusinessStatement[]): Promise<unknown>;
}

export function apiJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" } });
}

export function getBusinessDatabase() {
  return (globalThis as typeof globalThis & { __VOLIA_DB__?: BusinessDb }).__VOLIA_DB__;
}

async function ownerIdFor(email: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`volia-cloud:${email.trim().toLowerCase()}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function allowed(ownerId: string) {
  const configured = (globalThis as typeof globalThis & { __VOLIA_ALLOWED_OWNER_IDS__?: string }).__VOLIA_ALLOWED_OWNER_IDS__;
  return !!configured && configured.split(",").map((v) => v.trim()).filter(Boolean).includes(ownerId);
}

export const viewerEmails = () => (globalThis as typeof globalThis & { __VOLIA_ROLES__?: { viewers?: string } }).__VOLIA_ROLES__?.viewers;

/** Devuelve el contexto autorizado o una respuesta de error lista para retornar. */
export async function requireBusinessAccess(): Promise<{ db: BusinessDb; email: string; role: Role } | Response> {
  const user = await getChatGPTUser();
  if (!user) return apiJson({ error: "Inicie sesión para acceder a los datos.", code: "AUTH_REQUIRED" }, 401);
  if (!allowed(await ownerIdFor(user.email))) return apiJson({ error: "Su cuenta todavía no está autorizada." }, 403);
  const db = getBusinessDatabase();
  if (!db) return apiJson({ error: "La base de datos no está disponible." }, 503);
  return { db, email: user.email, role: roleFor(user.email, viewerEmails()) };
}

/** Igual que requireBusinessAccess, pero rechaza a las cuentas de solo consulta. Úsese en toda escritura. */
export async function requireEditorAccess(): Promise<{ db: BusinessDb; email: string; role: Role } | Response> {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  if (access.role === "viewer") return apiJson({ error: READ_ONLY_MESSAGE, code: "READ_ONLY" }, 403);
  return access;
}
