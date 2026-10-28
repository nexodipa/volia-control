"use client";

import { recordActivity } from "./activity-log";
import { AUTO_CHECK_MS, dataFingerprint, shouldAutoBackup } from "./auto-backup";
import { decryptJson, encryptJson, validatePassphrase } from "./backup-crypto";
import { BACKUP_KEYS, isValidBackupValue, STORAGE_KEYS } from "./storage";

const CLOUD_STATE_KEY = "volia-cloud-state-v2";
const DEVICE_ID_KEY = "volia-device-id-v2";
const API_ENDPOINT = "/api/sync";

export type CloudState = {
  revision: number;
  lastSync: string | null;
  status: "idle" | "syncing" | "success" | "error" | "offline";
  lastError: string | null;
};

type EncryptedSnapshot = {
  revision: number;
  encrypted: true;
  payload: string;
  checksum: string;
  deviceId: string;
  keysCount: number;
  createdAt: string;
  updatedAt: string;
};

type BackupEnvelope = {
  product: "Volia Control";
  version: 3;
  exportedAt: string;
  deviceId: string;
  data: Record<string, string>;
};

function isEnvelope(value: unknown): value is BackupEnvelope {
  const v = value as Partial<BackupEnvelope> | null;
  return !!v && v.product === "Volia Control" && v.version === 3 && !!v.data && typeof v.data === "object";
}

export type CloudPreview = {
  revision: number;
  updatedAt: string;
  deviceId: string;
  modulesCount: number;
  data: Record<string, string>;
};

export type CloudResult = {
  success: boolean;
  message: string;
  authRequired?: boolean;
  conflict?: boolean;
  revision?: number;
  timestamp?: string;
};

const emptyState = (): CloudState => ({
  revision: 0,
  lastSync: null,
  status: "idle",
  lastError: null,
});

export function getCloudState(): CloudState {
  if (typeof window === "undefined") return emptyState();
  try {
    const parsed = JSON.parse(localStorage.getItem(CLOUD_STATE_KEY) || "null");
    return {
      revision:
        Number.isSafeInteger(parsed?.revision) && parsed.revision >= 0
          ? parsed.revision
          : 0,
      lastSync:
        typeof parsed?.lastSync === "string" ? parsed.lastSync : null,
      status: ["idle", "syncing", "success", "error", "offline"].includes(
        parsed?.status,
      )
        ? parsed.status
        : "idle",
      lastError:
        typeof parsed?.lastError === "string" ? parsed.lastError : null,
    };
  } catch {
    return emptyState();
  }
}

function saveCloudState(patch: Partial<CloudState>) {
  if (typeof window === "undefined") return;
  const next = { ...getCloudState(), ...patch };
  localStorage.setItem(CLOUD_STATE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("volia-cloud-sync-updated"));
}

