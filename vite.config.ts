import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

// Despliegue propio en Cloudflare: scripts/deploy-cloudflare.mjs define estas variables al compilar.
// En desarrollo local quedan vacías y se usa la base local de relleno.
const deployVars = Object.fromEntries(
  ["VOLIA_AUTH_MODE", "CF_ACCESS_TEAM_DOMAIN", "CF_ACCESS_AUD", "VOLIA_ALLOWED_OWNER_IDS"]
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key] as string]),
);

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  // Solo la dirección workers.dev (protegida por Cloudflare Access); sin URLs de vista previa por versión.
  workers_dev: true,
  preview_urls: false,
  // 13:00 UTC = 08:00 en Ecuador, de lunes a viernes.
  triggers: { crons: ["0 13 * * 1-5", "0 19 * * 1-5"] },
  ...(Object.keys(deployVars).length ? { vars: deployVars } : {}),
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: process.env.VOLIA_D1_DATABASE_NAME || "site-creator-d1",
          database_id: process.env.VOLIA_D1_DATABASE_ID || SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
