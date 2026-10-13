import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTeamDomain, resetAccessCache, verifyAccessJwt } from "../lib/cf-access.ts";

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1" };
const fetchJwks = async () => ({ keys: [jwk] });
const config = { teamDomain: "volia", aud: "AUD123" };
const now = Date.parse("2026-10-13T18:00:00Z");

async function sign(payload, header = { alg: "RS256", kid: "k1" }, key = privateKey) {
  const h = b64url(JSON.stringify(header)), p = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(sig)}`;
}
const good = { aud: ["AUD123"], iss: "https://volia.cloudflareaccess.com", email: "Josue@Volia.com", exp: now / 1000 + 600 };

test("team domain normalization", () => {
  assert.equal(normalizeTeamDomain("volia"), "volia.cloudflareaccess.com");
  assert.equal(normalizeTeamDomain("https://volia.cloudflareaccess.com/"), "volia.cloudflareaccess.com");
});

test("valid token returns lowercased email", async () => {
  resetAccessCache();
  assert.equal(await verifyAccessJwt(await sign(good), config, { now, fetchJwks }), "josue@volia.com");
});

test("rejects wrong audience, issuer, expiry, algorithm, signature and missing token", async () => {
  resetAccessCache();
  const o = { now, fetchJwks };
  assert.equal(await verifyAccessJwt(await sign({ ...good, aud: ["OTRA"] }), config, o), null);
  assert.equal(await verifyAccessJwt(await sign({ ...good, iss: "https://evil.cloudflareaccess.com" }), config, o), null);
  assert.equal(await verifyAccessJwt(await sign({ ...good, exp: now / 1000 - 1 }), config, o), null);
  assert.equal(await verifyAccessJwt(await sign(good, { alg: "none", kid: "k1" }), config, o), null);
  const other = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign"]);
  assert.equal(await verifyAccessJwt(await sign(good, undefined, other.privateKey), config, o), null);
  const t = await sign(good); const [h, , s] = t.split(".");
  assert.equal(await verifyAccessJwt(`${h}.${b64url(JSON.stringify({ ...good, email: "intruso@x.com" }))}.${s}`, config, o), null);
  assert.equal(await verifyAccessJwt(null, config, o), null);
  assert.equal(await verifyAccessJwt(await sign(good), { teamDomain: "", aud: "" }, o), null);
});
