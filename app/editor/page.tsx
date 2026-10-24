'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Download, Eye, ImagePlus, LoaderCircle, LogOut, Plus, RefreshCw, Save, Search, Settings, ShoppingBag, Trash2, Upload, X } from 'lucide-react';
import { categories, money, type Catalog, type Ingredient, type Product, type StoreConfig, type Variant } from '@/lib/domain';
import { assetUrl, pageUrl } from '@/lib/client';
import { defaultPublishedCatalog, loadPublishedCatalog, normalizePublishedCatalog } from '@/lib/catalog-static';
import { clearEditorSession, connectPublisher, EditorApiError, editorPublisherUrl, editorSession, fetchEditorCatalog, loginEditor, prepareCatalogPhoto, publishEditorCatalog, readEditorDraft, removeEditorDraft, saveEditorDraft, type EditorDraft, type EditorRevision } from '@/lib/editor-client';
import './editor.css';

type Tab = 'products' | 'extras' | 'settings';
const identifier = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const dateLabel = (value: string) => new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' });

export default function CatalogEditor() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [revision, setRevision] = useState<EditorRevision>('');
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [canPublish, setCanPublish] = useState(false);
  const [changed, setChanged] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [recoverable, setRecoverable] = useState<EditorDraft | null>(null);
  const [tab, setTab] = useState<Tab>('products');
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const currentCatalog = useRef(catalog);
  const dirty = useRef(false);
  currentCatalog.current = catalog;
  dirty.current = changed;

  async function localFallback() {
    const fallback = await loadPublishedCatalog().catch(() => defaultPublishedCatalog());
    if (mounted.current) { setCatalog(fallback); setCanPublish(false); }
  }
  function fail(value: unknown) {
    if (value instanceof EditorApiError && value.status === 401) {
      if (currentCatalog.current && dirty.current) void saveEditorDraft(currentCatalog.current, revision).catch(() => undefined);
      setAuthenticated(false);
      setPassword('');
      setApiToken('');
    }
    if (value instanceof EditorApiError && value.status === 409) setConflict(true);
    if (value instanceof EditorApiError && value.status === 503) setCanPublish(false);
    setError(value instanceof Error ? value.message : 'No pudimos completar la operación.');
  }
  async function loadRemote(restoreLocal = true) {
    const result = await fetchEditorCatalog();
    const next = normalizePublishedCatalog(result.catalog);
    if (!mounted.current) return;
    setCatalog(next); setRevision(result.revision); setCanPublish(result.publishingAvailable);
    setAuthenticated(true); setChanged(false); setConflict(false); setSelected(null);
    if (!result.publishingAvailable) setNotice('El catálogo se puede editar. Falta habilitar la publicación; mientras tanto podés exportar una copia.');
    if (restoreLocal) {
      try {
        const draft = await readEditorDraft();
        if (!mounted.current || !draft) return;
        const saved = { ...draft, catalog: normalizePublishedCatalog(draft.catalog) };
        if (saved.revision === result.revision) {
          setCatalog(saved.catalog); setChanged(true);
          setNotice(`Recuperamos tu borrador del ${dateLabel(saved.savedAt)}. Todavía no está publicado.`);
        } else setRecoverable(saved);
      } catch (value) { setNotice(value instanceof Error ? value.message : 'No pudimos recuperar el borrador local.'); }
    }
  }
  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        if (editorSession()) await loadRemote();
        else await localFallback();
      } catch (value) { fail(value); await localFallback(); }
      finally { if (mounted.current) setLoading(false); }
    })();
    const preventLeave = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', preventLeave);
    return () => { mounted.current = false; window.removeEventListener('beforeunload', preventLeave); };
  }, []);
  useEffect(() => {
    if (!preview) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = document.querySelector<HTMLElement>('.ce-preview');
    const elements = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []);
    const frame = requestAnimationFrame(() => elements()[0]?.focus());
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setPreview(false); }
      if (event.key !== 'Tab') return;
      const targets = elements();
      const first = targets[0], last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [preview]);

  async function logout() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (catalog && changed) await saveEditorDraft(catalog, revision);
      clearEditorSession(); setAuthenticated(false); setPassword(''); setApiToken('');
      setNotice(changed ? 'Sesión cerrada. Tu borrador quedó guardado en este dispositivo.' : 'Sesión cerrada.');
    } catch (value) { fail(value); }
    finally { setBusy(false); }
  }

  function update(next: Catalog) { setCatalog(next); setChanged(true); setNotice(''); }
  function updateProduct(next: Product) {
    if (catalog) update({ ...catalog, products: catalog.products.map(product => product.id === next.id ? next : product) });
  }
  async function saveDraft() {
    if (!catalog) return;
    setError(''); setBusy(true);
    try { await saveEditorDraft(normalizePublishedCatalog(catalog), revision); setNotice('Borrador guardado en este dispositivo. Aún no se publicó.'); }
    catch (value) { fail(value); }
    finally { setBusy(false); }
  }
  async function publish() {
    if (!catalog || busy || conflict) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      const next = normalizePublishedCatalog(catalog);
      await saveEditorDraft(next, revision).catch(() => undefined);
      const result = await publishEditorCatalog(next, revision);
      setRevision(result.revision); setCatalog(next); setChanged(false); setRecoverable(null);
      setNotice(`Catálogo publicado el ${dateLabel(result.publishedAt)}. Los cambios ya están disponibles para tus clientes.`);
      await removeEditorDraft().catch(() => undefined);
    } catch (value) { fail(value); }
    finally { setBusy(false); }
  }
  async function reloadPublished() {
    if (changed && !window.confirm('Vamos a cargar la versión publicada. ¿Querés reemplazar los cambios que ves en pantalla? Podés guardar o exportar tu borrador antes.')) return;
    setBusy(true); setError(''); setNotice('');
    try { await loadRemote(false); }
    catch (value) { fail(value); }
    finally { setBusy(false); }
  }
  function exportCatalog() {
    if (!catalog) return;
    try {
      const contents = JSON.stringify(normalizePublishedCatalog(catalog), null, 2);
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'burger-house-catalogo.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('Copia exportada con productos y fotos. Guardala para recuperar el catálogo cuando necesites.');
    } catch (value) { fail(value); }
  }
  async function importCatalog(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError('La copia no puede superar los 20 MB.'); return; }
    setError('');
    try {
      const imported = normalizePublishedCatalog(JSON.parse(await file.text()));
      if (!window.confirm('Esta copia reemplazará el borrador de productos, fotos y configuración. Todavía no se publicará. ¿Querés importarla?')) return;
      update(imported); setSelected(null); setNotice('Copia importada como borrador. Revisala y publicá cuando esté lista.');
    } catch (value) { fail(value); }
  }
  function newProduct() {
    if (!catalog) return;
    const next: Product = {
      id: identifier('producto'), name: 'Nuevo producto', description: 'Descripción del producto', category: 'hamburguesas', image: '/images/logo.png',
      active: true, available: true, variants: [{ id: identifier('opcion'), name: 'Porción', price: 0, patties: 1, available: true }], recipe: [], extras: [],
    };
    update({ ...catalog, products: [...catalog.products, next] }); setSelected(next.id);
  }
  function newExtra() {
    if (!catalog) return;
    const next: Ingredient = { id: identifier('extra'), name: 'Nuevo adicional', unit: 'u', stock: 0, minStock: 0, extraPrice: 0, extraPortion: 1, maxPerPatty: 6, available: true };
    update({ ...catalog, ingredients: [...catalog.ingredients, next] });
  }

  const product = catalog?.products.find(value => value.id === selected);
  const visible = catalog?.products.filter(value => `${value.name} ${value.description}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))) ?? [];

  return <div className="catalog-editor">
    <header className="ce-header"><a href={pageUrl('/')} className="ce-brand"><img src={assetUrl('/images/logo.png')} alt="Burger House 3" /><span>BURGER HOUSE 3<small>Tu catálogo, a tu manera.</small></span></a><a className="ce-back" href={pageUrl('/')}><ArrowLeft size={16} /> Ver catálogo</a>{authenticated && <button className="ce-icon" title="Cerrar sesión" aria-label="Cerrar sesión" disabled={busy} onClick={() => { void logout(); }}><LogOut size={18} /></button>}</header>
    <main className="ce-main">
      <div className="ce-title"><div><span className="ce-eyebrow">EL MENÚ LO ARMÁS VOS</span><h1>Tu carta.<br /><em>Tus reglas.</em></h1><p>Actualizá productos, fotos y precios. Publicá cuando esté todo listo.</p></div><div className="ce-status"><span className={changed ? 'ce-dot ce-dot-draft' : 'ce-dot'} />{changed ? 'Borrador con cambios' : 'Catálogo publicado'}<small>Los pedidos llegan por WhatsApp.</small></div></div>
      {error && <div className="ce-message ce-error" role="alert"><span>{error}</span><button className="ce-icon" aria-label="Cerrar aviso de error" onClick={() => setError('')}><X size={18} /></button></div>}
      {notice && <div className="ce-message ce-notice" role="status"><Check size={19} /><span>{notice}</span><button className="ce-icon" aria-label="Cerrar aviso" onClick={() => setNotice('')}><X size={18} /></button></div>}
      {loading ? <div className="ce-loading"><LoaderCircle className="spin" /> Preparando tu catálogo…</div> : <>
        {!authenticated && <section className="ce-login ce-panel"><div><span className="ce-eyebrow">ACCESO AL CATÁLOGO</span><h2>Listo para un cambio.</h2><p>Ingresá para editar y publicar desde este celular o computadora. La gestión de caja funciona por separado.</p></div>{editorPublisherUrl() ? <form onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await loginEditor(password); setPassword(''); await loadRemote(); } catch (value) { fail(value); } finally { setBusy(false); } }}><label>Tu contraseña<input type="password" autoComplete="current-password" required maxLength={200} value={password} onChange={event => setPassword(event.target.value)} /></label><button className="ce-button ce-yellow" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={18} />} Ingresar</button></form> : <p className="ce-inline-warning">Falta conectar la publicación del catálogo. Podés preparar y exportar un borrador desde este dispositivo.</p>}</section>}
        {catalog && (authenticated || !editorPublisherUrl()) && <>
          {authenticated && !canPublish && <section className="ce-connection ce-panel"><div><span className="ce-eyebrow">UNA SOLA VEZ</span><h2>Conectá la publicación.</h2><p>Conectá tu cuenta de Cloudflare para publicar desde el celular. El token se guarda cifrado y no se incluye en las copias del catálogo.</p><a className="ce-link" href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">Crear token en Cloudflare <ArrowRight size={14} /></a><small>Permiso de edición de scripts de Workers, limitado a la cuenta donde está este sitio.</small></div><form onSubmit={async event => { event.preventDefault(); if (busy || !apiToken.trim()) return; setBusy(true); setError(''); try { await connectPublisher(apiToken.trim()); setCanPublish(true); setNotice('Publicación conectada. Ya podés publicar tu catálogo.'); } catch (value) { fail(value); } finally { setApiToken(''); setBusy(false); } }}><label>Token de publicación<input type="password" autoComplete="off" required maxLength={500} value={apiToken} onChange={event => setApiToken(event.target.value)} /></label><button className="ce-button ce-yellow" disabled={busy || !apiToken.trim()}>{busy ? <LoaderCircle className="spin" size={18} /> : <Upload size={18} />} Conectar publicación</button></form></section>}
          {recoverable && <div className="ce-recovery"><p>Hay un borrador guardado del {dateLabel(recoverable.savedAt)} basado en una versión anterior. Recuperalo sólo si querés revisar esos cambios.</p><div><button className="ce-button" disabled={busy} onClick={() => { update(recoverable.catalog); setRecoverable(null); setNotice('Borrador recuperado sobre la versión publicada actual. Revisá todos los cambios antes de publicar.'); }}>Recuperar borrador</button><button className="ce-button" disabled={busy} onClick={() => { setRecoverable(null); void removeEditorDraft().catch(fail); }}>Descartar copia local</button></div></div>}
          <div className="ce-workbar"><nav aria-label="Secciones del editor">{([{ id: 'products', name: 'Productos', Icon: ShoppingBag }, { id: 'extras', name: 'Ingredientes y extras', Icon: Plus }, { id: 'settings', name: 'Tu local', Icon: Settings }] as const).map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} disabled={busy} onClick={() => { setTab(item.id); setSelected(null); }}><item.Icon size={17} />{item.name}</button>)}</nav><div className="ce-tools"><button className="ce-tool" onClick={() => setPreview(true)}><Eye size={17} /> Vista previa</button><button className="ce-tool" disabled={busy} onClick={exportCatalog}><Download size={17} /> Exportar</button><button className="ce-tool" disabled={busy} onClick={() => importInput.current?.click()}><Upload size={17} /> Importar</button><input ref={importInput} hidden disabled={busy} type="file" accept="application/json,.json" onChange={event => { void importCatalog(event); }} /></div></div>
          <fieldset className="ce-fields" disabled={busy}>
            {tab === 'products' && (product ? <ProductForm product={product} ingredients={catalog.ingredients} onChange={updateProduct} onBack={() => setSelected(null)} onPhotoError={fail} onPhotoBusy={setBusy} onRemove={() => { if (window.confirm(`¿Eliminar «${product.name}» del borrador? El cambio se aplica a los clientes cuando publiques.`)) { update({ ...catalog, products: catalog.products.filter(value => value.id !== product.id) }); setSelected(null); } }} /> : <section className="ce-panel"><div className="ce-panel-heading"><div><h2>Algo rico para elegir.</h2><p>{catalog.products.length} productos en tu carta.</p></div><button className="ce-button ce-yellow" onClick={newProduct} disabled={catalog.products.length >= 300}><Plus size={18} /> Nuevo producto</button></div><label className="ce-search"><Search size={18} /><input aria-label="Buscar productos del catálogo" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscá un producto" /></label><div className="ce-product-list">{visible.map(value => <button key={value.id} className="ce-product-row" onClick={() => setSelected(value.id)}><img src={assetUrl(value.image)} alt="" /><div><strong>{value.name}</strong><small>{categories.find(category => category.id === value.category)?.name} · {value.variants.length ? money(Math.min(...value.variants.map(variant => variant.price))) : 'Sin opciones'}</small><span className={!value.active || value.available === false ? 'ce-product-state ce-paused' : 'ce-product-state'}>{!value.active ? 'Archivado' : value.available === false ? 'Agotado' : 'Disponible'}</span></div><ChevronRight size={20} /></button>)}</div>{visible.length === 0 && <p className="ce-empty">No encontramos productos con ese nombre.</p>}</section>)}
            {tab === 'extras' && <section className="ce-panel"><div className="ce-panel-heading"><div><h2>El toque extra.</h2><p>Editá los nombres y precios de los ingredientes y adicionales. Elegí cuáles ofrecer en cada producto.</p></div><button className="ce-button ce-yellow" onClick={newExtra}><Plus size={18} /> Nuevo adicional</button></div><div className="ce-extra-list">{catalog.ingredients.map(ingredient => <div className="ce-extra-row" key={ingredient.id}><label>Ingrediente<input maxLength={80} value={ingredient.name} onChange={event => update({ ...catalog, ingredients: catalog.ingredients.map(value => value.id === ingredient.id ? { ...value, name: event.target.value } : value) })} /></label><label>Precio por adicional ($)<input type="number" min="0" max="1000000" step="1" value={ingredient.extraPrice} onChange={event => update({ ...catalog, ingredients: catalog.ingredients.map(value => value.id === ingredient.id ? { ...value, extraPrice: Number(event.target.value) } : value) })} /></label><label className="ce-check"><input type="checkbox" checked={ingredient.available !== false} onChange={event => update({ ...catalog, ingredients: catalog.ingredients.map(value => value.id === ingredient.id ? { ...value, available: event.target.checked } : value) })} /> Disponible</label></div>)}</div></section>}
            {tab === 'settings' && <SettingsForm config={catalog.config} onChange={config => update({ ...catalog, config })} />}
          </fieldset>
          <div className="ce-publish-bar"><div><strong>{changed ? 'Hay cambios para publicar.' : 'Tu carta está lista.'}</strong><small>Guardar un borrador no cambia lo que ven tus clientes.</small>{conflict && <button className="ce-link" disabled={busy} onClick={() => { void reloadPublished(); }}>Recargar versión publicada</button>}</div><div><button className="ce-button" disabled={busy} onClick={() => { void saveDraft(); }}><Save size={17} /> Guardar borrador</button><button className="ce-button ce-yellow" disabled={busy || !authenticated || !canPublish || conflict} onClick={() => { void publish(); }}>{busy ? <LoaderCircle size={18} className="spin" /> : <Upload size={18} />} {busy ? 'Preparando cambios…' : 'Publicar catálogo'}</button></div></div>
          {authenticated && <div className="ce-bottom"><button className="ce-link" disabled={busy} onClick={() => { void reloadPublished(); }}><RefreshCw size={15} /> Cargar versión publicada</button><span>{!canPublish ? 'Publicación pendiente de habilitación.' : 'El catálogo continúa en línea aunque cierres el editor.'}</span></div>}
          {preview && <div className="ce-preview-backdrop" role="dialog" aria-modal="true" aria-labelledby="ce-preview-title"><section className="ce-preview"><div className="ce-panel-heading"><div><span className="ce-eyebrow">VISTA PREVIA · SIN PUBLICAR</span><h2 id="ce-preview-title">{catalog.config.name}</h2><p>{catalog.config.tagline}</p></div><button className="ce-icon" aria-label="Cerrar vista previa" onClick={() => setPreview(false)}><X /></button></div><div className="ce-preview-grid">{catalog.products.filter(value => value.active).map(value => <article key={value.id}><img src={assetUrl(value.image)} alt={value.name} /><div>{value.badge && <span className="ce-preview-badge">{value.badge}</span>}<h3>{value.name}</h3><p>{value.description}</p>{value.available === false ? <strong>Agotado</strong> : value.variants.map(variant => <div className="ce-preview-price" key={variant.id}><span>{variant.name}{variant.available === false ? ' · Agotado' : ''}</span><b>{money(variant.price)}</b></div>)}</div></article>)}</div><button className="ce-button ce-yellow" onClick={() => setPreview(false)}>Seguir editando <ArrowRight size={17} /></button></section></div>}
        </>}
      </>}
    </main>
  </div>;
}

function ProductForm({ product, ingredients, onChange, onBack, onPhotoError, onPhotoBusy, onRemove }: { product: Product; ingredients: Ingredient[]; onChange: (value: Product) => void; onBack: () => void; onPhotoError: (value: unknown) => void; onPhotoBusy: (value: boolean) => void; onRemove: () => void }) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const photo = useRef<HTMLInputElement>(null);
  const variantChange = (id: string, next: Partial<Variant>) => onChange({ ...product, variants: product.variants.map(value => value.id === id ? { ...value, ...next } : value) });
  return <section className="ce-panel ce-product-form"><button className="ce-link" onClick={onBack}><ArrowLeft size={16} /> Todos los productos</button><div className="ce-panel-heading"><div><span className="ce-eyebrow">A TU MANERA</span><h2>{product.name || 'Tu producto'}</h2></div><button className="ce-tool ce-danger" onClick={onRemove}><Trash2 size={17} /> Eliminar</button></div><div className="ce-product-edit"><div className="ce-photo-editor"><img src={assetUrl(product.image)} alt={product.name || 'Foto del producto'} /><button className="ce-button" disabled={photoBusy} onClick={() => photo.current?.click()}>{photoBusy ? <LoaderCircle className="spin" size={17} /> : <ImagePlus size={17} />} {photoBusy ? 'Preparando foto…' : 'Cambiar foto'}</button><small>Elegí desde tu galería o cámara. La foto se adapta automáticamente.</small><input ref={photo} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; setPhotoBusy(true); onPhotoBusy(true); try { const image = await prepareCatalogPhoto(file); onChange({ ...product, image }); } catch (value) { onPhotoError(value); } finally { setPhotoBusy(false); onPhotoBusy(false); } }} /></div><div className="ce-form-grid"><label>Nombre<input required maxLength={100} value={product.name} onChange={event => onChange({ ...product, name: event.target.value })} /></label><label>Categoría<select value={product.category} onChange={event => onChange({ ...product, category: event.target.value as Product['category'] })}>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="ce-full">Descripción<textarea required maxLength={1000} rows={4} value={product.description} onChange={event => onChange({ ...product, description: event.target.value })} /></label><label className="ce-full">Etiqueta opcional<input maxLength={60} placeholder="Ej. La favorita" value={product.badge || ''} onChange={event => onChange({ ...product, badge: event.target.value })} /></label><label className="ce-check"><input type="checkbox" checked={product.active} onChange={event => onChange({ ...product, active: event.target.checked })} /> Mostrar en el catálogo</label><label className="ce-check"><input type="checkbox" checked={product.available !== false} onChange={event => onChange({ ...product, available: event.target.checked })} /> Disponible para pedir</label><label className="ce-check"><input type="checkbox" checked={!!product.featured} onChange={event => onChange({ ...product, featured: event.target.checked })} /> Destacado</label></div></div><div className="ce-section-heading"><h3>Opciones y precios</h3><button className="ce-tool" onClick={() => onChange({ ...product, variants: [...product.variants, { id: identifier('opcion'), name: 'Nueva opción', price: 0, patties: 1, available: true }] })}><Plus size={16} /> Agregar opción</button></div><div className="ce-variant-list">{product.variants.map(variant => <div className="ce-variant-row" key={variant.id}><label>Opción<input required maxLength={100} value={variant.name} onChange={event => variantChange(variant.id, { name: event.target.value })} /></label><label>Precio ($)<input required type="number" min="0" max="1000000" step="1" value={variant.price} onChange={event => variantChange(variant.id, { price: Number(event.target.value) })} /></label><label>Medallones / porciones<input required type="number" min="0" max="10" step="1" value={variant.patties} onChange={event => variantChange(variant.id, { patties: Number(event.target.value) })} /></label><label className="ce-check"><input type="checkbox" checked={variant.available !== false} onChange={event => variantChange(variant.id, { available: event.target.checked })} /> Disponible</label><button className="ce-icon ce-danger" aria-label={`Eliminar opción ${variant.name}`} disabled={product.variants.length <= 1} onClick={() => onChange({ ...product, variants: product.variants.filter(value => value.id !== variant.id) })}><Trash2 size={17} /></button></div>)}</div>{product.unresolved && <div className="ce-unresolved"><label>Información a consultar<textarea rows={2} value={product.unresolved} maxLength={1000} onChange={event => onChange({ ...product, unresolved: event.target.value || undefined })} /></label><small>Mientras quede una consulta pendiente, este producto lleva a una conversación con el local.</small><button className="ce-link" onClick={() => onChange({ ...product, unresolved: undefined, available: true, variants: product.variants.map(variant => ({ ...variant, available: true })) })}>Ya completé los datos: permitir agregar al carrito</button></div>}<details className="ce-personalization"><summary>Personalización y adicionales <ChevronRight size={16} /></summary><p>Los ingredientes incluidos se pueden quitar. Los adicionales se cobran por unidad.</p><div className="ce-recipe-options">{product.recipe.map(part => <label className="ce-check" key={part.ingredientId}><input type="checkbox" checked={!!part.removable} onChange={event => onChange({ ...product, recipe: product.recipe.map(value => value.ingredientId === part.ingredientId ? { ...value, removable: event.target.checked } : value) })} /> Permitir quitar {ingredients.find(ingredient => ingredient.id === part.ingredientId)?.name ?? part.ingredientId}</label>)}</div><h4>Adicionales que se ofrecen en este producto</h4><div className="ce-recipe-options">{ingredients.map(ingredient => <label className="ce-check" key={ingredient.id}><input type="checkbox" checked={product.extras.includes(ingredient.id)} onChange={event => onChange({ ...product, extras: event.target.checked ? [...product.extras, ingredient.id] : product.extras.filter(id => id !== ingredient.id) })} /> {ingredient.name} <small>{money(ingredient.extraPrice)}</small></label>)}</div></details></section>;
}

function SettingsForm({ config, onChange }: { config: StoreConfig; onChange: (value: StoreConfig) => void }) {
  return <section className="ce-panel"><div className="ce-panel-heading"><div><h2>El sabor tiene casa.</h2><p>Los datos y condiciones que ven tus clientes.</p></div><Settings size={24} /></div><div className="ce-form-grid"><label>Nombre del local<input required maxLength={100} value={config.name} onChange={event => onChange({ ...config, name: event.target.value })} /></label><label>Frase de la marca<input maxLength={200} value={config.tagline} onChange={event => onChange({ ...config, tagline: event.target.value })} /></label><label>WhatsApp<input required type="tel" maxLength={25} value={config.whatsapp} placeholder="5491123344218" onChange={event => onChange({ ...config, whatsapp: event.target.value })} /><small>Con código de país, sin espacios. Aquí llegarán los pedidos.</small></label><label>Instagram<input maxLength={50} value={config.instagram} onChange={event => onChange({ ...config, instagram: event.target.value.replace(/^@/, '') })} /></label><label>Envío<select value={config.deliveryFeeMode ?? 'quote'} onChange={event => onChange({ ...config, deliveryFeeMode: event.target.value as 'quote' | 'fixed' })}><option value="quote">Cotizar según el barrio</option><option value="fixed">Tarifa fija</option></select></label>{config.deliveryFeeMode === 'fixed' && <label>Costo del envío ($)<input type="number" min="0" max="100000" step="1" required value={config.deliveryFee} onChange={event => onChange({ ...config, deliveryFee: Number(event.target.value) })} /></label>}<label className="ce-full">Zona de reparto<input required maxLength={500} value={config.deliveryZone} onChange={event => onChange({ ...config, deliveryZone: event.target.value })} /></label><label className="ce-check ce-full"><input type="checkbox" checked={config.acceptingOrders} onChange={event => onChange({ ...config, acceptingOrders: event.target.checked })} /> Recibir pedidos por WhatsApp <small>Si lo desactivás, la carta sigue visible y se pausa el envío del carrito.</small></label></div></section>;
}
