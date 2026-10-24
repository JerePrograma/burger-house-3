import type { Catalog } from './domain';

const SESSION_KEY = 'bh3-catalog-editor-session';
const DATABASE = 'bh3-catalog-editor';
const STORE = 'drafts';
export type EditorRevision = string;
export type EditorSnapshot = { catalog: Catalog; revision: EditorRevision; publishingAvailable: boolean };
export type EditorDraft = { catalog: Catalog; revision: EditorRevision; savedAt: string };
export type PublishedResult = { revision: EditorRevision; url: string; publishedAt: string };

export class EditorApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'EditorApiError';
    this.status = status;
  }
}

export function editorPublisherUrl(): string {
  return (import.meta.env?.VITE_CATALOG_PUBLISHER_URL || '').replace(/\/$/, '');
}
export function editorSession(): string | null {
  try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
}
export function clearEditorSession(): void {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Session is already unavailable. */ }
}
export type EditorRequestContext = { publisherUrl: string; fetcher?: typeof fetch };
export async function editorRequest<T>(path: string, body?: unknown, context?: EditorRequestContext): Promise<T> {
  const origin = (context?.publisherUrl ?? editorPublisherUrl()).replace(/\/$/, '');
  if (!origin) throw new EditorApiError('La publicación todavía no está configurada. Podés editar y exportar una copia del catálogo.', 503);
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = editorSession();
  if (token && path !== '/session') headers.set('Authorization', `Bearer ${token}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), path === '/publish' ? 180000 : 30000);
  try {
    const response = await (context?.fetcher ?? fetch)(`${origin}${path}`, {
      method: body === undefined ? 'GET' : 'POST', headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: 'omit', signal: controller.signal,
    });
    const data = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) {
      if (response.status === 401 && path !== '/session') clearEditorSession();
      throw new EditorApiError(data.error || (response.status === 409 ? 'Otra persona publicó una versión más nueva. Recargá el catálogo antes de publicar.' : 'No pudimos completar la operación. Intentá de nuevo.'), response.status);
    }
    return data;
  } catch (error) {
    if (error instanceof EditorApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new Error('La conexión tardó demasiado. Conservamos tu borrador; comprobá el catálogo antes de volver a publicar.');
    throw new Error('No pudimos conectar con el publicador. Conservá una copia del borrador e intentá de nuevo.');
  } finally { clearTimeout(timeout); }
}

export async function loginEditor(password: string): Promise<void> {
  const result = await editorRequest<{ token: string }>('/session', { password });
  if (typeof result.token !== 'string' || !result.token) throw new Error('No se recibió una sesión válida.');
  sessionStorage.setItem(SESSION_KEY, result.token);
}
export function fetchEditorCatalog(): Promise<EditorSnapshot> { return editorRequest('/catalog'); }
export function publishEditorCatalog(catalog: Catalog, baseRevision: EditorRevision): Promise<PublishedResult> {
  return editorRequest('/publish', { catalog, baseRevision });
}
export async function connectPublisher(apiToken: string): Promise<void> {
  try { await editorRequest<{ publishingAvailable: boolean }>('/connection', { apiToken }); }
  catch (error) {
    if (error instanceof EditorApiError) throw new EditorApiError('No pudimos conectar la publicación. Revisá los permisos del token e intentá de nuevo.', error.status);
    throw new Error('No pudimos conectar la publicación. Revisá la conexión e intentá de nuevo.');
  }
}

async function draftDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) throw new Error('Este navegador no permite guardar borradores. Exportá una copia para conservar los cambios.');
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DATABASE, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(new Error('No pudimos abrir el borrador local. Podés exportar una copia.'));
    open.onblocked = () => reject(new Error('Cerrá las otras pestañas del editor para guardar el borrador.'));
  });
}
export async function readEditorDraft(): Promise<EditorDraft | null> {
  const database = await draftDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly');
    const read = transaction.objectStore(STORE).get('catalog');
    transaction.oncomplete = () => { database.close(); resolve(read.result ?? null); };
    transaction.onerror = () => { database.close(); reject(new Error('No pudimos recuperar el borrador local.')); };
    transaction.onabort = () => { database.close(); reject(new Error('No pudimos recuperar el borrador local.')); };
  });
}
export async function saveEditorDraft(catalog: Catalog, revision: EditorRevision): Promise<EditorDraft> {
  const database = await draftDatabase();
  const draft = { catalog, revision, savedAt: new Date().toISOString() };
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put(draft, 'catalog');
    transaction.oncomplete = () => { database.close(); resolve(draft); };
    const failure = () => { database.close(); reject(new Error('No pudimos guardar las fotos y los cambios. Exportá una copia del catálogo.')); };
    transaction.onerror = failure;
    transaction.onabort = failure;
  });
}
export async function removeEditorDraft(): Promise<void> {
  const database = await draftDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete('catalog');
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(new Error('No pudimos descartar el borrador local.')); };
    transaction.onabort = transaction.onerror;
  });
}

export async function prepareCatalogPhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Elegí una foto JPG, PNG o WebP.');
  if (file.size > 20 * 1024 * 1024) throw new Error('La foto original no puede superar los 20 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const value = new Image();
      value.onload = () => resolve(value);
      value.onerror = () => reject(new Error('No pudimos leer esa imagen. Probá con otra foto.'));
      value.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('La foto no tiene un tamaño válido.');
    const ratio = Math.min(1, 1000 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Este navegador no pudo preparar la foto.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [.86, .72, .58]) {
      const result = canvas.toDataURL('image/webp', quality);
      if (/^data:image\/(webp|png|jpeg);base64,/.test(result) && result.length <= 1024 * 1024) return result;
    }
    throw new Error('La foto sigue siendo demasiado grande. Elegí una imagen más pequeña.');
  } finally { URL.revokeObjectURL(url); }
}
