# Guía de uso de Volia Control

Esta guía está escrita para que una persona pueda utilizar el sistema sin conocimientos informáticos avanzados. Siga el orden indicado y no omita las verificaciones.

## 1. Regla principal

Volia Control ayuda a organizar y comprobar información, pero no reemplaza la revisión humana. Si un nombre, fecha, código o valor no coincide con el documento original, detenga el proceso y corríjalo antes de continuar.

## 2. Al abrir el sistema

1. Espere a que aparezca la pantalla **Inicio y tareas prioritarias**.
2. Revise las alertas rojas y amarillas.
3. Use **Texto grande** si necesita aumentar la lectura.
4. Active **Alto contraste** si los campos o botones no se distinguen bien.
5. Pulse **Guía de uso** cuando no recuerde un procedimiento.

## 3. Primera configuración

1. Abra **Catálogo maestro**.
2. Revise cada código, descripción y precio.
3. Pulse **Editar** para completar marca, procedencia y costo interno.
4. Verifique el margen mostrado.
5. Desactive productos que ya no deban cotizarse.

El costo interno es indispensable para calcular rentabilidad. No envíe una cotización si el panel indica que faltan costos.

## 4. Crear una cotización

1. Desde Inicio pulse **Nueva cotización**.
2. Complete cliente, hospital, contacto y contrato.
3. Si corresponde, complete paciente, historia clínica, médico y fecha de cirugía.
4. En Productos, seleccione cada artículo del catálogo.
5. Confirme cantidad, costo interno y precio ofertado.
6. Revise descuento, IVA, entrega, pago y garantía.
7. Observe el panel de rentabilidad.
8. Pulse **Descargar PDF** o **Descargar Word**.
9. Abra el archivo y compruebe encabezado, logo, productos, condiciones y total.
10. Solo después de revisar, envíe el documento.

## 5. Registrar una cirugía

1. Abra **Cirugías y cobros**.
2. Pulse **Registrar cirugía**.
3. Complete paciente, fecha, hospital, contrato, factura y valor.
4. Si hubo un abono, escriba el valor cobrado.
5. Marque únicamente los documentos que realmente recibió.
6. Añada la fecha esperada de pago.
7. Pulse **Guardar caso**.
8. Actualice el estado conforme avance el trámite.

No marque **Pagada** hasta verificar la acreditación del dinero.

## 6. Controlar inventario

1. Abra **Inventario**.
2. Registre cada lote por separado.
3. Escriba stock físico, reservado, mínimo y costo.
4. Use **Reservado** para material separado para una cirugía.
5. Registre ventas, cirugías, entradas y pérdidas desde **Estadísticas**.
6. Use los ajustes rápidos únicamente para corregir un conteo físico.
7. Revise semanalmente stock bajo y caducidades menores a 120 días.

## 7. Registrar movimientos

1. Abra **Estadísticas**.
2. Seleccione fecha, tipo de movimiento y producto.
3. Escriba la cantidad.
4. En una venta, escriba obligatoriamente el precio unitario.
5. Añada una nota con factura, cirugía o motivo.
6. Pulse **Registrar movimiento**.

El sistema impide consumir stock reservado mediante una venta o pérdida ordinaria.

## 8. Revisar finanzas

1. Abra **Finanzas**.
2. Configure saldo inicial, presupuesto y meta mensual.
3. Pulse **Importar pendientes** para incorporar cirugías por cobrar.
4. Registre compras, gastos, ventas y otros movimientos.
5. Revise las pestañas **CxC y CxP**, **Presupuesto** y **Tributario**.
6. Confirme IVA y retenciones contra los comprobantes reales.
7. Marque un pago únicamente cuando esté verificado.

## 9. Auditar documentos

1. Abra **Auditor inteligente**.
2. Seleccione hasta seis archivos PDF, JPG, PNG o WEBP; máximo 20 MB.
3. Confirme que está autorizado para revisarlos.
4. Pulse **Ejecutar auditoría**.
5. Espere a que finalice la lectura.
6. Compare nombres, fechas, códigos, cantidades, precios y totales con el original.
7. Revise advertencias y errores.
8. Exporte el informe si necesita archivarlo.

