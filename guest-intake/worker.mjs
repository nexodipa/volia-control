const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 32 * 1024;
const FILE_TTL_SECONDS = 7 * 24 * 60 * 60;
const SESSION_SECONDS = 6 * 60 * 60;
const enc = new TextEncoder();

function htmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function response(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      ...extra,
    },
  });
}

function page(title, content) {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title)} · Volia</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f2f6f5;color:#14302c;font:16px/1.5 system-ui,sans-serif}main{max-width:700px;margin:5vh auto;padding:24px}header{display:flex;align-items:center;gap:12px;margin-bottom:28px}mark{background:#0d6153;color:white;border-radius:14px;padding:10px 13px;font-weight:800;letter-spacing:.05em}h1{font-size:clamp(1.8rem,5vw,2.6rem);line-height:1.15;margin:0 0 12px}h2{font-size:1.15rem;margin:0}p{margin:0 0 18px}section{background:white;border:1px solid #dae5e1;border-radius:20px;padding:24px;box-shadow:0 12px 35px #103d3210}label{display:block;font-weight:650;margin:18px 0 6px}input{width:100%;font:inherit;border:1px solid #9fbab2;border-radius:10px;padding:12px;background:white}input[type=file]{padding:16px}button{font:inherit;font-weight:700;background:#0d6153;color:white;border:0;border-radius:11px;padding:13px 20px;cursor:pointer;margin-top:22px}button:hover{background:#084c41}small{display:block;color:#526d65;margin-top:10px}a{color:#075b4d}ul{padding-left:20px}li{padding:8px 0;border-bottom:1px solid #e6efec;word-break:break-word}.pill{display:inline-block;padding:3px 8px;background:#e4f4ef;border-radius:7px}.error{color:#a32d24;font-weight:650}</style><main><header><mark>VOLIA</mark><span>Recepción de pruebas</span></header><section>${content}</section><small>Volia S.A.S. · Espacio de pruebas separado del sistema interno</small></main></html>`;
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message))));
}

export async function makeInvite(secret, expiresAt) {
  return `${expiresAt}.${await hmac(secret, `invite:${expiresAt}`)}`;
}

async function validInvite(token, secret) {
  if (!secret || !/^\d{10}\.[A-Za-z0-9_-]{43}$/.test(token ?? "")) return false;
  const [expiry] = token.split(".");
  if (+expiry <= Math.floor(Date.now() / 1000) || +expiry > Math.floor(Date.now() / 1000) + 7 * 86400) return false;
  return token === await makeInvite(secret, expiry);
}

