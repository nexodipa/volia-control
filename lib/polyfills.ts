// pdf.js 6 usa Map/WeakMap.getOrInsert y getOrInsertComputed (JavaScript reciente). Chrome 145+ las trae; en navegadores
// más antiguos (Brave o Edge sin actualizar, Safari) leer un PDF escaneado falla con un error técnico. Esto las suple.
type Poly = { has(k: unknown): boolean; get(k: unknown): unknown; set(k: unknown, v: unknown): unknown };
export function ensureMapPolyfills(): void {
  for (const C of [Map, WeakMap] as unknown as { prototype: Poly & Record<string, unknown> }[]) {
    const proto = C.prototype;
    if (typeof proto.getOrInsert !== "function") {
      Object.defineProperty(proto, "getOrInsert", { configurable: true, writable: true, value(this: Poly, k: unknown, v: unknown) { if (!this.has(k)) this.set(k, v); return this.get(k); } });
    }
    if (typeof proto.getOrInsertComputed !== "function") {
      Object.defineProperty(proto, "getOrInsertComputed", { configurable: true, writable: true, value(this: Poly, k: unknown, f: (key: unknown) => unknown) { if (!this.has(k)) this.set(k, f(k)); return this.get(k); } });
    }
  }
}
