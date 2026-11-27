// Atlas de osteosíntesis como aplicación aparte (enlace propio, sin inicio de sesión). Reutiliza el mismo componente
// que Volia Control, en modo público: sin precios ni cotizador. Se compila con scripts/build-atlas.mjs.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import OsteoAtlas from "../../components/OsteoAtlas";
import "./base.css";
import "./atlas.generated.css";

function App() {
  return (
    <>
      <header className="shell-head">
        {/* eslint-disable-next-line @next/next/no-img-element -- aplicación Vite, sin next/image */}
        <img src="/app-icon-192.png" alt="" width={40} height={40} />
        <div>
          <strong>Atlas de osteosíntesis</strong>
          <span>Volia S.A.S. · Quito, Ecuador</span>
        </div>
      </header>
      <main className="shell-main">
        <OsteoAtlas publicMode dataUrl="/data/hecam-catalogo.json" />
      </main>
      <footer className="shell-foot">
        Material de formación comercial de Volia S.A.S. Pendiente de revisión por un traumatólogo; no reemplaza el criterio
        del cirujano ni las indicaciones del fabricante. No contiene datos de pacientes.
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);

if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => { navigator.serviceWorker.register("/service-worker.js").catch(() => {}); });
}
