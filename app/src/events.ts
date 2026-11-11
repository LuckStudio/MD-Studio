// ═══════════════════════════════════════════════════
// EVENTOS DE LA APLICACIÓN (bus tipado)
// ═══════════════════════════════════════════════════
// Los módulos que producen algo (pintar el documento, guardar, cambiar de vista…) lo anuncian y los
// que reaccionan se suscriben, en vez de llamarse entre sí. Así render.js no necesita conocer a
// claude.js, wikilinks.js o workspace.js, y se rompen ciclos de importación.

export interface AppEvents {
  'doc:rendered': undefined;                            // la vista previa se acaba de pintar
  'doc:saved': { tabId: number };                       // una pestaña se guardó en disco
  'view:changed': { view: 'split' | 'editor' | 'preview' };
  'tab:switched': { tabId: number };
  'workspace:changed': { name: string | null };
  'theme:changed': { theme: 'dark' | 'light' };
}

type Handler<T> = (payload: T) => void;
// Mapa interno sin tipos por evento (la API pública sí los tiene: on/emit)
const handlers = new Map<keyof AppEvents, Set<Handler<any>>>();

/** Se suscribe a un evento. Devuelve la función que cancela la suscripción. */
export function on<K extends keyof AppEvents>(event: K, fn: Handler<AppEvents[K]>): () => void {
  let set = handlers.get(event);
  if (!set) { set = new Set(); handlers.set(event, set); }
  set.add(fn);
  return () => { set.delete(fn); };
}

/** Anuncia un evento. Un manejador que falle no impide que se ejecuten los demás. */
export function emit<K extends keyof AppEvents>(event: K, payload?: AppEvents[K]): void {
  const set = handlers.get(event);
  if (!set) return;
  for (const fn of [...set]) {
    try { fn(payload); } catch (e) { console.error(`Error en un manejador de «${event}»:`, e); }
  }
}
