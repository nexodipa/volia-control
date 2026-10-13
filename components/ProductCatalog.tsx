"use client";

import { useEffect, useMemo, useState } from "react";
import { recordActivity } from "../lib/activity-log";
import { downloadCsv } from "../lib/csv";
import { getCatalog, saveCatalog, type CatalogProduct } from "../lib/product-catalog";
import { deleteItem, pullList, pushList } from "../lib/api-list";
import { mergeByUpdatedAt } from "../lib/sync-merge";

const ENDPOINT = "/api/catalog";

const EMPTY: CatalogProduct = { id: "", code: "", description: "", brand: "", origin: "", category: "Traumatología", unitCost: 0, salePrice: 0, active: true, updatedAt: "" };
const money = (value: number) => new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value || 0);

export default function ProductCatalog() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [draft, setDraft] = useState<CatalogProduct>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [server, setServer] = useState<{ online: boolean; message: string }>({ online: false, message: "Conectando con la base de datos…" });

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const local = getCatalog();
      setProducts(local);
      const remote = await pullList<CatalogProduct>(ENDPOINT, "products");
      if (cancelled) return;
      if (!remote.ok) { setServer({ online: false, message: `Solo en este equipo: ${remote.reason}` }); return; }
      const { merged, toPush } = mergeByUpdatedAt(local, remote.data, (p) => p.code);
      setProducts(merged); saveCatalog(merged);
      if (!toPush.length) { setServer({ online: true, message: "Sincronizado con la base de datos." }); return; }
      const pushed = await pushList(ENDPOINT, "products", toPush);
      if (cancelled) return;
      setServer(pushed.ok ? { online: true, message: remote.data.length ? `Sincronizado; se subieron ${pushed.data} cambio(s) de este equipo.` : `Base de datos inicializada con ${pushed.data} productos.` } : { online: true, message: `No se pudieron subir los cambios de este equipo: ${pushed.reason}` });
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);
  const syncChange = async (changed: CatalogProduct[], removedCodes: string[] = []) => {
    if (!server.online) return;
    const results = await Promise.all([changed.length ? pushList(ENDPOINT, "products", changed) : Promise.resolve({ ok: true as const, data: 0 }), ...removedCodes.map((code) => deleteItem(ENDPOINT, code))]);
    const failed = results.find((r) => !r.ok);
    setServer({ online: true, message: failed && !failed.ok ? `No se pudo guardar en la base: ${failed.reason}. El cambio quedó en este equipo.` : "Sincronizado con la base de datos." });
  };
  const visible = useMemo(() => products.filter((product) => [product.code, product.description, product.brand, product.origin, product.category].some((value) => value.toLowerCase().includes(query.toLowerCase()))), [products, query]);
  const margin = (product: CatalogProduct) => product.salePrice > 0 ? (product.salePrice - product.unitCost) / product.salePrice * 100 : 0;

  const close = () => { setDraft(EMPTY); setShowForm(false); setMessage(""); };
  const save = () => {
    if (!draft.code.trim() || !draft.description.trim() || draft.salePrice <= 0) return setMessage("Complete código, descripción y precio de venta.");
    const duplicate = products.find((product) => product.code.toLowerCase() === draft.code.trim().toLowerCase() && product.id !== draft.id);
    if (duplicate) return setMessage("Ya existe un producto con ese código.");
    const normalized = { ...draft, id: draft.id || `${Date.now()}`, code: draft.code.trim().toUpperCase(), description: draft.description.trim().toUpperCase(), brand: draft.brand.trim(), origin: draft.origin.trim(), updatedAt: new Date().toISOString() };
    const next = draft.id ? products.map((product) => product.id === draft.id ? normalized : product) : [normalized, ...products];
    setProducts(next); saveCatalog(next); recordActivity("Catálogo", draft.id ? "Producto actualizado" : "Producto creado", `${normalized.code} · ${normalized.description}`);
    const previous = draft.id ? products.find((product) => product.id === draft.id) : undefined;
    void syncChange([normalized], previous && previous.code !== normalized.code ? [previous.code] : []);
    close();
  };
  const edit = (product: CatalogProduct) => { setDraft({ ...product }); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const toggle = (product: CatalogProduct) => { const next = products.map((entry) => entry.id === product.id ? { ...entry, active: !entry.active, updatedAt: new Date().toISOString() } : entry); setProducts(next); saveCatalog(next); void syncChange(next.filter((entry) => entry.id === product.id)); recordActivity("Catálogo", product.active ? "Producto desactivado" : "Producto activado", product.code); };
  const remove = (product: CatalogProduct) => {
    if (!window.confirm(`¿Eliminar ${product.code} · ${product.description} del catálogo? Las cotizaciones guardadas no cambian.`)) return;
    const next = products.filter((entry) => entry.id !== product.id);
    setProducts(next); saveCatalog(next); recordActivity("Catálogo", "Producto eliminado", `${product.code} · ${product.description}`);
    void syncChange([], [product.code]);
    if (draft.id === product.id) close();
  };
  const exportCsv = () => {
    downloadCsv([["Código", "Descripción", "Marca", "Procedencia", "Categoría", "Costo", "Precio de venta", "Margen %", "Activo"], ...products.map((product) => [product.code, product.description, product.brand, product.origin, product.category, product.unitCost, product.salePrice, margin(product).toFixed(2), product.active ? "Sí" : "No"])], "catalogo-maestro-volia.csv");
    recordActivity("Catálogo", "Catálogo exportado en CSV", `${products.length} producto(s) exportado(s)`, "export");
  };

  return <section className="business-module catalog-module">
    <div className="module-hero"><div><p className="eyebrow">DATOS MAESTROS</p><h2>Catálogo de productos y precios</h2><p>Configure una sola vez los códigos, marcas, procedencias, costos y precios que aparecerán en el cotizador.</p></div><div className="hero-actions"><button className="secondary-button" onClick={exportCsv}>Exportar Excel/CSV</button><button className="primary-button" onClick={() => showForm ? close() : setShowForm(true)}>{showForm ? "Cerrar" : "+ Agregar producto"}</button></div></div>
    <p className={`module-sync-status ${server.online && server.message.startsWith("Sincronizado") ? "ok" : "warn"}`} role="status">{server.message}</p>
    <div className="catalog-summary"><article><span>PRODUCTOS</span><strong>{products.length}</strong></article><article><span>ACTIVOS</span><strong>{products.filter((product) => product.active).length}</strong></article><article><span>SIN COSTO REGISTRADO</span><strong>{products.filter((product) => product.unitCost <= 0).length}</strong></article><article><span>SIN MARCA</span><strong>{products.filter((product) => !product.brand).length}</strong></article></div>
    {showForm && <section className="business-card"><div className="section-heading"><div><p className="eyebrow">{draft.id ? "CORREGIR" : "NUEVO"}</p><h3>{draft.id ? "Editar producto" : "Registrar producto"}</h3></div></div>{message && <div className="status-banner error"><strong>{message}</strong></div>}<div className="business-form">{([['code','Código *'],['description','Descripción *'],['brand','Marca'],['origin','Procedencia'],['category','Categoría']] as const).map(([key,label]) => <label key={key}><span>{label}</span><input value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>)}{([['unitCost','Costo unitario'],['salePrice','Precio de venta *']] as const).map(([key,label]) => <label key={key}><span>{label}</span><input type="number" min="0" step=".01" value={draft[key] || ''} onChange={(event) => setDraft({ ...draft, [key]: Math.max(0, Number(event.target.value) || 0) })} /></label>)}<label className="checkbox-row"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })}/><span>Producto activo y disponible para cotizar</span></label></div><div className="form-end"><span>Revise el costo antes de guardar: determina la rentabilidad.</span><div className="record-actions"><button className="secondary-button" onClick={close}>Cancelar</button><button className="primary-button" onClick={save}>Guardar producto</button></div></div></section>}
    <section className="business-card"><div className="section-heading"><div><p className="eyebrow">LISTADO MAESTRO</p><h3>Productos registrados</h3></div><input className="module-search" placeholder="Buscar código, producto, marca o país" value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="catalog-list">{visible.map((product) => <article key={product.id} className={!product.active ? "inactive" : ""}><div className="catalog-product"><span className="catalog-code">{product.code}</span><div><strong>{product.description}</strong><small>{product.brand || "Marca no registrada"} · {product.origin || "Procedencia no registrada"} · {product.category}</small></div></div><div className="catalog-prices"><div><span>COSTO</span><strong>{money(product.unitCost)}</strong></div><div><span>VENTA</span><strong>{money(product.salePrice)}</strong></div><div><span>MARGEN</span><strong className={margin(product) < 25 ? "negative" : "positive"}>{product.unitCost ? `${margin(product).toFixed(1)} %` : "Pendiente"}</strong></div></div><div className="record-actions"><button onClick={() => edit(product)}>Editar</button><button onClick={() => toggle(product)}>{product.active ? "Desactivar" : "Activar"}</button><button className="danger-link" onClick={() => remove(product)}>Eliminar</button></div></article>)}{!visible.length && <div className="module-empty">No hay productos que coincidan con la búsqueda.</div>}</div></section>
  </section>;
}
