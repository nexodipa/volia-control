// Tipos mínimos de Cloudflare Workers que usa la app. El proyecto no instala @cloudflare/workers-types;
// si algún día se instala, este archivo se puede borrar.
declare global {
  interface D1Result<T = unknown> {
    results: T[];
    success: boolean;
    meta: { changes?: number; last_row_id?: number; [key: string]: unknown };
  }
  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(column?: string): Promise<T | null>;
    all<T = unknown>(): Promise<D1Result<T>>;
    run<T = unknown>(): Promise<D1Result<T>>;
    raw<T = unknown[]>(): Promise<T[]>;
  }
  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
    exec(query: string): Promise<unknown>;
  }
  interface Fetcher {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  }
}

export {};
