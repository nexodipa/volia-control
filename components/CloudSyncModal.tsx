"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  applyCloudSnapshot,
  getCloudState,
  previewCloudSnapshot,
  pushToCloud,
  type CloudPreview,
  type CloudState,
} from "../lib/cloud-sync";
import styles from "./CloudSyncModal.module.css";

type Notice = {
  text: string;
  kind: "info" | "success" | "error";
  authRequired?: boolean;
  conflict?: boolean;
};

function dateTime(value: string | null) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function CloudSyncModal() {
  const [open, setOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<CloudState>(() => getCloudState());
  const [preview, setPreview] = useState<CloudPreview | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const close = () => {
    setPassphrase("");
    setShowPassphrase(false);
    setPreview(null);
    setOpen(false);
  };

  useEffect(() => {
    const refresh = () => setState(getCloudState());
    const show = () => { setState(getCloudState()); setNotice(null); setPreview(null); setOpen(true); };
    window.addEventListener("volia-cloud-sync-updated", refresh);
    window.addEventListener("volia-open-cloud-sync", show);
    return () => { window.removeEventListener("volia-cloud-sync-updated", refresh); window.removeEventListener("volia-open-cloud-sync", show); };
  }, []);

  const runPush = async () => {
    setBusy(true);
    setPreview(null);
    setNotice({ text: "Cifrando y guardando la copia…", kind: "info" });
    const result = await pushToCloud(passphrase);
    setBusy(false);
    setState(getCloudState());
    setNotice({
      text: result.message,
      kind: result.success ? "success" : "error",
      authRequired: result.authRequired,
      conflict: result.conflict,
    });
  };

  const runPreview = async () => {
    setBusy(true);
    setPreview(null);
    setNotice({ text: "Descargando y verificando la copia…", kind: "info" });
    const result = await previewCloudSnapshot(passphrase);
    setBusy(false);
    setState(getCloudState());
    setPreview(result.preview || null);
    setNotice({
      text: result.message,
      kind: result.success ? "success" : "error",
      authRequired: result.authRequired,
    });
  };

  const restore = () => {
    if (!preview) return;
    if (
      !window.confirm(
        `¿Aplicar la versión ${preview.revision}? Primero se descargará una copia de seguridad de los datos actuales.`,
      )
    )
      return;
    const result = applyCloudSnapshot(preview);
    setNotice({
      text: result.message,
      kind: result.success ? "success" : "error",
    });
    if (result.success) window.setTimeout(() => window.location.reload(), 1300);
  };

  const keyOk = passphrase.length >= 12;
  const statusLabel =
    state.status === "syncing"
      ? "guardando…"
      : state.status === "error"
        ? "revisar"
        : state.status === "offline"
          ? "sin conexión"
          : state.revision > 0
            ? `versión ${state.revision}`
            : "sin activar";

  return (
    <>
      <button
        className={styles.trigger}
        onClick={() => {
          setState(getCloudState());
          setNotice(null);
          setPreview(null);
          setOpen(true);
        }}
      >
        Respaldo cifrado: {statusLabel}
      </button>

      {open && createPortal(
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && close()
          }
        >
          <section
            className={`install-modal ${styles.modal}`}
            role="dialog"
            aria-modal="true"
            aria-label="Respaldo cifrado en la nube"
          >
            <header>
              <div>
                <p className="eyebrow">Respaldo personal protegido</p>
                <h2>Memoria segura en la nube</h2>
              </div>
              <button aria-label="Cerrar" onClick={close}>
                ×
              </button>
            </header>

            <div className={styles.securityBanner}>
              <strong>Sus registros se cifran antes de salir de esta laptop.</strong>
              <span>
                La copia queda separada por su cuenta. La clave nunca se guarda
                ni se envía al servidor.
              </span>
            </div>

            <div className={styles.passphrase}>
              <label htmlFor="cloud-passphrase">Clave privada de la copia</label>
              <div>
                <input
                  id="cloud-passphrase"
                  type={showPassphrase ? "text" : "password"}
                  value={passphrase}
                  minLength={12}
                  autoComplete="off"
                  placeholder="Mínimo 12 caracteres"
                  onChange={(event) => setPassphrase(event.target.value)}
                />
                <button
                  className="secondary-button"
                  onClick={() => setShowPassphrase((value) => !value)}
                >
                  {showPassphrase ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              <small>
                Utilice la misma clave en sus otras computadoras. Si la pierde,
                nadie podrá recuperar la copia cifrada.{" "}
                <strong>{keyOk ? "Longitud correcta." : `Lleva ${passphrase.length} de 12 caracteres como mínimo.`}</strong>
              </small>
            </div>

            <div className={styles.actionGrid}>
              <article>
                <span className="option-number">01</span>
                <h3>Guardar esta laptop</h3>
                <p>
                  Crea una nueva versión únicamente si nadie guardó otra más
                  reciente.
                </p>
                <button
                  className="primary-button"
                  disabled={busy || !keyOk}
                  onClick={runPush}
                >
                  Guardar copia cifrada
                </button>
              </article>
              <article>
                <span className="option-number">02</span>
                <h3>Revisar antes de restaurar</h3>
                <p>
                  Descifra y muestra el resumen sin modificar los registros de
                  esta computadora.
                </p>
                <button
                  className="secondary-button"
                  disabled={busy || !keyOk}
                  onClick={runPreview}
                >
                  Revisar copia disponible
                </button>
              </article>
            </div>

            {preview && (
              <div className={styles.previewCard}>
                <div>
                  <span>Copia verificada</span>
                  <strong>Versión {preview.revision}</strong>
                </div>
                <dl>
                  <div>
                    <dt>Guardada</dt>
                    <dd>{dateTime(preview.updatedAt)}</dd>
                  </div>
                  <div>
                    <dt>Módulos</dt>
                    <dd>{preview.modulesCount}</dd>
                  </div>
                </dl>
                <button className="primary-button" onClick={restore}>
                  Aplicar esta copia
                </button>
                <small>
                  Antes de aplicarla, se descargará automáticamente un respaldo
                  de los datos actuales.
                </small>
              </div>
            )}

            {notice && (
              <div className={`${styles.notice} ${styles[notice.kind]}`} role="status">
                <strong>{notice.text}</strong>
                {notice.authRequired && (
                  <a href="/" target="_top">
                    Su sesión venció: recargue para volver a ingresar con su correo
                  </a>
                )}
                {notice.conflict && (
                  <span>
                    Use “Revisar copia disponible”; después podrá decidir qué
                    información conservar.
                  </span>
                )}
              </div>
            )}

            <footer>
              <strong>Última copia conocida</strong>
              <span>{dateTime(state.lastSync)}</span>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