Una lectura OCR puede equivocarse por sombras, inclinación, baja resolución o escritura poco legible.

## 10. Generar documentos

1. Abra **Documentos**.
2. Elija carta, acta, informe o solicitud.
3. Complete destinatario, institución, asunto y detalle.
4. Revise la vista previa.
5. Descargue PDF o Word.
6. El documento quedará en el archivo local para volver a abrirlo.
7. Revise y firme antes de emitirlo.

## 10 ter. Fichas técnicas de dispositivos médicos

1. Abra **Documentos** y baje hasta **Fichas técnicas**.
2. Marque a la izquierda los productos que quiere en el Word (vienen las ocho de cadera del pliego) y pulse uno para editarlo.
3. Ajuste nombre, composición, color, descripción, indicaciones y la tabla de medidas. En **Datos fijos del encabezado** están país, fabricante, importador, registro sanitario y riesgo; valen para todas las fichas.
4. Elija la foto: las incluidas son del catálogo del fabricante y las más parecidas disponibles; si tiene la foto real, use **Subir otra foto**.
5. Pulse **Descargar … en Word**. El documento sale en el formato rojo de Osteotech, con el logo y las tablas de la plantilla, una ficha por cada tres páginas.

**Armar desde un pliego.** En **Armar desde un pliego o requerimiento** cargue el PDF del pliego (o pegue una línea por producto) y pulse **Buscar fichas**. Para cada línea la app sugiere una ficha de la biblioteca, o un borrador nuevo si no hay ninguna parecida. Si las medidas del nombre no coinciden (por ejemplo un tornillo de 4.5 mm frente a la ficha de 6.5 mm), no sugiere esa ficha. Elija en cada línea y pulse **Marcar estas fichas**: los borradores nuevos salen sin tabla de medidas, información ni foto, y hay que completarlos.

Los avisos en rojo (falta un dato, tabla vacía, sin foto) no impiden descargar. Antes de enviar, compare el registro sanitario y las medidas con el pliego y con el certificado del producto: la app no los verifica. **Nueva ficha** crea una copia de la ficha abierta para otro producto, y **Restaurar datos originales** devuelve una ficha base a como vino.

## 10 quater. Importaciones: costo puesto en bodega

Sirve para decidir si conviene importar un producto en lugar de comprarlo a un distribuidor local. Se abre desde **Más herramientas, Importaciones**.

1. Escriba la referencia del embarque y los costos totales: flete, seguro, agente de aduana, almacenaje, transporte a bodega y otros.
2. Por cada producto, indique cantidad, precio FOB por unidad y el porcentaje de ad valorem de su subpartida arancelaria. Opcionalmente, el costo local actual y el precio de venta.
3. El sistema calcula el CIF, los tributos (ad valorem, FODINFA, ISD), el costo unitario en bodega, el ahorro frente a la compra local y el margen.
4. Pulse **Guardar embarque** para conservarlo y **Descargar CSV** para llevarlo a una hoja de cálculo.

Las tasas por defecto (FODINFA 0,5 %, IVA 15 %, ISD 5 %) se pueden cambiar en **Tasas y criterios de cálculo**. Antes de decidir, confirme con su agente de aduana el ad valorem de la subpartida, si el ISD tiene tarifa diferenciada y si el flete entra en la base de cálculo. Si vende con IVA 0 %, desmarque «IVA recuperable», porque entonces el IVA de la importación pasa a ser costo.

La columna **Mercado** solo muestra un precio cuando el producto de referencia es el mismo; si el más parecido es otro producto, lo avisa en lugar de compararlo.

## 10 quinquies. Correo: bandeja inteligente

Lee los correos que cada persona etiquetó con **Volia** en su Gmail, los separa por tema (contratación pública, cotizaciones, pedidos, cobros y pagos, regulatorio, proveedores) y muestra los datos que encontró: plazo, código de proceso, montos, factura y RUC. Se abre desde **Más herramientas, Correo**.

