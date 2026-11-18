/**
 * Volia Control: lectura de correo con autorización de su dueño.
 * Se publica como aplicación web desde LA CUENTA DE GMAIL DE CADA PERSONA que quiera participar.
 *
 * Qué hace: cuando Volia Control lo consulta, entrega los correos que esa persona etiquetó con «Volia»
 * (asunto, remitente, fecha, texto, nombres de los adjuntos y un enlace al mensaje) y, después de que
 * Volia Control los guarda, marca esas conversaciones con la etiqueta «volia-leido» para no repetirlas.
 * Qué NO hace: no envía, no borra, no archiva y no mueve nada; no entrega el contenido de los adjuntos;
 * no lee ningún correo sin la etiqueta «Volia». Para dejar de participar basta quitar la etiqueta,
 * o en script.google.com, Implementar, Administrar implementaciones, archivar la implementación.
 *
 * Propiedades de la secuencia de comandos (Configuración del proyecto > Propiedades):
 *   SECRET  clave larga y aleatoria (la misma que se pega en configurar-correo.cmd)
 *   QUERY   (opcional) búsqueda de Gmail de lo que se comparte. Por defecto: label:volia newer_than:60d
 */
var ETIQUETA_LEIDO = 'volia-leido';
var MAX_CORREOS = 40;          // por consulta
var MAX_POR_CONVERSACION = 10; // los más recientes de cada conversación
var MAX_TEXTO = 4000;          // caracteres del cuerpo; Volia Control guarda además solo un extracto sin datos sensibles

function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var secret = props.getProperty('SECRET');
    var body = JSON.parse(e.postData.contents);
    if (!secret || body.secret !== secret) return respuesta({ ok: false, error: 'forbidden' });
    if (body.action === 'pull') return respuesta({ ok: true, mails: leer(body.max, props) });
    if (body.action === 'ack') return respuesta({ ok: true, acked: marcar(body.ids) });
    return respuesta({ ok: false, error: 'acción desconocida' });
  } catch (err) {
    return respuesta({ ok: false, error: String(err) });
  }
}

function consulta(props) {
  var q = (props.getProperty('QUERY') || 'label:volia newer_than:60d').trim();
  // La etiqueta «volia» es la autorización: sin ella nada sale, aunque QUERY se edite por error.
  if (!/(^|\s)label:volia(\s|$)/.test(q)) q = 'label:volia ' + q;
  return q + ' -label:' + ETIQUETA_LEIDO;
}

function leer(max, props) {
  var limite = Math.max(1, Math.min(Number(max) || MAX_CORREOS, MAX_CORREOS));
  var hilos = GmailApp.search(consulta(props), 0, 20);
  var salida = [];
  for (var i = 0; i < hilos.length; i++) {
    var mensajes = hilos[i].getMessages().slice(-MAX_POR_CONVERSACION);
    // Una conversación se entrega completa o se deja para la próxima consulta (se marca por conversación).
    if (salida.length && salida.length + mensajes.length > limite) break;
    for (var j = 0; j < mensajes.length; j++) {
      var m = mensajes[j];
      if (m.isInTrash()) continue;
      salida.push({
        id: m.getId(),
        threadId: hilos[i].getId(),
        from: m.getFrom(),
        subject: m.getSubject(),
        date: m.getDate().toISOString(),
        body: m.getPlainBody().slice(0, MAX_TEXTO),
        attachments: m.getAttachments({ includeInlineImages: false, includeAttachments: true }).map(function (a) {
          return { name: a.getName(), size: a.getSize() };
        }),
        link: 'https://mail.google.com/mail/u/0/#all/' + hilos[i].getId()
      });
    }
  }
  return salida;
}

function marcar(ids) {
  if (!ids || !ids.length) return 0;
  var etiqueta = GmailApp.getUserLabelByName(ETIQUETA_LEIDO) || GmailApp.createLabel(ETIQUETA_LEIDO);
  var hechos = {};
  var n = 0;
  for (var i = 0; i < ids.length && i < 200; i++) {
    var m = GmailApp.getMessageById(String(ids[i]));
    if (!m) continue;
    var hilo = m.getThread();
    if (hechos[hilo.getId()]) continue;
    hechos[hilo.getId()] = true;
    hilo.addLabel(etiqueta);
    n++;
  }
  return n;
}

function respuesta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Ejecutar una vez a mano: pide el permiso de Gmail y muestra en el registro cuántos correos se compartirían. */
function probar() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) throw new Error('Defina primero la propiedad SECRET.');
  var correos = leer(MAX_CORREOS, props);
  Logger.log('Correos con la etiqueta Volia que se compartirían ahora: ' + correos.length);
  correos.forEach(function (c) { Logger.log('- ' + c.date.slice(0, 10) + ' | ' + c.from + ' | ' + c.subject); });
}