export function getDeviceId() {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `device-${crypto.randomUUID()}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function collectLocalData() {
  const data: Record<string, string> = {};
  BACKUP_KEYS.forEach((key) => {
    if (key === STORAGE_KEYS.lastBackup || key === STORAGE_KEYS.memoryUpdated)
      return;
    const value = localStorage.getItem(key);
    if (value !== null && isValidBackupValue(key, value)) data[key] = value;
  });
  return data;
}

async function parseApiError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    currentRevision?: number;
  };
  return {
    message: body.error || `Error del servidor (${response.status}).`,
    code: body.code,
    currentRevision: body.currentRevision,
  };
}

function offlineResult(): CloudResult {
  const message = "No hay conexión a Internet. Sus datos locales siguen guardados.";
  saveCloudState({ status: "offline", lastError: message });
  return { success: false, message };
}

export async function pushToCloud(passphrase: string): Promise<CloudResult> {
  if (!navigator.onLine) return offlineResult();
  saveCloudState({ status: "syncing", lastError: null });
  try {
    validatePassphrase(passphrase);
    const state = getCloudState();
    const data = collectLocalData();
    const deviceId = getDeviceId();
    const envelope: BackupEnvelope = { product: "Volia Control", version: 3, exportedAt: new Date().toISOString(), deviceId, data };
    const payload = await encryptJson(envelope, passphrase);

    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        encrypted: true,
        payload,
        baseRevision: state.revision,
        keysCount: Object.keys(data).length,
        deviceId,
      }),
    });

    if (!response.ok) {
      const error = await parseApiError(response);
      saveCloudState({
        status: "error",
        lastError: error.message,
      });
      return {
        success: false,
        message: error.message,
        authRequired: response.status === 401,
        conflict: response.status === 409,
      };
    }

    const result = (await response.json()) as {
      revision: number;
      timestamp: string;
    };
    saveCloudState({
      status: "success",
      revision: result.revision,
      lastSync: result.timestamp,
      lastError: null,
    });
    recordActivity(
      "Nube",
      "Copia cifrada guardada",
      `Versión ${result.revision} · ${Object.keys(data).length} módulos`,
      "system",
    );
    return {
      success: true,
      message: `Copia cifrada guardada como versión ${result.revision}.`,
      revision: result.revision,
      timestamp: result.timestamp,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo guardar en la nube.";
    saveCloudState({ status: "error", lastError: message });
    return { success: false, message };
  }
}

export async function previewCloudSnapshot(
  passphrase: string,
): Promise<CloudResult & { preview?: CloudPreview }> {
  if (!navigator.onLine) return offlineResult();
  saveCloudState({ status: "syncing", lastError: null });
  try {
    validatePassphrase(passphrase);
    const response = await fetch(API_ENDPOINT, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      const error = await parseApiError(response);
      saveCloudState({ status: "error", lastError: error.message });
      return {
        success: false,
        message: error.message,
        authRequired: response.status === 401,
      };
    }
    const result = (await response.json()) as {
      status: "ok" | "empty";
      snapshot: EncryptedSnapshot | null;
    };
    if (!result.snapshot) {
      saveCloudState({ status: "idle", revision: 0, lastError: null });
      return { success: true, message: "Todavía no existe una copia en la nube." };
    }

    const envelope = await decryptJson(result.snapshot.payload, passphrase, isEnvelope);
    const validData: Record<string, string> = {};
    for (const [key, value] of Object.entries(envelope.data)) {
      if (
        BACKUP_KEYS.has(key) &&
        key !== STORAGE_KEYS.lastBackup &&
        key !== STORAGE_KEYS.memoryUpdated &&
        typeof value === "string" &&
        isValidBackupValue(key, value)
      ) {
        validData[key] = value;
      }
    }
    if (!Object.keys(validData).length && result.snapshot.keysCount > 0) {
      throw new Error("La copia no contiene módulos reconocidos.");
    }

    const preview: CloudPreview = {
      revision: result.snapshot.revision,
      updatedAt: result.snapshot.updatedAt,
      deviceId: result.snapshot.deviceId,
      modulesCount: Object.keys(validData).length,
      data: validData,
    };
    saveCloudState({
      status: "success",
      lastSync: result.snapshot.updatedAt,
      lastError: null,
    });
    return {
      success: true,
      message: "Copia verificada. Revise el resumen antes de aplicarla.",
      preview,
      revision: preview.revision,
      timestamp: preview.updatedAt,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo revisar la copia.";
    saveCloudState({ status: "error", lastError: message });
    return { success: false, message };
  }
}

function downloadSafetyBackup() {
  const data = collectLocalData();
  const blob = new Blob(
    [
      JSON.stringify(
        {
          product: "Volia Control",
          version: 2,
          exportedAt: new Date().toISOString(),
          reason: "Copia automática previa a restauración desde la nube",
          data,
        },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `respaldo-previo-restauracion-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function applyCloudSnapshot(preview: CloudPreview): CloudResult {
  try {
    downloadSafetyBackup();
    BACKUP_KEYS.forEach((key) => {
      if (key === STORAGE_KEYS.lastBackup || key === STORAGE_KEYS.memoryUpdated)
        return;
      const value = preview.data[key];
      if (value !== undefined) localStorage.setItem(key, value);
      else localStorage.removeItem(key);
    });
    const now = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.memoryUpdated, now);
    saveCloudState({
      status: "success",
      revision: preview.revision,
      lastSync: preview.updatedAt,
      lastError: null,
    });
    recordActivity(
      "Nube",
      "Copia de nube restaurada",
      `Versión ${preview.revision} · respaldo local previo descargado`,
      "system",
    );
    window.dispatchEvent(new Event("volia-memory-updated"));
    window.dispatchEvent(new Event("volia-activity-updated"));
    return {
      success: true,
      message:
        "Copia aplicada. También se descargó un respaldo de seguridad de los datos anteriores.",
    };
  } catch {
    return {
      success: false,
      message:
        "No se pudo aplicar la copia. Los datos existentes permanecen sin cambios.",
    };
  }
}

