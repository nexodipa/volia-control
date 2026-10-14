import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const cloudSnapshots = sqliteTable("cloud_snapshots", {
  ownerId: text("owner_id").primaryKey(),
  revision: integer("revision").notNull(),
  encryptedPayload: text("encrypted_payload").notNull(),
  checksum: text("checksum").notNull(),
  deviceId: text("device_id").notNull(),
  keysCount: integer("keys_count").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const cloudSnapshotVersions = sqliteTable(
  "cloud_snapshot_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerId: text("owner_id").notNull(),
    revision: integer("revision").notNull(),
    encryptedPayload: text("encrypted_payload").notNull(),
    checksum: text("checksum").notNull(),
    deviceId: text("device_id").notNull(),
    keysCount: integer("keys_count").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("cloud_versions_owner_revision_idx").on(
      table.ownerId,
      table.revision,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Base de datos de negocio (consultable). No contiene datos de pacientes:
// los expedientes de cirugía siguen en el bloque cifrado de arriba.
// Todos los importes se guardan en centavos (enteros) para evitar errores
// de punto flotante.
// ---------------------------------------------------------------------------

export const USER_ROLES = ["propietario", "ventas", "bodega", "lectura"] as const;
export const PRICE_TIERS = ["volia", "clinicas", "contado", "pvp"] as const;
export const DOCUMENT_KINDS = ["registro_sanitario", "notificacion_sanitaria", "ficha_tecnica", "iso", "autorizacion_distribuidor", "otro"] as const;
export const QUOTE_STATUSES = ["borrador", "revision", "aprobada", "facturada", "anulada"] as const;
export const TENDER_OUTCOMES = ["pendiente", "ganado", "perdido", "desierto"] as const;

export const appUsers = sqliteTable(
  "app_users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: USER_ROLES }).notNull().default("lectura"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("app_users_email_idx").on(t.email)],
);

export const suppliers = sqliteTable(
  "suppliers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    contact: text("contact"),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("suppliers_name_idx").on(t.name)],
);

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull().default("General"),
    brand: text("brand"),
    origin: text("origin"),
    unit: text("unit").notNull().default("UNIDAD"),
    cpc: text("cpc"),
    cudim: text("cudim"),
    // Valores vigentes que usa el cotizador; el historial por proveedor y tarifa queda en supplier_offers y price_tiers.
    referenceCostCents: integer("reference_cost_cents").notNull().default(0),
    salePriceCents: integer("sale_price_cents").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("products_code_idx").on(t.code), index("products_cudim_idx").on(t.cudim)],
);

// Costo por proveedor y fecha: permite elegir "el costo más competitivo"
// y conservar el historial de cuánto cambió cada costo.
export const supplierOffers = sqliteTable(
  "supplier_offers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id").notNull(),
    supplierId: integer("supplier_id").notNull(),
    unitCostCents: integer("unit_cost_cents").notNull(),
    validFrom: text("valid_from").notNull(),
    source: text("source"),
  },
  (t) => [index("supplier_offers_product_idx").on(t.productId, t.validFrom)],
);

// Un precio por nivel (Volia, Clínicas, Contado, PVP) y fecha de vigencia.
export const priceTiers = sqliteTable(
  "price_tiers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id").notNull(),
    tier: text("tier", { enum: PRICE_TIERS }).notNull(),
    priceCents: integer("price_cents").notNull(),
    validFrom: text("valid_from").notNull(),
  },
  (t) => [index("price_tiers_lookup_idx").on(t.productId, t.tier, t.validFrom)],
);

// Registro sanitario y ficha técnica, con vencimiento vigilable por consulta.
// Un documento puede respaldar varios productos (o ninguno, como un ISO o una autorización).
export const regulatoryDocuments = sqliteTable(
  "regulatory_documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    kind: text("kind", { enum: DOCUMENT_KINDS }).notNull(),
    reference: text("reference").notNull(),
    subject: text("subject").notNull().default(""),
    coveredItems: text("covered_items").notNull().default(""),
    issuedAt: text("issued_at"),
    expiresAt: text("expires_at"),
    fileRef: text("file_ref"),
    note: text("note").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("regulatory_code_idx").on(t.code),
    index("regulatory_expiry_idx").on(t.expiresAt),
  ],
);

