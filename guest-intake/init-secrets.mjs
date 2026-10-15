import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const path = new URL(".private-secrets.json", import.meta.url);
if (existsSync(path)) throw new Error("Ya hay secretos locales; no se reemplazaron.");
const secrets = {
  INVITE_SECRET: randomBytes(32).toString("base64url"),
  ADMIN_PASSWORD: randomBytes(24).toString("base64url"),
};
writeFileSync(path, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600, flag: "wx" });
console.log("Secretos creados en archivo local ignorado por Git.");
