/**
 * Volia Control: envío de alertas por Gmail.
 * Se publica como aplicación web desde la cuenta de Gmail que enviará los correos.
 * Propiedades de la secuencia de comandos (Configuración del proyecto > Propiedades):
 *   SECRET  clave larga y aleatoria (la misma que se pega en configurar-alertas.cmd)
 *   TO      correos que reciben las alertas, separados por coma
 * Los destinatarios quedan fijos aquí: quien tenga la clave solo puede escribir a esas direcciones.
 */
function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var secret = props.getProperty('SECRET');
    var to = (props.getProperty('TO') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var body = JSON.parse(e.postData.contents);
    if (!secret || body.secret !== secret) return respuesta({ ok: false, error: 'forbidden' });
    if (!to.length) return respuesta({ ok: false, error: 'sin destinatarios (propiedad TO)' });
    var asunto = String(body.subject || 'Volia Control').slice(0, 200);
    GmailApp.sendEmail(to.join(','), asunto, String(body.text || '').slice(0, 20000), {
      htmlBody: String(body.html || '').slice(0, 50000),
      name: 'Volia Control'
    });
    return respuesta({ ok: true });
  } catch (err) {
    return respuesta({ ok: false, error: String(err) });
  }
}

function respuesta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Ejecutar una vez a mano: autoriza el permiso de Gmail y envía un correo de prueba. */
function probar() {
  var to = (PropertiesService.getScriptProperties().getProperty('TO') || '').trim();
  if (!to) throw new Error('Defina primero la propiedad TO.');
  GmailApp.sendEmail(to, 'Volia Control: prueba del script', 'El script de alertas funciona.', { name: 'Volia Control' });
}
