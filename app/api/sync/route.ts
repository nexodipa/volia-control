import { NextResponse } from "next/server";
import { getChatGPTUser } from "../../chatgpt-auth";
import { READ_ONLY_MESSAGE, roleFor } from "../../../lib/roles";

export const dynamic = "force-dynamic";

const MAX_PAYLOAD_CHARS = 1_500_000;
const MAX_DEVICE_ID_CHARS = 100;

type SnapshotRow = {
  revision: number;
  encrypted_payload: string;
  checksum: string;
  device_id: string;
  keys_count: number;
  created_at: string;
  updated_at: string;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function getDatabase() {
  return (globalThis as typeof globalThis & { __VOLIA_DB__?: D1Database })
    .__VOLIA_DB__;
}

function isAuthorizedOwner(ownerId: string) {
  const configured = (
    globalThis as typeof globalThis & {
      __VOLIA_ALLOWED_OWNER_IDS__?: string;
    }
  ).__VOLIA_ALLOWED_OWNER_IDS__;
  if (!configured) return false;
  return configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(ownerId);
}

async function authenticatedOwnerId() {
  const user = await getChatGPTUser();
  if (!user) return null;
  const normalizedEmail = user.email.trim().toLowerCase();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`volia-cloud:${normalizedEmail}`),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function snapshotResponse(row: SnapshotRow) {
  return {
    revision: row.revision,
    encrypted: true,
    payload: row.encrypted_payload,
    checksum: row.checksum,
    deviceId: row.device_id,
    keysCount: row.keys_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validDeviceId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 8 &&
    value.length <= MAX_DEVICE_ID_CHARS &&
    /^[a-zA-Z0-9._:-]+$/.test(value)
  );
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function GET(request: Request) {
  const ownerId = await authenticatedOwnerId();
  if (!ownerId) {
    return json(
      { error: "Inicie sesión para acceder a su respaldo.", code: "AUTH_REQUIRED" },
      401,
    );
  }
  if (!isAuthorizedOwner(ownerId)) {
    return json(
      { error: "Su cuenta todavía no está autorizada para usar la nube." },
      403,
    );
  }
  const database = getDatabase();
  if (!database) {
    return json({ error: "El almacenamiento en la nube no está disponible." }, 503);
  }

  const requestedRevision = Number(new URL(request.url).searchParams.get("revision"));
  const hasRequestedRevision =
    Number.isSafeInteger(requestedRevision) && requestedRevision > 0;

  const statement = hasRequestedRevision
    ? database.prepare(
        `SELECT revision, encrypted_payload, checksum, device_id, keys_count,
                created_at, created_at AS updated_at
           FROM cloud_snapshot_versions
          WHERE owner_id = ? AND revision = ?
          LIMIT 1`,
      ).bind(ownerId, requestedRevision)
    : database.prepare(
        `SELECT revision, encrypted_payload, checksum, device_id, keys_count,
                created_at, updated_at
           FROM cloud_snapshots
          WHERE owner_id = ?
          LIMIT 1`,
      ).bind(ownerId);

  const row = await statement.first<SnapshotRow>();
  if (!row) {
    return json({ status: "empty", snapshot: null });
  }

  return json({ status: "ok", snapshot: snapshotResponse(row) });
}

export async function POST(request: Request) {
  const ownerId = await authenticatedOwnerId();
  if (!ownerId) {
    return json(
      { error: "Inicie sesión para guardar su respaldo.", code: "AUTH_REQUIRED" },
      401,
    );
  }
  if (!isAuthorizedOwner(ownerId)) {
    return json(
      { error: "Su cuenta todavía no está autorizada para usar la nube." },
      403,
    );
  }
  const database = getDatabase();
  if (!database) {
    return json({ error: "El almacenamiento en la nube no está disponible." }, 503);
  }

  const viewer = await getChatGPTUser();
  const viewers = (globalThis as typeof globalThis & { __VOLIA_ROLES__?: { viewers?: string } }).__VOLIA_ROLES__?.viewers;
  if (viewer && roleFor(viewer.email, viewers) === "viewer") return json({ error: READ_ONLY_MESSAGE, code: "READ_ONLY" }, 403);

  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "El contenido debe enviarse como JSON." }, 415);
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_PAYLOAD_CHARS * 1.5) {
    return json({ error: "El respaldo supera el tamaño permitido." }, 413);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "El respaldo no contiene JSON válido." }, 400);
  }

  const encryptedPayload = body.payload;
  const baseRevision = body.baseRevision;
  const keysCount = body.keysCount;
  const deviceId = body.deviceId;

  if (
    body.encrypted !== true ||
    typeof encryptedPayload !== "string" ||
    encryptedPayload.length < 40 ||
    encryptedPayload.length > MAX_PAYLOAD_CHARS ||
    !Number.isSafeInteger(baseRevision) ||
    Number(baseRevision) < 0 ||
    !Number.isSafeInteger(keysCount) ||
    Number(keysCount) < 0 ||
    Number(keysCount) > 100 ||
    !validDeviceId(deviceId)
  ) {
    return json(
      { error: "El respaldo cifrado no cumple el formato de seguridad." },
      400,
    );
  }

  const current = await database.prepare(
    "SELECT revision, updated_at FROM cloud_snapshots WHERE owner_id = ? LIMIT 1",
  )
    .bind(ownerId)
    .first<{ revision: number; updated_at: string }>();

  const expectedRevision = current?.revision ?? 0;
  if (
    current &&
    Date.now() - Date.parse(current.updated_at) < 3_000
  ) {
    return json(
      { error: "Espere unos segundos antes de guardar otra copia." },
      429,
    );
  }
  if (Number(baseRevision) !== expectedRevision) {
    return json(
      {
        error:
          "Existe una copia más reciente. Revísela antes de volver a guardar.",
        code: "REVISION_CONFLICT",
        currentRevision: expectedRevision,
        updatedAt: current?.updated_at ?? null,
      },
      409,
    );
  }

  const now = new Date().toISOString();
  const nextRevision = expectedRevision + 1;
  const checksum = await sha256(encryptedPayload);

  const snapshotWrite = !current
    ? database.prepare(
      `INSERT INTO cloud_snapshots
        (owner_id, revision, encrypted_payload, checksum, device_id, keys_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(owner_id) DO NOTHING`,
    )
      .bind(
        ownerId,
        nextRevision,
        encryptedPayload,
        checksum,
        deviceId,
        Number(keysCount),
        now,
        now,
      )
    : database.prepare(
      `UPDATE cloud_snapshots
          SET revision = ?, encrypted_payload = ?, checksum = ?, device_id = ?,
              keys_count = ?, updated_at = ?
        WHERE owner_id = ? AND revision = ?`,
    )
      .bind(
        nextRevision,
        encryptedPayload,
        checksum,
        deviceId,
        Number(keysCount),
        now,
        ownerId,
        expectedRevision,
      );

  const versionWrite = database.prepare(
    `INSERT INTO cloud_snapshot_versions
      (owner_id, revision, encrypted_payload, checksum, device_id, keys_count, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM cloud_snapshots
         WHERE owner_id = ? AND revision = ? AND checksum = ? AND updated_at = ?
      )`,
  )
    .bind(
      ownerId,
      nextRevision,
      encryptedPayload,
      checksum,
      deviceId,
      Number(keysCount),
      now,
      ownerId,
      nextRevision,
      checksum,
      now,
    );

  const writeResults = await database.batch([snapshotWrite, versionWrite]);
  if (!writeResults[0]?.meta.changes || !writeResults[1]?.meta.changes) {
    return json(
      {
        error:
          "Otra computadora actualizó la nube. Revise la copia más reciente.",
        code: "REVISION_CONFLICT",
      },
      409,
    );
  }

  try {
    await database.prepare(
      `DELETE FROM cloud_snapshot_versions
        WHERE owner_id = ?
          AND revision NOT IN (
            SELECT revision FROM cloud_snapshot_versions
             WHERE owner_id = ?
             ORDER BY revision DESC
             LIMIT 10
          )`,
    )
      .bind(ownerId, ownerId)
      .run();
  } catch (error) {
    console.warn("No se pudo aplicar la retención de versiones.", error);
  }

  return json({
    status: "success",
    revision: nextRevision,
    timestamp: now,
    checksum,
  });
}
