"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addKnowledgeFeedback,
  deleteKnowledgeItem,
  getAISettings,
  getKnowledgeItems,
  isServerAIConfigured,
  queryVoliaMemory,
  saveAISettings,
  type AISettings,
  type KnowledgeCategory,
  type KnowledgeItem,
} from "../lib/knowledge-memory";

const CATEGORY_LABELS: Record<KnowledgeCategory | "all", string> = {
  all: "Todas las categorias",
  hospital: "Hospitales y Entidades",
  doctor: "Medicos y Cirujanos",
  product: "Productos e Implantes",
  pricing: "Precios y Margenes",
  finance: "Finanzas y Cobros",
  general: "Reglas Generales",
};

export default function KnowledgeCenter() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<KnowledgeCategory | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [queryResponse, setQueryResponse] = useState<{
    answer: string;
    sourceCount: number;
    provider: "gemini" | "local";
  } | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Formulario de nueva regla
  const [newCategory, setNewCategory] = useState<KnowledgeCategory>("hospital");
  const [newEntity, setNewEntity] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newTags, setNewTags] = useState("");
  const [formMessage, setFormMessage] = useState("");

  // Configuracion de IA
  const [aiSettings, setAiSettings] = useState<AISettings>(() => getAISettings());
  const [serverAI, setServerAI] = useState<boolean | null>(null);

  useEffect(() => {
    const load = () => {
      setItems(getKnowledgeItems());
      const s = getAISettings();
      setAiSettings(s);
    };
    load();
    void isServerAIConfigured().then(setServerAI);
    window.addEventListener("volia-knowledge-updated", load);
    window.addEventListener("volia-ai-settings-updated", load);
    return () => {
      window.removeEventListener("volia-knowledge-updated", load);
      window.removeEventListener("volia-ai-settings-updated", load);
    };
  }, []);

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.entity.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.content.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    });
  }, [items, selectedCategory, searchQuery]);

  const handleAskQuestion = async (queryText?: string) => {
    const textToAsk = queryText || question;
    if (!textToAsk.trim()) return;
    setIsQuerying(true);
    setQueryResponse(null);
    try {
      const res = await queryVoliaMemory(textToAsk);
      setQueryResponse(res);
    } catch {
      setQueryResponse({
        answer: "Ocurrio un error al procesar la consulta en la memoria.",
        sourceCount: 0,
        provider: "local",
      });
    } finally {
      setIsQuerying(false);
    }
  };

  const handleSaveFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntity.trim() || !newTitle.trim() || !newContent.trim()) {
      setFormMessage("Por favor complete los campos de entidad, titulo y regla operativa.");
      return;
    }

    const tagsArray = newTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    addKnowledgeFeedback(newCategory, newEntity, newTitle, newContent, tagsArray);
    setItems(getKnowledgeItems());
    setNewEntity("");
    setNewTitle("");
    setNewContent("");
    setNewTags("");
    setFormMessage("");
    setShowAddForm(false);
  };

  const handleDelete = (id: string, entity: string) => {
    if (!window.confirm(`¿Desea eliminar la regla operativa para "${entity}"?`)) return;
    deleteKnowledgeItem(id);
    setItems(getKnowledgeItems());
  };

  const handleSaveAISettings = () => {
    saveAISettings({
      autoExtract: aiSettings.autoExtract,
      model: aiSettings.model,
    });
    setShowSettings(false);
  };

  return (
    <section className="business-module knowledge-module">
      <div className="module-hero">
        <div>
          <p className="eyebrow">INTELIGENCIA Y MEMORIA OPERATIVA</p>
          <h2>Base de Conocimiento y Retroalimentacion</h2>
          <p>
            Memoria empresarial centralizada para VOLIA S.A.S. Registra y consulta requisitos
            hospitalarios, preferencias de cirujanos, politicas de precios y antecedentes de cobro.
          </p>
        </div>
        <div className="hero-actions">
          <button className="secondary-button" onClick={() => setShowSettings(!showSettings)}>
            Configuracion IA
          </button>
          <button className="primary-button" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? "Cerrar Registro" : "+ Nueva Regla de Memoria"}
          </button>
        </div>
      </div>

      {showSettings && (
        <section className="business-card ai-settings-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CONFIGURACION DE INTELIGENCIA ARTIFICIAL</p>
              <h3>Conexion con Google Gemini API (Opcional)</h3>
            </div>
          </div>
          <p className="settings-desc">
            El sistema funciona de forma autonoma y local con su motor semantico. Opcionalmente,
            se puede activar Google Gemini en el servidor para respuestas avanzadas en lenguaje natural.
            A Gemini no se envían nombres de pacientes.
          </p>
          <div className="business-form">
            <div className="ai-server-status">
              <span>Estado de la IA</span>
              <strong>{serverAI === null ? "Comprobando…" : serverAI ? "Configurada en el servidor" : "No configurada"}</strong>
              <small>La clave de Google Gemini se guarda como secreto del servidor, nunca en este navegador. Para configurarla o cambiarla, el administrador ejecuta <code>configurar-ia.cmd</code> en el computador que publica la app.</small>
            </div>
            <label>
              <span>Modelo de IA</span>
              <select
                value={aiSettings.model}
                onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
              >
                <option value="gemini-2.0-flash">Google Gemini 2.0 Flash (Recomendado - Rapido)</option>
                <option value="gemini-1.5-flash">Google Gemini 1.5 Flash</option>
                <option value="gemini-1.5-pro">Google Gemini 1.5 Pro (Analisis profundo)</option>
              </select>
            </label>
            <label className="checkbox-row" style={{ marginTop: "8px" }}>
              <input
                type="checkbox"
                checked={aiSettings.autoExtract}
                onChange={(e) => setAiSettings({ ...aiSettings, autoExtract: e.target.checked })}
              />
              <span>
                <strong>Aprendizaje automatico continuo:</strong> Extraer patrones al guardar
                cotizaciones y expedientes.
              </span>
            </label>
          </div>
          <div className="form-end" style={{ marginTop: "14px" }}>
            <button className="primary-button" onClick={handleSaveAISettings}>
              Guardar Configuracion
            </button>
          </div>
        </section>
      )}

      {showAddForm && (
        <section className="business-card new-rule-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">RETROALIMENTACION OPERATIVA</p>
              <h3>Registrar Aprendizaje o Regla Institucional</h3>
            </div>
          </div>
          <form onSubmit={handleSaveFeedback} className="business-form">
            <div className="business-form two">
              <label>
                <span>Categoria</span>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as KnowledgeCategory)}
                >
                  <option value="hospital">Hospital / Entidad</option>
                  <option value="doctor">Medico / Cirujano</option>
                  <option value="product">Producto / Implante</option>
                  <option value="pricing">Precios / Margenes</option>
                  <option value="finance">Finanzas / Cobros</option>
                  <option value="general">Regla General</option>
                </select>
              </label>
              <label>
                <span>Entidad / Nombre *</span>
                <input
                  type="text"
                  placeholder="Ej. Hospital Carlos Andrade Marin, Dr. Carlos Andrade, Placa LCP"
                  value={newEntity}
                  onChange={(e) => setNewEntity(e.target.value)}
                  required
                />
              </label>
            </div>
            <label>
              <span>Titulo de la regla o requerimiento *</span>
              <input
                type="text"
                placeholder="Ej. Requisito de sello en farmacia antes de facturar"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
              />
            </label>
            <label>
              <span>Detalle de la regla o aprendizaje operativo *</span>
              <textarea
                rows={4}
                placeholder="Describa el aprendizaje o procedimiento exacto que el sistema debe recordar en futuras operaciones."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                required
              />
            </label>
            <label>
              <span>Etiquetas de busqueda (separadas por comas)</span>
              <input
                type="text"
                placeholder="iess, facturacion, quirofano, retenciones"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
              />
            </label>
            {formMessage && <p className="form-error">{formMessage}</p>}
            <div className="form-end">
              <button
                className="secondary-button"
                type="button"
                onClick={() => setShowAddForm(false)}
              >
                Cancelar
              </button>
              <button className="primary-button" type="submit">
                Guardar en Memoria
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Consultor de Memoria */}
      <section className="business-card query-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CONSULTAS EN LENGUAJE NATURAL</p>
            <h3>Preguntar a la Memoria Corporativa</h3>
          </div>
          <span className="source-indicator">
            {serverAI ? "Modo: Google Gemini AI + Memoria Local" : "Modo: Motor Semantico Local"}
          </span>
        </div>

        <div className="query-input-group">
          <input
            className="module-search"
            type="text"
            placeholder="Ej. ¿Que requisitos de liquidacion tiene el IESS? o ¿Cual es el margen de la placa LCP?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAskQuestion()}
          />
          <button
            className="primary-button"
            disabled={isQuerying || !question.trim()}
            onClick={() => handleAskQuestion()}
          >
            {isQuerying ? "Consultando..." : "Consultar Memoria"}
          </button>
        </div>

        <div className="quick-query-tags">
          <span>Consultas sugeridas:</span>
          <button onClick={() => { setQuestion("Requisitos de liquidacion del IESS"); handleAskQuestion("Requisitos de liquidacion del IESS"); }}>
            Requisitos IESS
          </button>
          <button onClick={() => { setQuestion("Politica de margen y descuento"); handleAskQuestion("Politica de margen y descuento"); }}>
            Margen y descuentos
          </button>
          <button onClick={() => { setQuestion("Historial de cotizaciones"); handleAskQuestion("Historial de cotizaciones"); }}>
            Historial de ofertas
          </button>
          <button onClick={() => { setQuestion("Stock y disponibilidad"); handleAskQuestion("Stock y disponibilidad"); }}>
            Disponibilidad de inventario
          </button>
        </div>

        {queryResponse && (
          <div className="query-result-card">
            <div className="result-header">
              <strong>Resultado de la consulta</strong>
              <small>
                {queryResponse.provider === "gemini" ? "Analizado con Google Gemini" : "Motor Semantico Local"} · {queryResponse.sourceCount} fuente(s) contrastada(s)
              </small>
            </div>
            <pre className="result-text">{queryResponse.answer}</pre>
          </div>
        )}
      </section>

      {/* Explorador de Reglas y Conocimiento */}
      <section className="business-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">BASE DE CONOCIMIENTO ACUMULADA</p>
            <h3>{items.length} regla(s) y antecedente(s) en memoria</h3>
          </div>
        </div>

        <div className="activity-filters-grid" style={{ marginBottom: "16px" }}>
          <div className="filter-group">
            <label>
              <span>Categoria</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as KnowledgeCategory | "all")}
              >
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="filter-group filter-search">
            <label>
              <span>Buscar en memoria</span>
              <input
                className="module-search"
                placeholder="Buscar entidad, palabra clave o requerimiento..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="knowledge-list">
          {visibleItems.map((item) => (
            <article key={item.id} className="knowledge-card-item">
              <div className="knowledge-card-head">
                <div className="knowledge-meta">
                  <span className={`category-tag tag-${item.category}`}>
                    {CATEGORY_LABELS[item.category]}
                  </span>
                  <span className="source-tag">
                    {item.source === "user_feedback" ? "Retroalimentacion Manual" : "Aprendizaje Automatico"}
                  </span>
                  <strong>{item.entity}</strong>
                </div>
                <button
                  className="danger-link"
                  onClick={() => handleDelete(item.id, item.entity)}
                  title="Eliminar de la memoria"
                >
                  Eliminar
                </button>
              </div>

              <h4>{item.title}</h4>
              <p>{item.content}</p>

              {item.tags.length > 0 && (
                <div className="knowledge-tags">
                  {item.tags.map((tag) => (
                    <span key={tag} className="tag-pill">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}

          {!visibleItems.length && (
            <div className="module-empty">
              No se encontraron reglas en la memoria para los filtros seleccionados.
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
