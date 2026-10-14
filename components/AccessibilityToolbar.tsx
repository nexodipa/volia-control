"use client";

import { useEffect, useState } from "react";
import { readStoredObject, STORAGE_KEYS, writeStoredJson } from "../lib/storage";

export type AccessibilityPreferences = {
  largeText: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
};

const DEFAULTS: AccessibilityPreferences = {
  largeText: true,
  highContrast: false,
  reducedMotion: false,
};

export default function AccessibilityToolbar({ onHelp }: { onHelp: () => void }) {
  const [preferences, setPreferences] = useState(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPreferences(readStoredObject(STORAGE_KEYS.accessibility, DEFAULTS));
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle("large-text", preferences.largeText);
    document.documentElement.classList.toggle("high-contrast", preferences.highContrast);
    document.documentElement.classList.toggle("reduced-motion", preferences.reducedMotion);
    writeStoredJson(STORAGE_KEYS.accessibility, preferences);
  }, [preferences, ready]);

  const toggle = (key: keyof AccessibilityPreferences) =>
    setPreferences((current) => ({ ...current, [key]: !current[key] }));

  return (
    <div className="view-tools">
      <details className="view-menu">
        <summary>Vista</summary>
        <div className="view-menu-panel" role="group" aria-label="Opciones de vista">
          <label><input type="checkbox" checked={preferences.largeText} onChange={() => toggle("largeText")} /><span><strong>Texto grande</strong><small>Letras más fáciles de leer</small></span></label>
          <label><input type="checkbox" checked={preferences.highContrast} onChange={() => toggle("highContrast")} /><span><strong>Alto contraste</strong><small>Colores más marcados</small></span></label>
          <label><input type="checkbox" checked={preferences.reducedMotion} onChange={() => toggle("reducedMotion")} /><span><strong>Menos movimiento</strong><small>Sin animaciones</small></span></label>
        </div>
      </details>
      <button type="button" onClick={onHelp} className="help-button">Ayuda</button>
    </div>
  );
}