1. Cada persona conecta su propio buzón una sola vez (pasos en `docs/correo.md`) y decide qué comparte etiquetando el correo con **Volia**. Lo que no tiene la etiqueta no se lee.
2. El sistema lee solo cada día hábil a las 08:00 y el resumen de esa mañana ya incluye una sección «Correo» (pendientes por tema y plazos cercanos); **Revisar correo ahora** lo hace al momento.
3. Por cada correo puede **Abrir en Gmail**, **Seguir proceso** (si trae un código del SERCOP), **Armar cotización** (si pide productos), **Marcar revisado** o **Descartar**.
4. Los procesos del SERCOP que llegan por correo pasan solos a **Procesos** como «Por revisar». **Armar cotización** abre el cotizador con los renglones pedidos para que los revise; no crea nada sin su visto bueno.

Privacidad: es solo lectura, no se guardan contraseñas ni números de tarjeta, no se guarda el contenido de los adjuntos y los correos se borran de Volia Control a los 90 días. Todo el equipo ve los correos compartidos: etiquete solo lo que quiera compartir.

## 10 sexies. Vigencias: pedir la renovación a tiempo

El resumen de las 08:00 avisa con anticipación según el tipo de documento: 180 días antes para registros sanitarios, 150 para notificaciones sanitarias y 120 para certificados ISO, con el nombre de quien debe renovarlo. En **Vigencias**, cada documento que ya está en ese plazo (o vencido) tiene el botón **Pedir renovación**: arma un borrador de correo para el titular con la referencia, la fecha de vencimiento y los ítems que respalda. Usted lo revisa y lo copia o lo abre en su correo; el sistema no envía nada. Los plazos son internos de Volia, no legales; se ajustan en `lib/renewal-plan.ts`.

## 10 septies. Cobros: recordatorio al cliente

En **Finanzas, CxC y CxP**, cada cobro vencido tiene el botón **Redactar recordatorio**. El tono sube con los días de mora (recordatorio amable, seguimiento, segundo aviso y requerimiento formal) y el borrador sale dirigido al responsable vigente de ese cliente si está registrado en Cirugías, Responsables. Usted lo revisa y lo copia o lo abre en su correo; el sistema no envía nada. El resumen de las 08:00 indica, en cada cobro vencido, la gestión que toca.

## 10 octies. Procesos: seguimiento de la oferta presentada

Cuando un proceso pasa a **Oferta presentada**, el sistema guarda ese día (se puede corregir en «Detalle y notas») y cuenta los días desde entonces. El resumen de las 08:00 indica qué toca: revisar el portal, ver el estado, consultar a la entidad o registrar el resultado. En «Detalle y notas», el botón **Consultar estado a la entidad** arma un borrador para el responsable de compras de esa entidad (el de Cirugías, Responsables). El borrador solo pregunta por el estado y recuerda que las comunicaciones oficiales van por el portal; revise primero el portal, y envíelo usted desde su correo: el sistema no envía nada. Registrar siempre el resultado y el precio de cierre mejora la tasa de éxito y el descuento típico que ve en Procesos.

## 10 nonies. Resumen del lunes: la semana pasada

El resumen del lunes cierra con una sección **La semana pasada**: procesos nuevos, ofertas presentadas, resultados (adjudicados o perdidos), la tasa de éxito acumulada y lo cobrado y pagado. Para que cuente, registre los resultados en Procesos y marque los cobros y pagos en Finanzas cuando ocurran: el sistema guarda ese día. Si un proceso se perdió y falta el precio de cierre, el resumen se lo recuerda.

## 10 decies. Inventario: qué reponer y qué vence

En Inventario, cada producto que conviene pedir muestra una etiqueta con la cantidad orientativa y los días que alcanza el stock. Arriba de la lista aparece **Qué conviene pedir**, con el botón **Lista de reposición**, que copia el texto para su solicitud de compra; el sistema no envía nada. El cálculo usa las ventas y los usos en cirugía de los últimos 90 días, lo reservado y el mínimo del producto; lo vencido no cuenta como disponible. Para que sea fiable, registre las salidas como movimientos y no solo como ajustes de stock, que no cuentan como consumo. El resumen del lunes agrega las secciones **Inventario por caducar** y **Reposición sugerida**.

