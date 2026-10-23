/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { sendDigest } from "../lib/alert-sender";

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
    };
    runtime.__VOLIA_DB__ = env.DB;
    runtime.__VOLIA_ALLOWED_OWNER_IDS__ = env.VOLIA_ALLOWED_OWNER_IDS;
    runtime.__VOLIA_GEMINI_KEY__ = env.GEMINI_API_KEY;
    runtime.__VOLIA_ALERTS__ = { url: env.ALERT_WEBHOOK_URL?.trim(), secret: env.ALERT_SECRET?.trim() };
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

  // Cron diario (lunes a viernes, 08:00 de Ecuador): resumen de alertas por correo.
  async scheduled(_event: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      sendDigest(env.DB as never, { url: env.ALERT_WEBHOOK_URL?.trim(), secret: env.ALERT_SECRET?.trim() })
        .then((r) => console.log(`[alertas] ${r.message}`))
        .catch((e) => console.error("[alertas] error", e)),
    );
  },
};

export default worker;
