// Decisión del respaldo automático. Lógica pura: sin red ni almacenamiento, para poder probarla.
export const AUTO_CHECK_MS = 60_000; // cada cuánto se revisa si hubo cambios
export const AUTO_MIN_GAP_MS = 5 * 60_000; // mínimo entre dos copias automáticas

/** Huella corta y estable de los datos (no es criptográfica: solo detecta si algo cambió). */
export function dataFingerprint(data: Record<string, string>): string {
  let h1 = 5381, h2 = 52711, len = 0;
  for (const key of Object.keys(data).sort()) {
    const chunk = `${key}\u0001${data[key]}\u0002`;
    len += chunk.length;
    for (let i = 0; i < chunk.length; i += 1) {
      const c = chunk.charCodeAt(i);
      h1 = ((h1 << 5) + h1 + c) | 0;
      h2 = ((h2 << 5) ^ (h2 >>> 3) ^ c) | 0;
    }
  }
  return `${len}:${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

export type AutoBackupInput = {
  armed: boolean; // hay clave en memoria y el usuario activó el modo automático
  busy: boolean; // ya hay un guardado en curso
  online: boolean;
  changed: boolean; // los datos son distintos a los de la última copia
  now: number;
  lastAttemptAt: number; // 0 si nunca
  minGapMs?: number;
};

export function shouldAutoBackup(i: AutoBackupInput): boolean {
  if (!i.armed || i.busy || !i.online || !i.changed) return false;
  return i.now - i.lastAttemptAt >= (i.minGapMs ?? AUTO_MIN_GAP_MS);
}
