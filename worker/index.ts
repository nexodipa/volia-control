/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { ecuadorToday } from "../lib/alert-digest";
import { needsRetry, pingHealthcheck, readMeta, RETRY_CRON, runAndRecordDigest } from "../lib/heartbeat";
import { sendMonthlyReport } from "../lib/monthly-sender";
import { readLastSercop, runAndRecordSercop } from "../lib/sercop-alerts";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  VOLIA_ALLOWED_OWNER_IDS?: string;
  VOLIA_AUTH_MODE?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  GEMINI_API_KEY?: string;
  ALERT_WEBHOOK_URL?: string;
  ALERT_SECRET?: string;
  VOLIA_VIEWER_EMAILS?: string;
  HEALTHCHECK_URL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const runtime = globalThis as typeof globalThis & {
      __VOLIA_DB__?: D1Database;
      __VOLIA_ALLOWED_OWNER_IDS__?: string;
      __VOLIA_AUTH__?: { mode?: string; teamDomain?: string; aud?: string };
      __VOLIA_GEMINI_KEY__?: string;
      __VOLIA_ALERTS__?: { url?: string; secret?: string };
      __VOLIA_ROLES__?: { viewers?: string };
      __VOLIA_CTX__?: ExecutionContext;
    };
    runtime.__VOLIA_CTX__ = ctx;
    runtime.__VOLIA_DB__ = env.DB;
    runtime.__VOLIA_ALLOWED_OWNER_IDS__ = env.VOLIA_ALLOWED_OWNER_IDS;
    runtime.__VOLIA_GEMINI_KEY__ = env.GEMINI_API_KEY;
    runtime.__VOLIA_ALERTS__ = { url: env.ALERT_WEBHOOK_URL?.trim(), secret: env.ALERT_SECRET?.trim() };
    runtime.__VOLIA_ROLES__ = { viewers: env.VOLIA_VIEWER_EMAILS };
    runtime.__VOLIA_AUTH__ = { mode: env.VOLIA_AUTH_MODE, teamDomain: env.CF_ACCESS_TEAM_DOMAIN, aud: env.CF_ACCESS_AUD };
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },

  // Cron de las 08:00 (lunes a viernes): resumen de alertas por correo y revisión del SERCOP.
  // Cron de las 14:00: si por la mañana algo falló o no corrió, lo reintenta. En ambos casos avisa al vigilante externo.
  async scheduled(event: { cron?: string }, env: Env, ctx: ExecutionContext): Promise<void> {
    const cfg = { url: env.ALERT_WEBHOOK_URL?.trim(), secret: env.ALERT_SECRET?.trim() };
    const db = env.DB as never;
    ctx.waitUntil((async () => {
      const retry = event.cron === RETRY_CRON;
      const today = ecuadorToday();
      const guard = (p: Promise<boolean>) => p.catch((e) => { console.error("[cron] error", e); return false; });
      const runDigest = async () => {
        if (retry && !needsRetry(await readMeta(db, "digest"), today)) return true;
        const r = await runAndRecordDigest(db, cfg);
        console.log(`[alertas] ${r.message}`);
        return r.ok;
      };
      const runSercop = async () => {
        if (retry && !needsRetry(await readLastSercop(db), today)) return true;
        const r = await runAndRecordSercop(db, cfg);
        console.log(`[sercop] ${r.message}`);
        return r.ok;
      };
      const runMonthly = async () => {
        const r = await sendMonthlyReport(db, cfg);
        if (r.sent || !r.ok) console.log(`[informe] ${r.message}`);
        return r.ok;
      };
      const [digest, sercop] = await Promise.all([guard(runDigest()), guard(runSercop())]);
      await guard(runMonthly());
      // El SERCOP responde lento y a veces cae: por la mañana su fallo no alarma porque a las 14:00 se reintenta.
      const pinged = await pingHealthcheck(env.HEALTHCHECK_URL, digest && (sercop || !retry));
      console.log(`[latido] resumen=${digest} sercop=${sercop} vigilante=${pinged}`);
    })());
  },
};

export default worker;
