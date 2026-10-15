import assert from "node:assert/strict";
import { test } from "node:test";
import worker, { makeInvite } from "./worker.mjs";

const origin = "https://volia-recepcion.example.test";
const secret = "test-invite-secret-with-enough-entropy";
const admin = "test-admin-password-with-enough-entropy";

function env() {
  const data = new Map();
  return {
    INVITE_SECRET: secret,
    ADMIN_PASSWORD: admin,
    UPLOADS: {
      async put(key, value) { data.set(key, value); },
      async get(key, format) { const value = data.get(key); return value === undefined ? null : format === "json" ? JSON.parse(value) : format === "arrayBuffer" ? value : value; },
      async list({ prefix }) { return { keys: [...data.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })) }; },
    },
  };
}

function post(path, form) {
  return new Request(`${origin}${path}`, { method: "POST", headers: { Origin: origin }, body: form });
}

test("un invitado envía un archivo y solo la bandeja autenticada puede descargarlo", async () => {
  const store = env();
  const token = await makeInvite(secret, Math.floor(Date.now() / 1000) + 3600);
  assert.equal((await worker.fetch(new Request(`${origin}/?t=${token}`), store)).status, 200);
  assert.equal((await worker.fetch(new Request(`${origin}/admin`), store)).status, 401);

  const form = new FormData();
  form.set("invite", token);
  form.set("label", "Prueba externa");
  form.set("file", new File(["hola volia"], "ejemplo.txt", { type: "text/plain" }));
  const uploaded = await worker.fetch(post("/submit", form), store);
  assert.equal(uploaded.status, 201);
  const confirmation = await uploaded.text();
  assert.match(confirmation, /Archivo:<\/strong> ejemplo\.txt/);
  const receipt = confirmation.match(/Comprobante: <strong>([a-f0-9-]{36})<\/strong>/)?.[1];
  assert.ok(receipt);
  assert.equal((await worker.fetch(new Request(`${origin}/admin/file/${receipt}`), store)).status, 401);

  const login = new FormData();
  login.set("password", admin);
  const signedIn = await worker.fetch(post("/admin/login", login), store);
  assert.equal(signedIn.status, 303);
  const cookie = signedIn.headers.get("Set-Cookie")?.split(";")[0];
  assert.ok(cookie);
  const inbox = await worker.fetch(new Request(`${origin}/admin`, { headers: { Cookie: cookie } }), store);
  assert.match(await inbox.text(), /Descargar archivo original/);
  const file = await worker.fetch(new Request(`${origin}/admin/file/${receipt}`, { headers: { Cookie: cookie } }), store);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("Content-Disposition"), 'attachment; filename="ejemplo.txt"');
  assert.equal(await file.text(), "hola volia");
});

test("el PDF descargado conserva exactamente los bytes del original", async () => {
  const store = env();
  const token = await makeInvite(secret, Math.floor(Date.now() / 1000) + 3600);
  const bytes = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 52, 10, 0, 1, 255, 254, 128]);
  const form = new FormData();
  form.set("invite", token);
  form.set("file", new File([bytes], "original.pdf", { type: "application/pdf" }));
  const uploaded = await worker.fetch(post("/submit", form), store);
  assert.equal(uploaded.status, 201);
  const id = (await uploaded.text()).match(/Comprobante: <strong>([a-f0-9-]{36})<\/strong>/)?.[1];
  const login = new FormData();
  login.set("password", admin);
  const session = await worker.fetch(post("/admin/login", login), store);
  const cookie = session.headers.get("Set-Cookie")?.split(";")[0];
  const download = await worker.fetch(new Request(`${origin}/admin/file/${id}`, { headers: { Cookie: cookie } }), store);
  assert.equal(download.status, 200);
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), bytes);
});

test("un Word DOCX con MIME genérico llega intacto y conserva su nombre", async () => {
  const store = env();
  const token = await makeInvite(secret, Math.floor(Date.now() / 1000) + 3600);
  const bytes = Uint8Array.from([80, 75, 3, 4, 20, 0, 0, 0, 4, 8, 255]);
  const form = new FormData();
  form.set("invite", token);
  form.set("file", new File([bytes], "documento-original.docx", { type: "application/octet-stream" }));
  const uploaded = await worker.fetch(post("/submit", form), store);
  assert.equal(uploaded.status, 201);
  const confirmation = await uploaded.text();
  assert.match(confirmation, /documento-original\.docx/);
  const id = confirmation.match(/Comprobante: <strong>([a-f0-9-]{36})<\/strong>/)?.[1];
  const login = new FormData();
  login.set("password", admin);
  const session = await worker.fetch(post("/admin/login", login), store);
  const cookie = session.headers.get("Set-Cookie")?.split(";")[0];
  const download = await worker.fetch(new Request(`${origin}/admin/file/${id}`, { headers: { Cookie: cookie } }), store);
  assert.equal(download.headers.get("Content-Disposition"), 'attachment; filename="documento-original.docx"');
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), bytes);
});

test("rechaza invitaciones falsas y archivos ejecutables aunque vengan de otro origen", async () => {
  const store = env();
  assert.equal((await worker.fetch(new Request(`${origin}/?t=falso`), store)).status, 403);
  const token = await makeInvite(secret, Math.floor(Date.now() / 1000) + 3600);
  const form = new FormData();
  form.set("invite", token);
  form.set("file", new File(["MZ"], "programa.exe", { type: "application/octet-stream" }));
  assert.equal((await worker.fetch(post("/submit", form), store)).status, 400);
  const outside = new Request(`${origin}/submit`, { method: "POST", headers: { Origin: "https://ajeno.test" }, body: form });
  assert.equal((await worker.fetch(outside, store)).status, 400);
});

test("acepta un navegador que no envía encabezado Origin", async () => {
  const store = env();
  const token = await makeInvite(secret, Math.floor(Date.now() / 1000) + 3600);
  const form = new FormData();
  form.set("invite", token);
  form.set("file", new File(["ejemplo"], "ejemplo.txt", { type: "text/plain" }));
  const result = await worker.fetch(new Request(`${origin}/submit`, { method: "POST", body: form }), store);
  assert.equal(result.status, 201);
});
