# Volia Control

**Aplicación en línea:** https://volia-auditor-ia.jospu.chatgpt.site

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
git clone https://github.com/JosueST-B/volia-control.git
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

Los datos operativos se guardan en `localStorage`. Esto significa:

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

Volia Control es una aplicación local. No sincroniza automáticamente información entre computadoras y no ofrece autenticación individual centralizada. Para una operación simultánea de varias personas se requiere una fase posterior con base de datos cifrada, roles, bitácora de servidor y políticas de retención de datos.

## Propiedad

Copyright © 2026 VOLIA S.A.S. Todos los derechos reservados. Consulte `LICENSE` antes de copiar, modificar o redistribuir el sistema.