## 10 undecies. Cirugías: qué gestionar

En Cirugías, la tarjeta **Qué gestionar** lista los casos que necesitan una acción hoy, de lo más urgente a lo menos: con observaciones, pago vencido, factura sin respuesta (preguntar a los 15 días de presentada, insistir a los 30, pedir respuesta por escrito a los 45), factura lista para presentar (3 días después de la cirugía), documentos pendientes (5 días después de la cirugía) y aprobada sin fecha de pago. Donde corresponde, **Redactar mensaje** arma el borrador a la institución, con el responsable que tenga registrado, para copiarlo o abrirlo en su correo; el sistema no envía nada. El borrador identifica el caso por la factura y el contrato, nunca por el nombre del paciente. Los casos se guardan solo en este dispositivo, por eso no entran al resumen por correo. Los plazos son criterios internos de Volia, no plazos de la institución, y se ajustan en `lib/case-plan.ts`.

## 10 duodecies. Cotizaciones: seguimiento de lo enviado

En el Cotizador, dentro de **Memoria Volia**, cada oferta guardada tiene botones de seguimiento. Cuando la envíe al cliente, pulse **Marcar enviada**: el sistema anota el día. A los 5, 10 y 20 días sin respuesta le avisa en el resumen de las 08:00 y en la oferta aparece «toca dar seguimiento». **Redactar seguimiento** arma el mensaje al responsable del cliente (el que tenga registrado, o el contacto de la oferta), con la vigencia de la oferta; usted lo copia o lo abre en su correo y el sistema no envía nada. El mensaje no incluye datos del paciente. Cuando el cliente decida, marque **Ganada** o **Perdida** y deja de avisar. Solo se sigue lo que usted marcó como enviado, y a los 90 días el aviso se detiene. Guardar de nuevo una oferta no borra su estado. Los plazos son criterios internos de Volia, se ajustan en `lib/quote-followup.ts`.

## 10 terdecies. Procesos adjudicados: qué sigue

Cuando en **Licitaciones** un proceso pasa a **Adjudicado a Volia**, el sistema anota el día. A los 3 días el resumen de las 08:00 recuerda revisar el contrato y las garantías; a los 15, coordinar la entrega; y a los 30, si en **Finanzas** todavía no hay un ingreso a esa entidad desde la adjudicación, avisa que falta confirmar la entrega y facturar. En el proceso, dentro de **Resultado y notas**, aparece el mismo «Qué sigue». Si ya registró una factura a esa entidad (el nombre debe coincidir con el del proceso), el aviso se detiene. Solo se siguen los procesos adjudicados con el día registrado, y a los 120 días el aviso se apaga. Los plazos del contrato y de la entrega los fijan el pliego y el portal del SERCOP; los tramos del aviso son criterios internos de Volia, se ajustan en `lib/award-followup.ts`.

## 10 quaterdecies. Caja de las próximas semanas

El informe del lunes incluye, cuando hay cobros o pagos pendientes en **Finanzas**, un cuadro por semana de las próximas cuatro: cuánto se espera cobrar, cuánto hay que pagar y el saldo. Si en una semana los pagos superan lo que se espera cobrar, el título del cuadro lo dice y esa línea lo marca, para mover un cobro o negociar un pago con tiempo. Se calcula con las fechas de vencimiento que usted registró; un cobro suele entrar después del vencimiento, así que léalo como una guía y no como una promesa. Los cobros ya vencidos no se suman a ninguna semana, se nombran aparte. No incluye el saldo que haya en caja. Si ese lunes no hay nada más que avisar, el cuadro no se envía solo.

## 10 quindecies. Cotizaciones en el informe mensual

