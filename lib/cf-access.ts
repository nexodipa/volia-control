// Verificación del token de Cloudflare Access (cabecera Cf-Access-Jwt-Assertion), RS256 contra el JWKS del equipo.
// Sin dependencias: usa Web Crypto, disponible en Workers y en Node 22.

export type AccessConfig = { teamDomain: string; aud: string };
type Jwk = JsonWebKey & { kid?: string };
type JwksFetcher = (url: string) => Promise<{ keys: Jwk[] }>;

const textDecoder = new TextDecoder();
const b64urlToBytes = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const decodeJson = (s: string) => JSON.parse(textDecoder.decode(b64urlToBytes(s)));

let cache: { url: string; at: number; keys: Jwk[] } | null = null;
const defaultFetcher: JwksFetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS ${res.status}`);
  return res.json();
};

export function normalizeTeamDomain(teamDomain: string) {
  const d = teamDomain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return d.includes(".") ? d : `${d}.cloudflareaccess.com`;
}

/** Devuelve el correo del usuario si el token es válido para este equipo y aplicación; null en cualquier otro caso. */
export async function verifyAccessJwt(token: string | null, config: AccessConfig, opts: { now?: number; fetchJwks?: JwksFetcher } = {}): Promise<string | null> {
  if (!token || !config.teamDomain || !config.aud) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = decodeJson(parts[0]);
    const payload = decodeJson(parts[1]);
    if (header.alg !== "RS256" || !header.kid) return null;
    const domain = normalizeTeamDomain(config.teamDomain);
    const now = Math.floor((opts.now ?? Date.now()) / 1000);
    const audOk = Array.isArray(payload.aud) ? payload.aud.includes(config.aud) : payload.aud === config.aud;
    if (!audOk || payload.iss !== `https://${domain}` || typeof payload.exp !== "number" || payload.exp < now || (typeof payload.nbf === "number" && payload.nbf > now + 60)) return null;
    if (typeof payload.email !== "string" || !payload.email.includes("@")) return null;

    const url = `https://${domain}/cdn-cgi/access/certs`;
    const fetcher = opts.fetchJwks ?? defaultFetcher;
    const fresh = cache && cache.url === url && Date.now() - cache.at < 3_600_000 && cache.keys.some((k) => k.kid === header.kid);
    if (!fresh) cache = { url, at: Date.now(), keys: (await fetcher(url)).keys ?? [] };
    const jwk = cache!.keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    return valid ? payload.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

export function resetAccessCache() { cache = null; }