export const regulatoryDocumentProducts = sqliteTable(
  "regulatory_document_products",
  {
    documentId: integer("document_id").notNull(),
    productId: integer("product_id").notNull(),
  },
  (t) => [uniqueIndex("regulatory_doc_product_idx").on(t.documentId, t.productId)],
);

export const customers = sqliteTable(
  "customers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    ruc: text("ruc"),
    kind: text("kind", { enum: ["publico", "clinica", "particular"] }).notNull().default("clinica"),
  },
  (t) => [uniqueIndex("customers_name_idx").on(t.name)],
);

// Memoria de equivalencias: texto normalizado que pide un cliente -> producto.
// customer_key vacío ("") significa equivalencia válida para cualquier cliente.
export const requirementAliases = sqliteTable(
  "requirement_aliases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    normalizedText: text("normalized_text").notNull(),
    customerKey: text("customer_key").notNull().default(""),
    productId: integer("product_id").notNull(),
    confirmedBy: integer("confirmed_by").notNull(),
    confirmedAt: text("confirmed_at").notNull(),
    timesUsed: integer("times_used").notNull().default(1),
  },
  (t) => [uniqueIndex("aliases_text_customer_idx").on(t.normalizedText, t.customerKey)],
);

export const quotes = sqliteTable(
  "quotes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    number: text("number").notNull(),
    customerId: integer("customer_id"),
    status: text("status", { enum: QUOTE_STATUSES }).notNull().default("borrador"),
    taxRateBps: integer("tax_rate_bps").notNull().default(1500),
    createdBy: integer("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("quotes_number_idx").on(t.number), index("quotes_customer_idx").on(t.customerId)],
);

export const quoteLines = sqliteTable(
  "quote_lines",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    quoteId: integer("quote_id").notNull(),
    productId: integer("product_id"),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    unitPriceCents: integer("unit_price_cents").notNull(),
    tier: text("tier", { enum: PRICE_TIERS }),
  },
  (t) => [index("quote_lines_quote_idx").on(t.quoteId), index("quote_lines_product_idx").on(t.productId)],
);

// Procesos de compra pública y su desenlace: base del historial de precios
// adjudicados y de la sugerencia de margen.
export const tenders = sqliteTable(
  "tenders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    processCode: text("process_code").notNull(),
    entity: text("entity").notNull(),
    cpc: text("cpc"),
    referenceBudgetCents: integer("reference_budget_cents"),
    closesAt: text("closes_at"),
    outcome: text("outcome", { enum: TENDER_OUTCOMES }).notNull().default("pendiente"),
    offeredCents: integer("offered_cents"),
    awardedCents: integer("awarded_cents"),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("tenders_code_idx").on(t.processCode)],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    detail: text("detail"),
    at: text("at").notNull(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_at_idx").on(t.at)],
);

// Registros compartidos entre equipos para módulos que hoy viven en el navegador
// (inventario, movimientos, finanzas, historial de cotizaciones sin datos del paciente, equivalencias de requerimientos).
// Cada registro es el JSON del módulo; se fusiona por id con la marca de tiempo más reciente. Los borrados son lápidas.
// No se usa para datos de pacientes: esos quedan solo en el respaldo cifrado.
export const SHARED_COLLECTIONS = ["inventory", "movements", "finance", "quotes", "aliases"] as const;

export const sharedRecords = sqliteTable(
  "shared_records",
  {
    collection: text("collection", { enum: SHARED_COLLECTIONS }).notNull(),
    recordId: text("record_id").notNull(),
    data: text("data").notNull(),
    updatedAt: text("updated_at").notNull(),
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
    updatedBy: text("updated_by"),
  },
  (t) => [primaryKey({ columns: [t.collection, t.recordId] }), index("shared_records_updated_idx").on(t.collection, t.updatedAt)],
);