El informe mensual (primer día hábil de cada mes) suma un bloque **Cotizaciones**: cuántas ofertas se enviaron el mes anterior y por cuánto, cuántas se ganaron o perdieron en ese mes, qué porcentaje de lo decidido se ganó y cuántas siguen sin respuesta (y cuántas de ellas llevan 30 días o más). Para que cuente, marque cada oferta en el Cotizador, dentro de **Memoria Volia**: **Marcar enviada**, y luego **Ganada** o **Perdida** cuando el cliente decida; el sistema anota el día de cada marca. Lo que no se marca no entra en las cuentas, y las ofertas que ya estaban marcadas ganadas o perdidas antes de esta función no tienen el día de la decisión, así que no aparecen en el mes. El porcentaje es de lo decidido, no de todo lo enviado.

## 10 sexdecies. Atlas de osteosíntesis

En **Más herramientas > Atlas de osteosíntesis** hay modelos 3D para aprender y explicar el producto. Arriba se elige la región: **Radio distal** o **Tibia (diáfisis)**; al cambiar de región se cambian el modelo, las fracturas, los implantes, las lecciones y el quiz (el Catálogo es el mismo). En la tibia se ven el hueso con el peroné, tres fracturas de la diáfisis (42A3 transversa, 42B2 en cuña por flexión y 42C2 segmentaria) y el clavo endomedular bloqueado, la placa medial en puente y el fijador externo, cada uno con sus tornillos o pines; en el HECAM 2026 no hay un sistema de clavo tibial estándar, solo el recubierto con antibiótico, y el atlas lo avisa. Gire el modelo arrastrando, acérquelo con los dedos y toque cualquier parte del hueso o de un implante: a la derecha aparece qué es, qué se cuida y qué implante lo cubre. Las pestañas son: **Explorar** (partes y las medidas de la radiografía), **Fracturas** (tres patrones AO/OTA con la fractura desplazada y reducida), **Implantes** (en el radio, placa volar bloqueada, agujas de Kirschner y fijador externo; con técnica, complicaciones y los precios de referencia del HECAM 2026), **Catálogo**, **Lecciones** y **Quiz**. En **Catálogo** están todos los implantes de Traumatología de la programación del HECAM (placas, miniplacas, clavos endomedulares y cefalomedulares, tornillos, fijadores externos, agujas y cerclajes, anclas, prótesis, cementos, sustitutos óseos y columna) agrupados por familia: al elegir una familia se explica qué es, cómo funciona, dónde se usa y qué mirar al cotizar; la lista se filtra por texto, región y material, y cada ítem muestra el precio referencial, el adjudicado y la cantidad programada. Los ítems con un precio muy bajo para su familia llevan un aviso para revisar la unidad en el pliego. La clasificación se hizo con el nombre del ítem y puede equivocarse: la fuente es el pliego. Los precios son los públicos del hospital, no el precio de venta de Volia. El contenido es material interno de formación y está pendiente de revisión por un traumatólogo; no lleva datos de pacientes.

## 10 bis. Traducir un documento del inglés

1. Abra **Traductor**.
2. Elija un PDF o una foto (máximo 20 MB y 40 páginas).
3. Elija **En esta computadora (Chrome)** si el documento tiene datos sensibles. Elija **Gemini** solo si no tiene datos de pacientes y marque la confirmación.
4. Pulse **Traducir al español** y espere.
5. Lea el resultado completo, corrija el texto y descargue en **Word** o **PDF**.

Es una traducción automática: siempre debe revisarla una persona. Si el archivo es una foto, la lectura puede fallar por sombras o inclinación.

## 11. Respaldo diario

1. Pulse **Instalar y respaldar**.
2. Pulse **Descargar respaldo**.
3. Guarde el archivo en una carpeta identificada por fecha.
4. Conserve una segunda copia en un medio seguro y cifrado.
5. Para recuperar datos, pulse **Restaurar** y seleccione el archivo.
6. Después de restaurar, revise totales, inventario y expedientes.

**Respaldo automático.** En **Respaldo cifrado**, escriba la clave y marque **Guardar solo mientras trabajo**. Mientras la pestaña esté abierta, la copia se actualiza sola cada 5 minutos si hubo cambios. La clave solo vive en la memoria de la pestaña: si la cierra o recarga, hay que escribirla otra vez. Si el botón dice "revisar", el guardado automático se detuvo (sesión vencida o hay una versión más nueva): ábralo y siga las indicaciones.

