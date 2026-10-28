# Alertas por correo (Gmail)

El servidor arma un resumen cada día hábil a las 08:00 (hora de Ecuador) y lo envía por un script de Google que corre en la cuenta de Gmail elegida. No se guarda ninguna contraseña de Gmail.

- **Lunes:** informe completo (cobros vencidos, pagos de los próximos 7 días, documentos regulatorios vencidos o por vencer en 90 días, registros sin fecha).
- **Martes a viernes:** solo novedades: documentos que cruzan 90, 60, 30, 15, 7, 3 o 0 días; cobros que cumplen 1, 7, 15, 30, 60 o 90 días de atraso; pagos que vencen en 7, 3 o 0 días.
- Si no hay nada que avisar, no se envía correo.

## Pasos (una sola vez, con la cuenta que enviará los correos)

1. Entrar a script.google.com con esa cuenta y crear un proyecto nuevo.
2. Pegar el contenido de `docs/alertas-gmail.gs` (reemplaza el código de ejemplo) y guardar.
3. Configuración del proyecto, Propiedades de la secuencia de comandos, agregar dos: `SECRET` (una clave larga y aleatoria, por ejemplo 40 caracteres) y `TO` (correos que recibirán las alertas, separados por coma).
4. Ejecutar la función `probar` una vez y aceptar el permiso de Gmail. Debe llegar un correo de prueba.
5. Implementar, Nueva implementación, tipo Aplicación web: ejecutar como "Yo" y acceso "Cualquier persona". Copiar la dirección que termina en `/exec`.
6. En la carpeta de Volia Control, doble clic en `configurar-alertas.cmd`: pegar la dirección y luego la clave `SECRET`.
7. Publicar con `publicar-cloudflare.cmd` y, en Inicio, usar "Enviar un resumen de prueba".

## Si algo falla

- A las 14:00 (lunes a viernes) el servidor revisa si el resumen y la revisión del SERCOP de la mañana salieron bien; si no, los reintenta solos.
- Inicio muestra un aviso amarillo cuando el último resumen falló o cuando pasaron dos días hábiles sin ejecutarse.
- Vigilante externo (recomendado): en healthchecks.io cree un chequeo gratis con periodo de 1 día y margen de 6 horas, y pegue su dirección `https://hc-ping.com/...` en el paso 3 de `configurar-alertas.cmd`. El servidor le avisa después de cada ejecución; si no llega el aviso o llega un fallo, healthchecks le escribe a su correo personal, aunque el Worker o el script de Gmail estén caídos.

## Seguridad

Los destinatarios están fijos en el script: quien conozca la clave solo puede escribir a esas direcciones. La clave y la dirección quedan como secretos del servidor, no en el repositorio. Gmail permite unos 100 correos diarios en cuentas gratuitas, muy por encima de lo que se envía aquí.