async function validSession(request, secret) {
  const token = request.headers.get("Cookie")?.match(/(?:^|;\s*)volia_test_admin=([^;]+)/)?.[1];
  if (!token || !/^\d{10}\.[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const [expiry, signature] = token.split(".");
  return +expiry > Math.floor(Date.now() / 1000) && signature === await hmac(secret, `admin:${expiry}`);
}

function kind(bytes, type) {
  if (type === "application/pdf" && bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70) return ["pdf", "application/pdf"];
  if (type === "image/png" && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return ["png", "image/png"];
  if (type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return ["jpg", "image/jpeg"];
  if (["text/plain", "text/csv"].includes(type) && !bytes.includes(0)) return [type === "text/csv" ? "csv" : "txt", type];
  return null;
}

async function limitedBody(request) {
  const length = +(request.headers.get("Content-Length") ?? 0);
  if (length > MAX_REQUEST_BYTES) return null;
  const chunks = [];
  let total = 0;
  const reader = request.body?.getReader();
  if (!reader) return null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

function fileName(name) {
  return String(name).replace(/[\\/";\x00-\x1f\x7f]/g, "_").slice(0, 100) || "archivo";
}

async function handleUpload(request, env) {
  const body = await limitedBody(request);
  if (!body) return response(page("Archivo grande", "<h1>Archivo demasiado grande</h1><p>El límite de esta prueba es 2 MB por archivo.</p>"), 413);
  let form;
  try { form = await new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("Content-Type") ?? "" }, body }).formData(); }
  catch { return response("Formulario inválido.", 400); }
  const invite = String(form.get("invite") ?? "");
  if (!await validInvite(invite, env.INVITE_SECRET)) return response("Enlace vencido o inválido.", 403);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size || file.size > MAX_FILE_BYTES) return response(page("Archivo inválido", "<h1>Archivo inválido</h1><p>Seleccione un PDF, JPG, PNG, TXT o CSV de hasta 2 MB.</p>"), 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = kind(bytes, file.type);
  if (!checked) return response(page("Formato inválido", "<h1>Formato no admitido</h1><p>Use PDF, JPG, PNG, TXT o CSV. No se aceptan archivos ejecutables.</p>"), 400);
  const id = crypto.randomUUID();
  const label = String(form.get("label") ?? "").trim().slice(0, 80);
  const meta = { id, name: fileName(file.name), label, size: file.size, type: checked[1], at: new Date().toISOString() };
  await env.UPLOADS.put(`file:${id}`, bytes.buffer, { expirationTtl: FILE_TTL_SECONDS });
  await env.UPLOADS.put(`submission:${id}`, JSON.stringify(meta), { expirationTtl: FILE_TTL_SECONDS });
  return response(page("Recibido", `<h1>Archivo recibido</h1><p>Volia ya tiene el archivo en su bandeja de pruebas.</p><p>Comprobante: <strong>${id}</strong></p><p>Se conservará durante 7 días para esta prueba.</p>`), 201);
}

async function handleAdmin(request, env, url) {
  if (url.pathname === "/admin/login" && request.method === "POST") {
    const body = await limitedBody(request);
    if (!body || body.byteLength > 4096) return response("Formulario inválido.", 400);
    const form = await new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("Content-Type") ?? "" }, body }).formData();
    if (String(form.get("password") ?? "") !== env.ADMIN_PASSWORD) return response(page("Acceso", "<h1>Clave incorrecta</h1><p>Vuelva a intentarlo.</p>"), 401);
    const expiry = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    const cookie = `${expiry}.${await hmac(env.ADMIN_PASSWORD, `admin:${expiry}`)}`;
    return response("", 303, { Location: "/admin", "Set-Cookie": `volia_test_admin=${cookie}; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict; Path=/admin` });
  }
  if (!await validSession(request, env.ADMIN_PASSWORD)) return response(page("Bandeja privada", '<h1>Bandeja de pruebas</h1><p>Acceso exclusivo para Volia.</p><form action="/admin/login" method="post"><label for="password">Clave de administrador</label><input id="password" name="password" type="password" autocomplete="current-password" required><button>Entrar</button></form>'), 401);
  if (url.pathname.startsWith("/admin/file/")) {
    const id = url.pathname.slice("/admin/file/".length);
    if (!/^[a-f0-9-]{36}$/.test(id)) return response("No encontrado.", 404);
    const meta = await env.UPLOADS.get(`submission:${id}`, "json");
    const file = await env.UPLOADS.get(`file:${id}`, "arrayBuffer");
    if (!meta || !file) return response("Archivo vencido o no encontrado.", 404);
    return new Response(file, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${fileName(meta.name)}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
  }
  const keys = await env.UPLOADS.list({ prefix: "submission:", limit: 100 });
  const entries = (await Promise.all(keys.keys.map((key) => env.UPLOADS.get(key.name, "json")))).filter(Boolean).sort((a, b) => b.at.localeCompare(a.at));
  const list = entries.length ? `<ul>${entries.map((item) => `<li><a href="/admin/file/${item.id}">${htmlEscape(item.name)}</a> <span class="pill">${Math.ceil(item.size / 1024)} KB</span><br><small>${htmlEscape(item.label || "Sin etiqueta")} · ${htmlEscape(item.at)} · ${htmlEscape(item.id)}</small></li>`).join("")}</ul>` : "<p>Aún no hay archivos recibidos.</p>";
  return response(page("Bandeja privada", `<h1>Archivos recibidos</h1><p>Recepción de pruebas de Volia. Los archivos se eliminan automáticamente a los 7 días.</p>${list}`));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/admin")) return await handleAdmin(request, env, url);
      if (url.pathname === "/submit" && request.method === "POST") return await handleUpload(request, env);
      if (url.pathname !== "/" || request.method !== "GET") return response("No encontrado.", 404);
      const token = url.searchParams.get("t");
      if (!await validInvite(token, env.INVITE_SECRET)) return response(page("Enlace no disponible", "<h1>Enlace vencido o inválido</h1><p>Pida a Volia un enlace nuevo para la prueba.</p>"), 403);
      return response(page("Enviar archivo", `<h1>Enviar un archivo a Volia</h1><p>Esta es una prueba de recepción. Suba solo un archivo de ejemplo, sin datos de pacientes ni información confidencial.</p><form action="/submit" method="post" enctype="multipart/form-data"><input type="hidden" name="invite" value="${htmlEscape(token)}"><label for="label">Etiqueta opcional</label><input id="label" name="label" maxlength="80" placeholder="Ej. prueba desde celular"><label for="file">Archivo</label><input id="file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.txt,.csv" required><small>PDF, JPG, PNG, TXT o CSV · Máximo 2 MB · Disponible durante 7 días</small><button>Enviar archivo</button></form>`));
    } catch {
      return response(page("Error temporal", "<h1>No se pudo completar</h1><p>Inténtelo de nuevo más tarde.</p>"), 500);
    }
  },
};
