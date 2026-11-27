# Publicar Volia Control en Cloudflare

La app se publica como un Worker con base de datos D1 en la cuenta de Cloudflare de Volia.
El acceso a los datos lo controla **Cloudflare Access**: solo entran los correos autorizados y la app
verifica la firma del token de Access en cada consulta (si falta o no es válida, no entrega datos).

## Una sola vez, en el computador que publica (Windows, PowerShell)

1. Cuenta gratuita en https://dash.cloudflare.com (si aún no existe).
2. En la carpeta del proyecto:
   ```powershell
   npm.cmd ci
   npx.cmd wrangler login
   ```
   Se abre el navegador para autorizar a Wrangler en la cuenta. No hace falta crear ni copiar ninguna clave.
3. Copie `.env.cloudflare.example` como `.env.cloudflare` y complete `VOLIA_ALLOWED_EMAILS` con los correos autorizados.

## Primera publicación

La forma más simple en Windows: doble clic en `publicar-cloudflare.cmd`. Inicia sesión en Wrangler si hace falta y ejecuta el script; el detalle queda en `deploy-log.txt`. Equivale a:

```powershell
node scripts/deploy-cloudflare.mjs
```

El script crea la base `volia-control-db` (y guarda su identificador en `.env.cloudflare`), aplica las
migraciones de `drizzle/`, compila y publica. Al terminar muestra la dirección `https://volia-control.<cuenta>.workers.dev`.
En este primer paso los datos quedan cerrados para todos, porque Access todavía no está activo.

## Activar Cloudflare Access

1. Dashboard → **Workers & Pages** → `volia-control` → **Settings** → **Domains & Routes**.
2. En la fila `workers.dev`, **Enable Cloudflare Access**. Autorice los mismos correos.
3. Copie **AUD tag** y **Team domain** en `.env.cloudflare` (`CF_ACCESS_AUD`, `CF_ACCESS_TEAM_DOMAIN`).
4. Publique de nuevo: `node scripts/deploy-cloudflare.mjs`.
5. Recomendado: en la misma pantalla, active Access también para **Preview URLs** o desactívelas.

## Publicaciones siguientes

`node scripts/deploy-cloudflare.mjs` (o doble clic en `publicar-cloudflare.cmd`) (aplica migraciones nuevas si las hay, compila y publica).
Para validar sin publicar: `node scripts/deploy-cloudflare.mjs --check`.

## Agregar o quitar usuarios

Edite `VOLIA_ALLOWED_EMAILS` en `.env.cloudflare` **y** la política de Access en el dashboard, y vuelva a publicar.
Las dos listas deben coincidir: Access decide quién llega a la app; la lista de la app decide quién ve los datos.

## Atlas de osteosíntesis aparte (enlace propio y público)

El Atlas también se publica como aplicación independiente, en su propio Worker (`volia-atlas`), sin base de datos, sin cuenta
y sin Cloudflare Access: cualquiera con el enlace lo abre y puede instalarlo en el celular. Es solo archivos estáticos.

- Publicar: doble clic en `publicar-atlas.cmd` (o `node scripts/build-atlas.mjs` y luego `npx wrangler deploy -c wrangler.atlas.jsonc`).
  Usa el mismo inicio de sesión de Wrangler que Volia Control; no necesita `.env.cloudflare`.
- El enlace queda como `https://volia-atlas.<su-subdominio>.workers.dev`, que Wrangler muestra al terminar.
- Es la misma pantalla del Atlas de Volia Control en modo público: sin precios, sin cotizador. El catálogo lleva solo código,
  nombre, presentación y especialidad de cada ítem; `scripts/build-atlas.mjs` genera esa copia y falla si queda algún campo de precio,
  cantidad o contratista.
- Los estilos salen de `app/globals.css` (bloque «Atlas de osteosíntesis») y el contenido, de `lib/osteo-*.ts`, así que un cambio en
  el Atlas de Volia Control se refleja en el aparte al volver a publicarlo.
- Para dejar de publicarlo: en el dashboard, **Workers & Pages** → `volia-atlas` → **Settings** → eliminar.
