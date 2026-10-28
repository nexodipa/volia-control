# Cuentas de solo consulta

Por defecto todas las cuentas autorizadas en Cloudflare Access pueden ver y editar. Para que alguien solo pueda **ver**:

1. Doble clic en `configurar-permisos.cmd` y escriba sus correos separados por coma.
2. Publique con `publicar-cloudflare.cmd`.

Qué cambia para esas cuentas:

- El servidor rechaza sus escrituras: datos compartidos (inventario, finanzas, cotizaciones, procesos), catálogo, vigencias, respaldo cifrado en la nube y el envío de correos de prueba.
- Inicio muestra el aviso «Modo de solo consulta» y la sincronización solo baja datos: lo que cambien en su equipo se queda ahí.
- Siguen pudiendo usar el traductor y abrir el cotizador, sin guardar nada en el servidor.

Para quitar a todos de la lista, ejecute de nuevo el script y escriba `-`.

Cada cambio compartido queda registrado con el correo de quien lo hizo (tabla `audit_events` y campo `updated_by`).
