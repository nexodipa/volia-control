// Documentos regulatorios y de respaldo extraídos de la carpeta "informacion programa" (oct. 2026).
// Las fechas salen de los certificados; los vacíos (expiresAt: null) significan "no se pudo leer, revisar el PDF".
export const REGULATORY_KEY = "volia-regulatory-docs-v1";

export type RegulatoryKind = "Registro sanitario" | "Notificación sanitaria" | "ISO" | "Autorización de distribuidor";

export type RegulatoryRecord = {
  id: string;
  kind: RegulatoryKind;
  reference: string;
  subject: string;
  items: string; // ítems del informe de necesidad que respalda
  expiresAt: string | null; // YYYY-MM-DD
  note: string;
};

const r = (id: string, kind: RegulatoryKind, reference: string, subject: string, items: string, expiresAt: string | null, note = ""): RegulatoryRecord => ({ id, kind, reference, subject, items, expiresAt, note });

export const REGULATORY_SEED: RegulatoryRecord[] = [
  r("rs-12578-dme-0122", "Registro sanitario", "12578-DME-0122", "Jeringas hipodérmicas Andino (Prodimeda)", "21, 22, 23, 24, 25", "2027-01-04", "Reinscribir antes de esta fecha."),
  r("rs-58-dmn-1117", "Registro sanitario", "58-DMN-1117", "Botas, cubrezapatos y mascarilla (Dhisve, no estériles)", "6, 9, 28", "2027-11-23"),
  r("rs-115-dmn-1119", "Registro sanitario", "115-DMN-1119", "Depresor de lengua (Madeortega)", "10", "2029-11-21"),
  r("rs-7017-dme-0519", "Registro sanitario", "7017-DME-0519", "Electrodo adulto", "11", null, "Vigencia no legible en texto; revisar PDF."),
  r("rs-dm-2668-06-13", "Registro sanitario", "DM-2668-06-13", "Equipo microgotero 150 ml", "12", "2028-06-11"),
  r("rs-9307-mee-0824", "Registro sanitario", "9307-MEE-0824", "Gel alcohol (Softalind)", "15", "2029-08-14"),
  r("rs-dm-0926-03-05", "Registro sanitario", "DM-0926-03-05", "Guantes quirúrgicos sin polvo", "16, 17, 18", "2030-04-08"),
  r("rs-dm-1793-07-10", "Registro sanitario", "DM-1793-07-10", "Algodón hidrófilo, torundas y motitas", "5", "2030-07-01"),
  r("rs-3001-dme-0917", "Registro sanitario", "3001-DME-0917", "Paquete con indicador biológico KPCD222-C", "26", "2027-09-26"),
  r("rs-3615-dme-0318", "Registro sanitario", "3615-DME-0318", "Cinta química externa para vapor", "7", null, "Vigencia no legible en texto; revisar PDF."),
  r("rs-10169-9442", "Registro sanitario", "10169-DME-0920 / 9442-DME-0720", "Curitas / tira adhesiva", "31", "2027-09-29"),
  r("rs-372-dmn-0720", "Registro sanitario", "372-DMN-0720", "Espéculo vaginal Caricia (componente del set Papanicolaou)", "29", "2030-07-17"),
  r("rs-18209-dme-0325", "Registro sanitario", "18209-DME-0325", "Cepillo citológico (componente del set Papanicolaou)", "29", "2030-03-06"),
  r("rs-130-dmn-0320", "Registro sanitario", "130-DMN-0320", "Citoespátula (componente del set Papanicolaou)", "29", "2030-03-20"),
  r("rs-221-dmn-0520", "Registro sanitario", "221-DMN-0520", "Venda de gasa", "33", "2028-05-18", "La ficha del ítem 33 indica 2028 y el certificado individual 2030. Se usa la fecha más cercana hasta verificar."),
  r("ns-hipoclorito", "Notificación sanitaria", "Hipoclorito, formaldehído, sulfato férrico", "Químicos con notificación sanitaria", "13, 19, 20, 30", "2029-02-04"),
  r("ns-contenedores", "Notificación sanitaria", "Contenedores", "Contenedor cortopunzante y frasco de biopsia", "8, 14", "2029-04-15"),
  r("ns-portaplacas", "Notificación sanitaria", "Portaplacas y portaobjetos", "Componentes del set Papanicolaou", "29", "2029-06-27"),
  r("iso-9001-a", "ISO", "ISO 9001 (dispositivos médicos)", "Certificado de calidad", "Varios", "2027-07-18"),
  r("iso-9001-b", "ISO", "ISO 9001 (insumos médicos)", "Certificado de calidad", "Varios", "2027-08-07"),
  r("iso-13485", "ISO", "ISO 13485 (dispositivos médicos)", "Certificado de gestión de calidad de productos sanitarios", "Varios", "2028-08-07"),
  r("iso-compilado", "ISO", "ISO en el compilado REGISTRO SANITARIO.pdf", "Copia antigua dentro del compilado", "Varios", "2026-08-07", "Ya vencido: reemplazar por la copia con vigencia 2027."),
  r("aut-bio-in", "Autorización de distribuidor", "BIO-IN S.A. a Volia", "Distribución de indicadores biológicos y Bowie-Dick para unidades de salud del DMQ", "26, 27", "2027-11-04"),
  r("aut-nipro", "Autorización de distribuidor", "Nipro, certificado No. 0034", "Tirillas de glucosa. Válida solo para SIE-MDMQ-2026-2503, 60 días desde su emisión", "32", null, "Fecha de emisión no legible; pedir autorización nueva para otro proceso. No hay número de registro sanitario en el archivo."),
];
