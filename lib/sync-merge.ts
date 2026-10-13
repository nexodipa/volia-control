// Fusión genérica entre la lista de un equipo y la del servidor: por clave, gana la modificación más reciente.
// Devuelve la lista combinada (orden: primero el del equipo) y lo que el equipo debe subir.
export function mergeByUpdatedAt<T extends { updatedAt?: string }>(local: T[], remote: T[], key: (item: T) => string) {
  const stamp = (item: T) => (item.updatedAt ? Date.parse(item.updatedAt) || 0 : 0);
  const byKey = new Map(remote.map((r) => [key(r), r]));
  const toPush: T[] = [];
  for (const l of local) {
    const r = byKey.get(key(l));
    if (!r || stamp(l) > stamp(r)) { byKey.set(key(l), l); toPush.push(l); }
  }
  const order = [...new Set([...local.map(key), ...remote.map(key)])];
  return { merged: order.map((k) => byKey.get(k)).filter((x): x is T => !!x), toPush };
}
