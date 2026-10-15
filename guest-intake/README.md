# Recepción de pruebas para Volia

Worker separado del sistema interno. Un enlace firmado y temporal permite recibir un archivo de ejemplo de hasta 5 MB (PDF, DOCX, XLSX, JPG, PNG, TXT o CSV); la bandeja privada requiere una clave. Los archivos se guardan en Workers KV durante siete días. No se usa para documentos clínicos ni información confidencial.

Para una invitación nueva, configure `INVITE_SECRET` y ejecute:

```powershell
node guest-intake/create-invite.mjs
```

Publicado como `https://volia-recepcion.nexodipa.workers.dev`. La URL `/admin` muestra lo recibido. La clave de administración y el secreto de invitaciones están únicamente en `.private-secrets.json`, ignorado por Git, y en los secretos del Worker. No comparta esa clave con terceros.

El enlace de invitación vence a las 48 horas; el archivo recibido vence a los siete días. La bandeja es una herramienta temporal de campo de pruebas: el archivo no se incorpora automáticamente al auditor ni al inventario de Volia Control. Para publicar cambios, despliegue con `wrangler deploy --config guest-intake/wrangler.jsonc` desde la raíz del repositorio. Ejecute `node --test guest-intake/worker.test.mjs` antes.
