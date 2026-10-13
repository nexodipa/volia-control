// Despliegue de Volia Control en la cuenta de Cloudflare de Volia. Funciona en Windows, macOS y Linux.
//
// Requisitos (una sola vez): `npx wrangler login` en este equipo.
// Configuración: archivo .env.cloudflare en la raíz (no se sube a git). Ver .env.cloudflare.example.
//
// Uso:
//   node scripts/deploy-cloudflare.mjs            crea la base si falta, aplica migraciones, compila y publica
//   node scripts/deploy-cloudflare.mjs --check    solo valida la configuración y compila, sin publicar
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envFile = join(root, ".env.cloudflare");
const checkOnly = process.argv.includes("--check");
const isWin = process.platform === "win32";
const npx = isWin ? "npx.cmd" : "npx";

// Todo queda también en deploy-log.txt (sin secretos: Wrangler usa su propio inicio de sesión).
const logFile = join(root, "deploy-log.txt");
writeFileSync(logFile, `Volia Control · despliegue ${new Date().toISOString()}${checkOnly ? " (--check)" : ""}\n`);
const note = (text) => { console.log(text); appendFileSync(logFile, `${text}\n`); };
const log = (msg) => note(`\n▸ ${msg}`);
const fail = (msg) => { console.error(`\n✖ ${msg}`); appendFileSync(logFile, `\n✖ ${msg}\n`); process.exit(1); };

function readEnv() {
  if (!existsSync(envFile)) fail(`Falta ${envFile}. Copie .env.cloudflare.example como .env.cloudflare y complete los datos.`);
  const env = {};
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function saveEnvValue(key, value) {
  const text = readFileSync(envFile, "utf8");
  const next = new RegExp(`^${key}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
  writeFileSync(envFile, next);
}

// interactive: la salida va directo a la consola para que wrangler pueda preguntar (por ejemplo, el subdominio workers.dev).
function run(args, { env = {}, interactive = false } = {}) {
  appendFileSync(logFile, `\n$ npx ${args.join(" ")}\n`);
  if (interactive) {
    const res = spawnSync(npx, args, { cwd: root, env: { ...process.env, ...env }, stdio: "inherit", shell: isWin });
    appendFileSync(logFile, `(salida en consola; código ${res.status})\n`);
    if (res.status !== 0) fail(`Falló: npx ${args.join(" ")}`);
    return "";
  }
  const res = spawnSync(npx, args, { cwd: root, env: { ...process.env, ...env }, stdio: ["inherit", "pipe", "pipe"], encoding: "utf8", shell: isWin, maxBuffer: 64 * 1024 * 1024 });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  process.stdout.write(out);
  appendFileSync(logFile, out);
  if (res.status !== 0) fail(`Falló: npx ${args.join(" ")}`);
  return out;
}

const ownerId = (email) => createHash("sha256").update(`volia-cloud:${email.trim().toLowerCase()}`).digest("hex");

const env = readEnv();
const dbName = env.VOLIA_D1_DATABASE_NAME || "volia-control-db";
const emails = (env.VOLIA_ALLOWED_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
if (!emails.length) fail("VOLIA_ALLOWED_EMAILS está vacío: indique los correos autorizados separados por coma.");
const accessReady = !!(env.CF_ACCESS_TEAM_DOMAIN && env.CF_ACCESS_AUD);
if (!accessReady) note("\n⚠ Cloudflare Access aún no está configurado (CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD). Se publicará con el acceso a datos cerrado para todos; actívelo y vuelva a ejecutar este script.");

let dbId = env.VOLIA_D1_DATABASE_ID;
if (!dbId) {
  if (checkOnly) fail("Falta VOLIA_D1_DATABASE_ID; ejecute sin --check para crear la base.");
  log(`Creando la base D1 "${dbName}"`);
  const out = run(["wrangler", "d1", "create", dbName]);
  dbId = out.match(/"?database_id"?\s*[:=]\s*"([0-9a-f-]{36})"/i)?.[1];
  if (!dbId) fail(`No se pudo leer el identificador de la base en la salida de wrangler:\n${out}`);
  saveEnvValue("VOLIA_D1_DATABASE_ID", dbId);
  note(`Base creada: ${dbId} (guardada en .env.cloudflare)`);
}

const buildEnv = {
  VOLIA_D1_DATABASE_ID: dbId,
  VOLIA_D1_DATABASE_NAME: dbName,
  VOLIA_AUTH_MODE: "cloudflare-access",
  CF_ACCESS_TEAM_DOMAIN: env.CF_ACCESS_TEAM_DOMAIN || "",
  CF_ACCESS_AUD: env.CF_ACCESS_AUD || "",
  VOLIA_ALLOWED_OWNER_IDS: emails.map(ownerId).join(","),
};

if (!checkOnly) {
  log("Aplicando migraciones a la base remota");
  const dir = mkdtempSync(join(tmpdir(), "volia-wr-"));
  const cfg = join(dir, "wrangler.json");
  writeFileSync(cfg, JSON.stringify({ name: "volia-control-migrations", compatibility_date: "2026-05-15", d1_databases: [{ binding: "DB", database_name: dbName, database_id: dbId, migrations_dir: join(root, "drizzle") }] }, null, 2));
  run(["wrangler", "d1", "migrations", "apply", dbName, "--remote", "--config", cfg], { env: { CI: "1" } });
}

log("Compilando (1 a 3 minutos)");
run(["vinext", "build"], { env: buildEnv });

log(checkOnly ? "Validando el paquete (sin publicar)" : "Publicando");
if (!checkOnly) note("Si wrangler pregunta por un subdominio workers.dev, responda Y y escriba el nombre elegido (por ejemplo: nexodipa).");
run(["wrangler", "deploy", ...(checkOnly ? ["--dry-run"] : [])], { env: buildEnv, interactive: !checkOnly });

note(`\n✔ ${checkOnly ? "Validación completa." : "Publicado."} Usuarios autorizados: ${emails.join(", ")}`);
if (!accessReady && !checkOnly) note("Siguiente paso: Workers & Pages → volia-control → Settings → Domains & Routes → workers.dev → Enable Cloudflare Access. Copie el AUD tag y el Team domain en .env.cloudflare y ejecute este script otra vez.");
