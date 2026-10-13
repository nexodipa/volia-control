"use client";

import { recordActivity } from "./activity-log";
import { readStoredArray, readStoredObject, STORAGE_KEYS, writeStoredJson } from "./storage";

export type KnowledgeCategory =
  | "hospital"
  | "doctor"
  | "product"
  | "pricing"
  | "finance"
  | "general";

export interface KnowledgeItem {
  id: string;
  category: KnowledgeCategory;
  entity: string;
  title: string;
  content: string;
  tags: string[];
  source: "automatic" | "user_feedback";
  createdAt: string;
  updatedAt: string;
}

export interface AISettings {
  /** Obsoleto: la clave ahora es un secreto del servidor. Se borra del navegador al leer la configuración. */
  geminiApiKey?: string;
  model: string;
  temperature: number;
  autoExtract: boolean;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  model: "gemini-2.0-flash",
  temperature: 0.2,
  autoExtract: true,
};

const INITIAL_KNOWLEDGE: KnowledgeItem[] = [
  {
    id: "init-hosp-1",
    category: "hospital",
    entity: "Hospital General del IESS",
    title: "Liquidacion y requisitos documentales",
    content: "Para tramitar la liquidacion y pago de expedientes quirurgicos se requiere adjuntar: 1) Carta de implantes firmada por el cirujano tratante, 2) Acta de entrega-recepcion de farmacia/bodega, 3) Hoja de consumo de quirofano con sello legible, 4) Protocolo operatorio, 5) Factura electronica autorizada.",
    tags: ["iess", "liquidacion", "documentos", "requisitos"],
    source: "automatic",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "init-hosp-2",
    category: "hospital",
    entity: "Hospital Carlos Andrade Marin (HCAM)",
    title: "Plazos de pago y retenciones",
    content: "El tiempo promedio de cancelacion oscila entre 45 y 90 dias tras la radicacion completa del expediente. Se debe verificar que la orden de compra o proceso coincida exactamente con la descripcion y codigo institucional de la proforma.",
    tags: ["hcam", "plazos", "retenciones", "comercial"],
    source: "automatic",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "init-price-1",
    category: "pricing",
    entity: "Sistema de Osteosintesis y Minifragmentos",
    title: "Politica de margen y descuento",
    content: "Para compras institucionales el margen objetivo minimo es del 30%. En licitaciones competitivas se puede autorizar hasta un 10% de descuento sobre el precio base siempre que el volumen supere 5 kits quirurgicos.",
    tags: ["margen", "descuento", "precios", "rentabilidad"],
    source: "automatic",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

export function getKnowledgeItems(): KnowledgeItem[] {
  if (typeof window === "undefined") return INITIAL_KNOWLEDGE;
  return readStoredArray<KnowledgeItem>(STORAGE_KEYS.knowledgeMemory, INITIAL_KNOWLEDGE);
}

export function saveKnowledgeItems(items: KnowledgeItem[]) {
  if (typeof window === "undefined") return;
  writeStoredJson(STORAGE_KEYS.knowledgeMemory, items);
  localStorage.setItem(STORAGE_KEYS.memoryUpdated, new Date().toISOString());
  window.dispatchEvent(new Event("volia-knowledge-updated"));
}

export function getAISettings(): AISettings {
  if (typeof window === "undefined") return DEFAULT_AI_SETTINGS;
  const stored = readStoredObject<AISettings>(STORAGE_KEYS.aiSettings, DEFAULT_AI_SETTINGS);
  if (stored.geminiApiKey !== undefined) {
    // Migración: la clave ya no se guarda en el navegador (cualquier script de la página podía leerla).
    const { geminiApiKey: _removed, ...clean } = stored;
    void _removed;
    writeStoredJson(STORAGE_KEYS.aiSettings, clean);
    return clean;
  }
  return stored;
}

/** Indica si el servidor tiene configurada la IA (secreto GEMINI_API_KEY del worker). */
export async function isServerAIConfigured(): Promise<boolean> {
  try {
    const res = await fetch("/api/ai", { cache: "no-store" });
    return res.ok && (await res.json())?.configured === true;
  } catch {
    return false;
  }
}

export function saveAISettings(settings: Partial<AISettings>) {
  if (typeof window === "undefined") return;
  const current = getAISettings();
  const next = { ...current, ...settings };
  writeStoredJson(STORAGE_KEYS.aiSettings, next);
  window.dispatchEvent(new Event("volia-ai-settings-updated"));
}

export function addKnowledgeFeedback(
  category: KnowledgeCategory,
  entity: string,
  title: string,
  content: string,
  tags: string[] = []
): KnowledgeItem {
  const items = getKnowledgeItems();
  const cleanEntity = entity.trim();
  const now = new Date().toISOString();

  const newItem: KnowledgeItem = {
    id: `know-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category,
    entity: cleanEntity,
    title: title.trim(),
    content: content.trim(),
    tags: tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
    source: "user_feedback",
    createdAt: now,
    updatedAt: now,
  };

  const updated = [newItem, ...items].slice(0, 1000);
  saveKnowledgeItems(updated);

  recordActivity(
    "Memoria",
    "Regla operativa registrada",
    `${category.toUpperCase()}: ${cleanEntity} - ${title.trim()}`,
    "create"
  );

  return newItem;
}

export function deleteKnowledgeItem(id: string): boolean {
  const items = getKnowledgeItems();
  const target = items.find((item) => item.id === id);
  if (!target) return false;

  const filtered = items.filter((item) => item.id !== id);
  saveKnowledgeItems(filtered);

  recordActivity(
    "Memoria",
    "Regla operativa eliminada",
    `${target.entity} - ${target.title}`,
    "delete"
  );
  return true;
}

// Extraccion automatica de conocimiento al guardar cotizaciones
export function learnFromQuote(
  meta: { customer?: string; doctor?: string; hospital?: string; date?: string; discountValue?: number },
  items: Array<{ code?: string; description?: string; brand?: string; unitPrice?: number }>,
  totals: { total?: number; margin?: number }
) {
  if (typeof window === "undefined") return;
  const aiSettings = getAISettings();
  if (!aiSettings.autoExtract) return;

  const currentKnowledge = getKnowledgeItems();
  const customerName = (meta.customer || meta.hospital || "").trim();
  if (!customerName || items.length === 0) return;

  const entityKey = customerName.toUpperCase();
  const itemDescriptions = items.map((i) => i.description || i.code).filter(Boolean).join(", ");
  const pricingInsight = `Cotizacion registrada el ${meta.date || "reciente"} por USD ${(totals.total || 0).toFixed(2)} con margen de ${(totals.margin || 0).toFixed(1)}%. Productos: ${itemDescriptions}.`;

  const existingIndex = currentKnowledge.findIndex(
    (k) => k.category === "pricing" && k.entity.toUpperCase() === entityKey && k.source === "automatic"
  );

  const now = new Date().toISOString();
  let updatedList = [...currentKnowledge];

  if (existingIndex >= 0) {
    updatedList[existingIndex] = {
      ...updatedList[existingIndex],
      content: pricingInsight,
      updatedAt: now,
    };
  } else {
    const newItem: KnowledgeItem = {
      id: `know-auto-q-${Date.now()}`,
      category: "pricing",
      entity: customerName,
      title: "Historial y parametro de cotizacion",
      content: pricingInsight,
      tags: ["cotizacion", "precios", customerName.toLowerCase()],
      source: "automatic",
      createdAt: now,
      updatedAt: now,
    };
    updatedList = [newItem, ...updatedList].slice(0, 1000);
  }

  saveKnowledgeItems(updatedList);
}

// Extraccion automatica de conocimiento al registrar cirugias
export function learnFromCase(caseRecord: {
  patient?: string;
  hospital?: string;
  surgeryDate?: string;
  contract?: string;
  amount?: number;
  dueDate?: string;
}) {
  if (typeof window === "undefined") return;
  const aiSettings = getAISettings();
  if (!aiSettings.autoExtract) return;

  const hospitalName = (caseRecord.hospital || "").trim();
  if (!hospitalName) return;

  const currentKnowledge = getKnowledgeItems();
  const entityKey = hospitalName.toUpperCase();
  const now = new Date().toISOString();

  const existingIndex = currentKnowledge.findIndex(
    (k) => k.category === "hospital" && k.entity.toUpperCase() === entityKey && k.source === "automatic"
  );

  const insightContent = `Cirugia programada el ${caseRecord.surgeryDate || "reciente"} para la entidad ${hospitalName}${caseRecord.contract ? ` bajo proceso ${caseRecord.contract}` : ""}. Monto: USD ${(caseRecord.amount || 0).toFixed(2)}${caseRecord.dueDate ? `, fecha maxima estimada de cobro: ${caseRecord.dueDate}` : ""}.`;

  let updatedList = [...currentKnowledge];

  if (existingIndex >= 0) {
    updatedList[existingIndex] = {
      ...updatedList[existingIndex],
      content: insightContent,
      updatedAt: now,
    };
  } else {
    const newItem: KnowledgeItem = {
      id: `know-auto-c-${Date.now()}`,
      category: "hospital",
      entity: hospitalName,
      title: "Registro de cirugias y plazos operativos",
      content: insightContent,
      tags: ["cirugia", "hospital", hospitalName.toLowerCase()],
      source: "automatic",
      createdAt: now,
      updatedAt: now,
    };
    updatedList = [newItem, ...updatedList].slice(0, 1000);
  }

  saveKnowledgeItems(updatedList);
}

// Obtener insights y recomendaciones para una entidad especifica (Hospital, Cliente o Medico)
export function getInsightsForEntity(entityName: string, category?: KnowledgeCategory): KnowledgeItem[] {
  if (!entityName || typeof window === "undefined") return [];
  const normalized = entityName.trim().toLowerCase();
  const items = getKnowledgeItems();

  return items.filter((item) => {
    const matchesCategory = !category || item.category === category;
    const matchesEntity =
      item.entity.toLowerCase().includes(normalized) ||
      normalized.includes(item.entity.toLowerCase()) ||
      item.tags.some((t) => t.includes(normalized) || normalized.includes(t));
    return matchesCategory && matchesEntity;
  });
}

// Motor de consultas analiticas a la memoria corporativa
export async function queryVoliaMemory(question: string): Promise<{
  answer: string;
  sourceCount: number;
  provider: "gemini" | "local";
}> {
  const query = question.trim().toLowerCase();
  if (!query) {
    return {
      answer: "Por favor formule una consulta especifica para buscar en la memoria corporativa.",
      sourceCount: 0,
      provider: "local",
    };
  }

  const knowledge = getKnowledgeItems();
  const quotes = readStoredArray<any>(STORAGE_KEYS.quoteHistory);
  const cases = readStoredArray<any>(STORAGE_KEYS.cases);
  const inventory = readStoredArray<any>(STORAGE_KEYS.inventory);
  const finances = readStoredArray<any>(STORAGE_KEYS.financeRecords);

  // Filtrado de fuentes relevantes
  const relevantKnowledge = knowledge.filter(
    (k) =>
      query.includes(k.entity.toLowerCase()) ||
      k.entity.toLowerCase().includes(query) ||
      k.tags.some((t) => query.includes(t)) ||
      k.content.toLowerCase().includes(query)
  );

  const relevantQuotes = quotes.filter(
    (q) =>
      query.includes((q.customer || "").toLowerCase()) ||
      (q.customer || "").toLowerCase().includes(query) ||
      query.includes((q.number || "").toLowerCase())
  );

  const relevantCases = cases.filter(
    (c) =>
      query.includes((c.patient || "").toLowerCase()) ||
      query.includes((c.hospital || "").toLowerCase()) ||
      (c.hospital || "").toLowerCase().includes(query)
  );

  const relevantInventory = inventory.filter(
    (i) =>
      query.includes((i.product || "").toLowerCase()) ||
      (i.product || "").toLowerCase().includes(query) ||
      query.includes((i.code || "").toLowerCase())
  );

  const totalSources =
    relevantKnowledge.length + relevantQuotes.length + relevantCases.length + relevantInventory.length;

  const aiSettings = getAISettings();

  // Si el servidor tiene configurada la IA, se usa para razonamiento avanzado (la clave nunca llega al navegador).
  // No se envían nombres de pacientes ni datos que los identifiquen.
  try {
    const contextSummary = JSON.stringify({
      knowledgeRules: relevantKnowledge.slice(0, 8).map((k) => ({ entity: k.entity, title: k.title, content: k.content })),
      relatedQuotes: relevantQuotes.slice(0, 6).map((q) => ({ number: q.number, customer: q.customer, total: q.total, date: q.date })),
      relatedCases: relevantCases.slice(0, 6).map((c) => ({ hospital: c.hospital, surgeryDate: c.surgeryDate, amount: c.amount, status: c.status })),
      relatedInventory: relevantInventory.slice(0, 6).map((i) => ({ code: i.code, product: i.product, stock: i.stock, reserved: i.reserved, unitCost: i.unitCost })),
    });

    const promptText = `Eres el Asistente de Memoria Operativa de VOLIA S.A.S. (Ecuador), una empresa especializada en insumos y dispositivos medicos-quirurgicos.
Tu objetivo es responder de manera profesional, precisa y estructurada a la siguiente consulta del equipo, basandote estrictamente en la memoria corporativa e informacion suministrada.
No utilices emojis. Manten un lenguaje formal, claro y corporativo.

CONTEXTO DE LA EMPRESA:
${contextSummary}

CONSULTA DEL USUARIO:
${question}

Respuesta profesional y analitica:`;

    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: aiSettings.model || "gemini-2.0-flash", temperature: aiSettings.temperature ?? 0.2, prompt: promptText }),
    });
    if (response.ok) {
      const generatedText = (await response.json())?.text;
      if (typeof generatedText === "string" && generatedText.trim()) {
        recordActivity("Memoria", "Consulta analitica IA (Gemini)", question.slice(0, 80), "system");
        return { answer: generatedText, sourceCount: totalSources, provider: "gemini" };
      }
    }
  } catch (err) {
    console.warn("IA del servidor no disponible, usando motor semantico local:", err);
  }

  // Motor de respuesta semantico local sin dependencias externas
  let localAnswer = `ANALISIS DE MEMORIA OPERATIVA - VOLIA S.A.S.\n`;
  localAnswer += `--------------------------------------------------------\n`;
  localAnswer += `Consulta analizada: "${question}"\n\n`;

  if (totalSources === 0) {
    localAnswer += `No se encontraron registros directos que coincidan con los terminos de busqueda.\n`;
    localAnswer += `Resumen general del sistema:\n`;
    localAnswer += `- Ofertas guardadas: ${quotes.length}\n`;
    localAnswer += `- Expedientes de cirugia: ${cases.length}\n`;
    localAnswer += `- Productos en inventario: ${inventory.length}\n`;
    localAnswer += `- Movimientos financieros: ${finances.length}\n`;
    localAnswer += `- Reglas en base de conocimiento: ${knowledge.length}\n\n`;
    localAnswer += `Sugerencia: Puede registrar una regla o nota de retroalimentacion en la pestana inferior para que el sistema la memorice.`;
    return {
      answer: localAnswer,
      sourceCount: 0,
      provider: "local",
    };
  }

  if (relevantKnowledge.length > 0) {
    localAnswer += `REGLAS OPERATIVAS Y ANTECEDENTES IDENTIFICADOS:\n`;
    relevantKnowledge.forEach((k, idx) => {
      localAnswer += `${idx + 1}. [${k.category.toUpperCase()}] ${k.entity}: ${k.title}\n   ${k.content}\n\n`;
    });
  }

  if (relevantQuotes.length > 0) {
    localAnswer += `COTIZACIONES HISTORICAS RELACIONADAS:\n`;
    relevantQuotes.forEach((q) => {
      localAnswer += `- Oferta ${q.number || "S/N"} para ${q.customer || "Cliente"} (${q.date || "S/F"}): Total USD ${(q.total || 0).toFixed(2)}\n`;
    });
    localAnswer += `\n`;
  }

  if (relevantCases.length > 0) {
    localAnswer += `EXPEDIENTES QUIRURGICOS Y COBROS:\n`;
    relevantCases.forEach((c) => {
      localAnswer += `- Paciente: ${c.patient} | Hospital: ${c.hospital} | Fecha: ${c.surgeryDate} | Estado: ${c.status} | Monto: USD ${(c.amount || 0).toFixed(2)}\n`;
    });
    localAnswer += `\n`;
  }

  if (relevantInventory.length > 0) {
    localAnswer += `DISPONIBILIDAD EN INVENTARIO:\n`;
    relevantInventory.forEach((i) => {
      localAnswer += `- ${i.product} (Codigo: ${i.code || "S/C"}): Stock fisico ${i.stock} | Reservado ${i.reserved} | Disponible ${Math.max(0, i.stock - i.reserved)} unid.\n`;
    });
  }

  recordActivity("Memoria", "Consulta de memoria local", question.slice(0, 80), "system");

  return {
    answer: localAnswer,
    sourceCount: totalSources,
    provider: "local",
  };
}
