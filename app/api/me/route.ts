import { apiJson, requireBusinessAccess } from "../../../lib/server-auth";

export const dynamic = "force-dynamic";

// Quién es el usuario y qué puede hacer: la pantalla lo usa para avisar del modo de solo consulta.
export async function GET() {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  return apiJson({ email: access.email, role: access.role });
}
