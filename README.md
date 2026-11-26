# Volia Control

**Live app:** https://nexodipa.github.io/volia-control/

## 60-second pitch

**Problem.** A small medical-supplies company (Volia S.A.S.) ran quotes, tenders, inventory, collections and regulatory paperwork across spreadsheets, e-mail and paper, and lost time and money to missed deadlines and re-typed data.

**Solution.** A web system I designed and maintain for a four-person team: a quote builder (PDF, Word and CSV export), a local OCR document audit, a public-procurement tender tracker, inventory, finance and regulatory modules, and automated e-mail alerts for overdue payments and expiring documents.

**Stack.** TypeScript (about 18,000 lines), React, Next.js, Cloudflare Workers and D1 with Drizzle ORM, Cloudflare Access with role-based permissions, Tesseract.js for local OCR, GitHub Actions for a monthly public-procurement (SERCOP) data refresh with validation and human review, and an automated test suite.

**Decisions worth a look.**
1. OCR runs in the browser, so client documents never leave the user's machine.
2. Server-side authentication and roles, so each person only sees and edits what their role allows.
3. External data (SERCOP) is validated and reviewed by a person before it reaches the catalog.

Built with the owner's verbal authorization to document this case study publicly. Real client data is never committed to this repository.

---

## Documentación en español

Sistema local de gestión comercial, operativa y financiera para **VOLIA S.A.S.** Permite preparar cotizaciones, auditar documentos, controlar cirugías y cobros, administrar inventario, registrar movimientos, revisar indicadores financieros y generar documentos institucionales.

## Principios del sistema

- **Local primero:** los registros permanecen en el navegador de la computadora utilizada.
- **Sin consumo de API:** el OCR funciona con componentes incluidos en la aplicación.
- **Privacidad:** los expedientes no se envían a un servicio externo de inteligencia artificial.
- **Accesibilidad:** texto grande activado por defecto, alto contraste opcional, instrucciones paso a paso y controles amplios.
- **Trazabilidad:** las operaciones importantes quedan registradas en un historial local.
- **Respaldo:** la información puede descargarse y restaurarse mediante un archivo de seguridad.

## Módulos

| Módulo | Función |
|---|---|
| Inicio | Prioridades, alertas, indicadores y accesos rápidos |
| Auditor inteligente | OCR local y controles de fechas, códigos, valores y firmas |
| Cotizador | Ofertas comerciales, descuento, IVA, rentabilidad y PDF/Word/CSV |
| Catálogo maestro | Productos, marcas, procedencias, costos y precios reutilizables |
| Cirugías y cobros | Expedientes, checklist documental, abonos, vencimientos y estados |
| Finanzas | Caja, cuentas por cobrar/pagar, presupuesto e indicadores tributarios |
| Inventario | Stock físico, reservas, lotes, costos y caducidades |
| Estadísticas | Entradas, ventas, cirugías, pérdidas y productos con mayor movimiento |
| Documentos | Cartas, actas, informes y solicitudes con archivo local |
| Historial | Registro de las operaciones importantes |
| Guía de uso | Procedimientos explicados paso a paso y descargables |

## Requisitos

- Node.js 22.13 o posterior.
- npm 10 o posterior.
- Navegador actualizado: Chrome, Edge, Brave o Firefox.

## Instalación para desarrollo

```bash
git clone https://github.com/nexodipa/volia-control.git
cd volia-control
npm ci
npm run dev
```

Abra la dirección indicada en la terminal, normalmente `http://localhost:5173`.

## Validación

```bash
npm run lint
npm test
```

Las pruebas verifican la compilación, fecha empresarial de Quito, seguridad de CSV, reglas de inventario y reconstrucción de valores del auditor.

## Información y respaldos

Los respaldos y preferencias locales se guardan en `localStorage`. Esto significa:

1. Cada navegador y computadora conserva su propia base local.
2. Borrar los datos del navegador elimina los registros si no existe respaldo.
3. El archivo de respaldo debe descargarse al final de cada jornada.
4. Para trasladar información, restaure el respaldo en la computadora de destino.
5. El PIN evita accesos casuales, pero no reemplaza el cifrado del disco ni una cuenta individual.

No suba respaldos, fotografías, facturas, historias clínicas ni datos reales de pacientes al repositorio.

## Estructura principal

```text
app/            Interfaz principal y estilos
components/     Módulos funcionales
lib/            Reglas, exportaciones, OCR y almacenamiento
public/         Logo, iconos, manifiesto y modelo OCR
tests/          Pruebas automatizadas
worker/         Entrada de despliegue
```

## Documentación

- [Guía para usuarios](GUIA_USUARIO.md)
- [Política de seguridad](SECURITY.md)
- [Contribución y mantenimiento](CONTRIBUTING.md)

## Límites actuales

Los registros operativos compartidos se guardan en el servidor (Cloudflare D1) con acceso autenticado mediante Cloudflare Access y permisos por rol. Los datos locales del navegador (`localStorage`) se usan para preferencias y respaldos. El sistema no reemplaza el cifrado de disco ni una política formal de retención de datos.

## Propiedad

Copyright © 2026 VOLIA S.A.S. Todos los derechos reservados. Consulte `LICENSE` antes de copiar, modificar o redistribuir el sistema.
