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