// ── Respaldo automático mientras la pestaña esté abierta ─────────────────────────────────────────
// La clave NUNCA se guarda en disco: vive solo en esta variable. Si se cierra o recarga la pestaña, hay que
// escribirla de nuevo. Lo único que se recuerda es la preferencia (activado o no) y la huella de lo último guardado.
const AUTO_PREF_KEY = "volia-autobackup-pref-v1";
const AUTO_HASH_KEY = "volia-autobackup-hash-v1";
let sessionKey: string | null = null;
let autoTimer: number | null = null;
let autoBusy = false;
let lastAttemptAt = 0;

export const getAutoPreference = () => typeof window !== "undefined" && localStorage.getItem(AUTO_PREF_KEY) === "1";
export const isAutoArmed = () => sessionKey !== null;
const notifyAuto = () => typeof window !== "undefined" && window.dispatchEvent(new Event("volia-cloud-sync-updated"));
const currentFingerprint = () => dataFingerprint(collectLocalData());
const rememberFingerprint = () => localStorage.setItem(AUTO_HASH_KEY, currentFingerprint());

export function armAutoBackup(passphrase: string) {
  validatePassphrase(passphrase);
  sessionKey = passphrase;
  localStorage.setItem(AUTO_PREF_KEY, "1");
  rememberFingerprint();
  lastAttemptAt = Date.now();
  startAutoLoop();
  notifyAuto();
}

export function disarmAutoBackup(forgetPreference = true) {
  sessionKey = null;
  if (forgetPreference) localStorage.removeItem(AUTO_PREF_KEY);
  if (autoTimer !== null) { window.clearInterval(autoTimer); autoTimer = null; }
  notifyAuto();
}

/** Marca como "ya guardado" lo que hay ahora (se llama después de cada guardado manual exitoso). */
export function markBackedUpNow() { rememberFingerprint(); }

async function autoTick() {
  const changed = localStorage.getItem(AUTO_HASH_KEY) !== currentFingerprint();
  if (!shouldAutoBackup({ armed: sessionKey !== null, busy: autoBusy, online: navigator.onLine, changed, now: Date.now(), lastAttemptAt })) return;
  autoBusy = true; lastAttemptAt = Date.now();
  try {
    const result = await pushToCloud(sessionKey as string);
    if (result.success) rememberFingerprint();
    else if (result.authRequired || result.conflict) {
      // Sesión vencida o alguien guardó una versión más nueva: no se insiste, se avisa y se pide intervención.
      disarmAutoBackup(false);
      saveCloudState({ status: "error", lastError: result.conflict ? "El respaldo automático se detuvo: hay una versión más nueva en la nube. Revísela antes de seguir." : "El respaldo automático se detuvo: su sesión venció. Recargue la página." });
    }
  } finally { autoBusy = false; }
}

function startAutoLoop() {
  if (autoTimer !== null || typeof window === "undefined") return;
  autoTimer = window.setInterval(() => { void autoTick(); }, AUTO_CHECK_MS);
}
