import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDocNumber, parseSriXml, planImport, sriDate } from "../lib/sri-xml.ts";

const OWN = "1793206800001";
const venta = `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
 <infoTributaria><ambiente>2</ambiente><tipoEmision>1</tipoEmision><razonSocial>VOLIA S.A.S.</razonSocial>
  <ruc>${OWN}</ruc><claveAcceso>1510202601179320680000120010010000001231234567811</claveAcceso><codDoc>01</codDoc>
  <estab>001</estab><ptoEmi>001</ptoEmi><secuencial>000000123</secuencial><dirMatriz>Quito</dirMatriz></infoTributaria>
 <infoFactura><fechaEmision>15/10/2026</fechaEmision><tipoIdentificacionComprador>04</tipoIdentificacionComprador>
  <razonSocialComprador>HOSPITAL DE ESPECIALIDADES &amp; CIA</razonSocialComprador><identificacionComprador>1760000000001</identificacionComprador>
  <totalSinImpuestos>100.00</totalSinImpuestos><totalDescuento>0.00</totalDescuento>
  <totalConImpuestos><totalImpuesto><codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje><baseImponible>100.00</baseImponible><valor>15.00</valor></totalImpuesto></totalConImpuestos>
  <importeTotal>115.00</importeTotal><moneda>DOLAR</moneda></infoFactura>
 <detalles><detalle><codigoPrincipal>J10</codigoPrincipal><descripcion>Jeringa 10 ml</descripcion><cantidad>1000</cantidad><precioUnitario>0.10</precioUnitario><descuento>0</descuento><precioTotalSinImpuesto>100.00</precioTotalSinImpuesto></detalle></detalles>
</factura>`;

const compraEnvuelta = `<?xml version="1.0" encoding="UTF-8"?>
<autorizacion><estado>AUTORIZADO</estado><numeroAutorizacion>0910202601179000000000120020030000004561234567819</numeroAutorizacion>
<fechaAutorizacion>2026-10-09T10:00:00-05:00</fechaAutorizacion><ambiente>PRODUCCIÓN</ambiente>
<comprobante><![CDATA[<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="2.1.0"><infoTributaria><razonSocial>PRODIMEDA CIA. LTDA.</razonSocial><ruc>1790000000001</ruc><claveAcceso>0910202601179000000000120020030000004561234567819</claveAcceso><codDoc>01</codDoc><estab>002</estab><ptoEmi>003</ptoEmi><secuencial>000000456</secuencial></infoTributaria><infoFactura><fechaEmision>09/10/2026</fechaEmision><razonSocialComprador>VOLIA S.A.S.</razonSocialComprador><identificacionComprador>${OWN}</identificacionComprador><totalSinImpuestos>50.00</totalSinImpuestos><totalConImpuestos><totalImpuesto><codigo>2</codigo><codigoPorcentaje>4</codigoPorcentaje><baseImponible>50.00</baseImponible><valor>7.50</valor></totalImpuesto></totalConImpuestos><importeTotal>57.50</importeTotal></infoFactura><detalles><detalle><codigoPrincipal>G75</codigoPrincipal><descripcion>Guante quirúrgico 7.5</descripcion><cantidad>100</cantidad><precioUnitario>0.50</precioUnitario><descuento>0</descuento><precioTotalSinImpuesto>50.00</precioTotalSinImpuesto></detalle></detalles></factura>]]></comprobante></autorizacion>`;

