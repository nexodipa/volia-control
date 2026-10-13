import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { verifyAccessJwt } from "../lib/cf-access";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER =
  "oai-authenticated-user-full-name-encoding";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";

type AuthRuntime = { mode?: string; teamDomain?: string; aud?: string };

/**
 * Modo de autenticación según dónde corre la app:
 * - "cloudflare-access": solo se acepta el token firmado de Cloudflare Access (las cabeceras oai-* se ignoran,
 *   porque en Cloudflare cualquiera podría enviarlas a mano).
 * - "openai": cabeceras que inyecta el hosting de OpenAI.
 * Cualquier otro valor rechaza a todos (falla cerrado).
 */
export function authMode(): string {
  const auth = (globalThis as typeof globalThis & { __VOLIA_AUTH__?: AuthRuntime }).__VOLIA_AUTH__ ?? {};
  return auth.mode?.trim() || (auth.aud ? "cloudflare-access" : "openai");
}

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const requestHeaders = await headers();
  const mode = authMode();
  if (mode === "cloudflare-access") {
    const auth = (globalThis as typeof globalThis & { __VOLIA_AUTH__?: AuthRuntime }).__VOLIA_AUTH__ ?? {};
    const accessEmail = await verifyAccessJwt(requestHeaders.get("cf-access-jwt-assertion"), { teamDomain: auth.teamDomain ?? "", aud: auth.aud ?? "" });
    return accessEmail ? { displayName: accessEmail, email: accessEmail, fullName: null } : null;
  }
  if (mode !== "openai") return null;
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!email) return null;

  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName =
    encodedFullName &&
    requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === PERCENT_ENCODED_UTF8
      ? safeDecodeURIComponent(encodedFullName)
      : null;

  return {
    displayName: fullName ?? email,
    email,
    fullName,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