Nunca envíe el respaldo por un canal público ni lo suba a GitHub.

**Menú.** Lo de uso diario (Inicio, Cirugías y cobros, Inventario, Finanzas, Cotizador, Procesos y Mercado SERCOP) está siempre a la vista. El resto (Catálogo maestro, Auditor inteligente, Vigencias, Estadísticas, Documentos, Traductor, Memoria y reglas, Atlas de osteosíntesis, Historial y Guía de uso) está en **Más herramientas**, que se despliega con un clic y se abre sola si entra a uno de esos módulos.

## 11 bis. Mercado SERCOP: qué procesos conviene ofertar

1. Abra **Mercado SERCOP** (menú «Vender»).
2. Al abrir, **Qué conviene ofertar ahora** muestra los procesos recientes que encajan, del más al menos conveniente, con la razón de cada uno (por ejemplo, ya le ofertamos a ese hospital o hay pocos oferentes). Use **Dar seguimiento** para llevarlo a Licitaciones o **No me interesa** para que no vuelva a aparecer (se recupera desde «Descartados»). Para ver todo el mercado pulse **Explorar todo el mercado**, y allí **Solo lo que encaja con nuestros productos**. El sistema lee la descripción de cada proceso y lo marca con **Encaje alto** (traumatología, osteosíntesis o varias coincidencias) o **Encaje medio** (por ejemplo jeringas, guantes o material dental). Los servicios, el mantenimiento y los equipos quedan fuera.
3. Ajuste con **Provincia**, **Hospital o entidad**, **Monto** y los filtros de «Más filtros». Cada filtro activo aparece como una etiqueta que se quita con un clic.
4. El botón **Solo lo que solemos ofertar** usa otro criterio: provincia, método y rango de monto de las ofertas pasadas de Volia.
5. Si un producto suyo no se reconoce, agréguelo con una descripción clara en **Catálogo maestro**: el sistema aprende de él.

**Nuevos en el SERCOP.** De lunes a viernes a las 08:00 el sistema consulta solo el SERCOP, deja arriba lo que encaja con nuestros productos y envía el aviso por correo con el enlace «Dar seguimiento». El histórico y las estadísticas se actualizan el día 14 de cada mes: llega un cambio llamado «Datos de mercado SERCOP» en GitHub. Hay que aprobarlo (*merge*) y volver a publicar. Inicio avisa cuando los datos tienen más de un mes.

## 11 ter. Responsables institucionales y exportaciones

- En **Cirugías**, cada hospital guarda su responsable por período; el sistema usa el vigente en la fecha de cada trámite.
- Los módulos de Finanzas, Inventario, Cirugías y Análisis tienen un menú **Exportar** con PDF, Word y CSV.

## 12. Lista antes de cerrar

- [ ] Revisé nombres, fechas, códigos y valores.
- [ ] Confirmé que PDF y Word se abren correctamente.
- [ ] Actualicé pagos y movimientos de inventario.
- [ ] Revisé las alertas de Inicio.
- [ ] Descargué el respaldo del día.

## 13. Solución de problemas

| Problema | Acción recomendada |
|---|---|
| No aparecen registros | Verifique que está usando el mismo navegador y perfil |
| Se borraron datos | Restaure el último respaldo disponible |
| El PDF no abre | Descárguelo nuevamente y pruebe con Chrome o Edge |
| El OCR no reconoce texto | Use una imagen recta, nítida, iluminada y sin sombras |
| Un total no coincide | Revise cantidades, descuento, IVA y precios unitarios |
| No permite una salida | Confirme stock disponible y unidades reservadas |
| La letra es pequeña | Active Texto grande en la parte superior |

## 14. Soporte interno

Al reportar un problema indique módulo, acción, mensaje mostrado, navegador y sistema operativo. Adjunte únicamente capturas sin información confidencial.

No incluya nombres de pacientes, cédulas, historias clínicas, facturas ni respaldos en incidencias públicas.
