// Declaración ambiental (archivo sin import/export) para el módulo virtual de Workers.
declare module "cloudflare:workers" {
  export const env: { DB?: D1Database; [binding: string]: unknown };
}
