import { readFileSync } from "node:fs";
import { makeInvite } from "./worker.mjs";

const secret = process.env.INVITE_SECRET || JSON.parse(readFileSync(new URL(".private-secrets.json", import.meta.url))).INVITE_SECRET;
if (!secret) throw new Error("Falta INVITE_SECRET.");
const expires = Math.floor(Date.now() / 1000) + 48 * 60 * 60;
const token = await makeInvite(secret, expires);
const host = process.env.INTAKE_HOST || "https://volia-recepcion.nexodipa.workers.dev";
console.log(`${host}/?t=${token}`);