const retencion = `<comprobanteRetencion id="comprobante" version="2.0.0"><infoTributaria><razonSocial>HOSPITAL DE ESPECIALIDADES</razonSocial><ruc>1760000000001</ruc><claveAcceso>2010202607176000000000120010010000000771234567812</claveAcceso><estab>001</estab><ptoEmi>001</ptoEmi><secuencial>000000077</secuencial></infoTributaria>
<infoCompRetencion><fechaEmision>20/10/2026</fechaEmision><razonSocialSujetoRetenido>VOLIA S.A.S.</razonSocialSujetoRetenido><identificacionSujetoRetenido>${OWN}</identificacionSujetoRetenido></infoCompRetencion>
<docsSustento><docSustento><codDocSustento>01</codDocSustento><numDocSustento>001001000000123</numDocSustento><retenciones>
<retencion><codigo>1</codigo><codigoRetencion>312</codigoRetencion><baseImponible>100.00</baseImponible><porcentajeRetener>1.75</porcentajeRetener><valorRetenido>1.75</valorRetenido></retencion>
<retencion><codigo>2</codigo><codigoRetencion>9</codigoRetencion><baseImponible>15.00</baseImponible><porcentajeRetener>30</porcentajeRetener><valorRetenido>4.50</valorRetenido></retencion>
</retenciones></docSustento></docsSustento></comprobanteRetencion>`;

test("parses a sale invoice with entities and IVA", () => {
  const d = parseSriXml(venta);
  assert.equal(d.kind, "factura");
  assert.equal(d.number, "001-001-000000123");
  assert.equal(d.date, "2026-10-15");
  assert.equal(d.buyerName, "HOSPITAL DE ESPECIALIDADES & CIA");
  assert.equal(d.subtotal, 100);
  assert.equal(d.iva, 15);
  assert.equal(d.total, 115);
  assert.equal(d.lines[0].quantity, 1000);
});

test("unwraps an authorized invoice from the SRI portal", () => {
  const d = parseSriXml(compraEnvuelta);
  assert.equal(d.issuerName, "PRODIMEDA CIA. LTDA.");
  assert.equal(d.lines[0].code, "G75");
  assert.equal(d.iva, 7.5);
});

test("parses withholding v2 and plans the import from Volia's side", () => {
  const docs = [venta, compraEnvuelta, retencion].map(parseSriXml);
  assert.equal(docs[2].withholdings.length, 2);
  const plan = planImport(docs, OWN, new Set());
  assert.equal(plan.records.length, 2);
  const income = plan.records.find((r) => r.direction === "income");
  assert.equal(income.document, "FAC 001-001-000000123");
  assert.equal(income.dueDate, "2026-11-14");
  const expense = plan.records.find((r) => r.direction === "expense");
  assert.equal(expense.counterparty, "PRODIMEDA CIA. LTDA.");
  assert.deepEqual(plan.withholdings, [{ document: "001-001-000000123", amount: 6.25, detail: "Retención 001-001-000000077 de HOSPITAL DE ESPECIALIDADES" }]);
  assert.equal(plan.purchases.length, 1);
  const again = planImport(docs, OWN, new Set(plan.records.map((r) => r.id).concat(docs[2].key)));
  assert.equal(again.records.length, 0);
  assert.equal(again.skipped.length, 3);
});

test("helpers", () => {
  assert.equal(sriDate("5/3/2026"), "2026-03-05");
  assert.equal(normalizeDocNumber("001001000000123"), "001-001-000000123");
  assert.equal(parseSriXml("<html></html>"), null);
});

test("purchases update existing stock by code and create missing products", async () => {
  const { applyPurchasesToStock } = await import("../lib/sri-xml.ts");
  let n = 0;
  const items = [{ id: "i1", code: "g75", product: "Guante 7.5", lot: "", expiry: "", location: "B", stock: 10, reserved: 0, minimum: 0, unitCost: 0.4 }];
  const purchases = [{ document: "FAC 1", date: "2026-10-09", supplier: "X", lines: [
    { code: "G75", description: "Guante quirúrgico 7.5", quantity: 100, unitPrice: 0.5, discount: 0, total: 50 },
    { code: "", description: "Gasa 10x10", quantity: 20, unitPrice: 0.1, discount: 0, total: 2 } ] }];
  const r = applyPurchasesToStock(items, [], purchases, () => `id${++n}`);
  assert.equal(r.items[0].stock, 110);
  assert.equal(r.items[0].unitCost, 0.5);
  assert.equal(r.created, 1);
  assert.equal(r.items[1].stock, 20);
  assert.equal(r.movements.length, 2);
  assert.equal(items[0].stock, 10);
});
