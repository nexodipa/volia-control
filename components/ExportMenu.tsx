"use client";

import { useEffect, useRef } from "react";

type Props = { onPdf?: () => void; onWord?: () => void; onCsv?: () => void };

// Un solo botón "Exportar" en lugar de tres botones fijos en cada módulo.
export function ExportMenu({ onPdf, onWord, onCsv }: Props) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (event: Event) => {
      const el = ref.current;
      if (el?.open && event.target instanceof Node && !el.contains(event.target)) el.open = false;
    };
    const esc = (event: KeyboardEvent) => { if (event.key === "Escape" && ref.current) ref.current.open = false; };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", esc); };
  }, []);

  const run = (fn?: () => void) => () => { if (ref.current) ref.current.open = false; fn?.(); };

  return (
    <details className="export-menu" ref={ref}>
      <summary className="secondary-button">Exportar</summary>
      <div className="export-menu-list" role="menu">
        {onPdf && <button type="button" role="menuitem" onClick={run(onPdf)}>PDF</button>}
        {onWord && <button type="button" role="menuitem" onClick={run(onWord)}>Word</button>}
        {onCsv && <button type="button" role="menuitem" onClick={run(onCsv)}>Excel / CSV</button>}
      </div>
    </details>
  );
}
