# Bandeja inteligente de correo (Gmail)

Volia Control puede leer el correo de cada persona que lo autorice, separarlo por tema y sacar los datos útiles: códigos de proceso del SERCOP, fechas límite, montos, números de factura y RUC. Aparece en **Más herramientas, Correo**.

## Cómo protege la privacidad (Ley Orgánica de Protección de Datos Personales)

- **La persona decide qué se comparte.** Solo se lee lo que ella etiquetó con **Volia** en su Gmail. Sin la etiqueta, el script no entrega nada, aunque alguien edite la búsqueda por error.
- **Cada quien instala y autoriza su propio script** en su cuenta. No hay contraseñas de Gmail ni aplicación de Google intermedia; Volia Control solo conoce la dirección del script y una clave.
- **Solo lectura.** El script no envía, borra, archiva ni mueve correos. Lo único que escribe es la etiqueta `volia-leido` en las conversaciones ya guardadas, para no repetirlas.
- **Se guarda lo mínimo:** asunto, remitente, fecha, un extracto de unos 600 caracteres (sin texto citado ni firmas largas), los datos extraídos y los **nombres** de los adjuntos. El contenido de los adjuntos no sale de Gmail. Contraseñas, claves, códigos de verificación y números de tarjeta se enmascaran antes de guardar.
- **Se borra solo:** los correos sin tocar por 90 días se eliminan de Volia Control (el original sigue en Gmail).
- **Retirarse es fácil:** quitar la etiqueta a un correo lo deja fuera de lo nuevo; archivar la implementación del script corta todo el acceso.
- Todo el equipo que usa Volia Control ve los correos que se comparten, por eso solo se etiqueta lo que se quiere compartir.
- Google mostrará una pantalla de permisos amplia ("leer, redactar, enviar y eliminar"): es la única que ofrece Apps Script para Gmail. El código (`docs/correo-volia.gs`, unas 100 líneas) solo lee y etiqueta; puede revisarlo antes de pegarlo, y las pruebas automáticas verifican que no llama a enviar, borrar ni archivar.

## Pasos por cada buzón (unos 10 minutos)

1. Con esa cuenta de Gmail, entrar a script.google.com y crear un proyecto nuevo.
2. Pegar el contenido de `docs/correo-volia.gs` (reemplaza el ejemplo) y guardar.
3. Configuración del proyecto, Propiedades de la secuencia de comandos: agregar `SECRET` (clave larga y aleatoria, 40 caracteres). Opcional: `QUERY` para cambiar el periodo (por defecto `label:volia newer_than:60d`).
4. En Gmail crear la etiqueta **Volia** y ponérsela a un par de correos de prueba.
5. En el editor ejecutar la función `probar`, aceptar el permiso y ver en el registro los correos que se compartirían.
6. Implementar, Nueva implementación, Aplicación web: ejecutar como "Yo", acceso "Cualquier persona". Copiar la dirección que termina en `/exec`.
7. En la carpeta de Volia Control, doble clic en `configurar-correo.cmd` y pegar el nombre del buzón, la dirección y la clave. Si ya hay buzones, el archivo pide la lista completa otra vez (se guarda como un solo secreto).
8. Publicar con `publicar-cloudflare.cmd`. En Correo, usar **Revisar correo ahora**.

Después se lee solo cada día hábil a las 08:00 (hasta 5 buzones, 40 correos por lectura).

## Temas y reglas

Contratación pública, Cotizaciones, Pedidos, Cobros y pagos, Regulatorio, Proveedores y Otros. La clasificación es por reglas legibles (palabras del asunto pesan el doble, el remitente `compraspublicas.gob.ec`, `controlsanitario.gob.ec` o `sri.gob.ec` suma, y los nombres de adjuntos ayudan), no por inteligencia artificial: nada del correo se envía a terceros. Cada tarjeta muestra "por qué este tema" para poder corregir las reglas en `lib/mail-triage.ts`. Los códigos de proceso se probaron contra los 1.229 reales del SERCOP 2026.

## Si algo falla

Correo muestra por buzón la hora y el resultado de la última lectura. "forbidden" significa que la clave del script y la guardada no coinciden; si el script se vuelve a implementar con otra dirección, repita el paso 7.
