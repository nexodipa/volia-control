// Cifrado del respaldo (AES-GCM con clave derivada de la contraseña por PBKDF2). Sin dependencias: se prueba en Node.
// Formato: base64( sal[16] | iv[12] | AES-GCM( datos ) ), donde `datos` es el JSON, comprimido con gzip si conviene.
// Una copia sin comprimir (formato anterior) sigue pudiéndose abrir: el gzip se reconoce por sus dos primeros bytes.

export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 12;
export const BAD_KEY_MESSAGE = "La clave no coincide o la copia está dañada. No se modificó ningún dato.";

export function validatePassphrase(passphrase: string) {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error("La clave debe tener al menos 12 caracteres. No se guarda en este dispositivo.");
  }
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new Uint8Array(salt), iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const writer = stream.writable.getWriter();
  void writer.write(new Uint8Array(bytes)).then(() => writer.close()).catch(() => {});
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

const isGzip = (b: Uint8Array) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

/** Comprime si el navegador puede y el resultado es de verdad más corto; si no, deja los bytes como están. */
export async function maybeCompress(plain: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") return plain;
  try {
    const packed = await pipe(plain, new CompressionStream("gzip"));
    return packed.length < plain.length ? packed : plain;
  } catch { return plain; }
}

export async function encryptJson(value: unknown, passphrase: string, opts: { iterations?: number; compress?: boolean } = {}): Promise<string> {
  validatePassphrase(passphrase);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, opts.iterations ?? PBKDF2_ITERATIONS);
  const raw = new TextEncoder().encode(JSON.stringify(value));
  const plain = opts.compress === false ? raw : await maybeCompress(raw);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new Uint8Array(plain)));
  const combined = new Uint8Array(28 + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, 16);
  combined.set(encrypted, 28);
  return bytesToBase64(combined);
}

/** Abre una copia. Cualquier fallo (clave, daño, formato) da el mismo mensaje y no toca nada. */
export async function decryptJson<T>(payload: string, passphrase: string, check: (value: unknown) => value is T, opts: { iterations?: number } = {}): Promise<T> {
  validatePassphrase(passphrase);
  try {
    const bytes = base64ToBytes(payload);
    if (bytes.length < 45) throw new Error("invalid");
    const key = await deriveKey(passphrase, bytes.slice(0, 16), opts.iterations ?? PBKDF2_ITERATIONS);
    let plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(16, 28) }, key, bytes.slice(28)));
    if (isGzip(plain)) plain = await pipe(plain, new DecompressionStream("gzip"));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(plain));
    if (!check(parsed)) throw new Error("invalid");
    return parsed;
  } catch {
    throw new Error(BAD_KEY_MESSAGE);
  }
}
