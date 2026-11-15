// HOST | Conteo diario de aperturas del menú (Argentina).
// Solo registra un UUID aleatorio del navegador; Supabase guarda su huella por día.
// No recopila nombres, teléfonos, IP, ubicación ni productos visitados.
import { db } from './shared.js';

const VISITOR_KEY = 'host_menu_visitor_id_v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let trackedThisLoad = false;

function visitorToken() {
  let value = null;
  try { value = window.localStorage.getItem(VISITOR_KEY); }
  catch (_error) { /* El navegador puede bloquear almacenamiento. */ }

  if (typeof value === 'string' && UUID_PATTERN.test(value)) return value;
  value = crypto.randomUUID();

  try { window.localStorage.setItem(VISITOR_KEY, value); }
  catch (_error) { /* En modo privado la estimación puede contar más visitantes. */ }
  return value;
}

async function trackOpening() {
  if (trackedThisLoad) return;
  if (document.visibilityState === 'hidden') return;
  trackedThisLoad = true;
  try {
    const { error } = await db.rpc('host_track_menu_visit', {
      p_visitor_id: visitorToken()
    });
    if (error) console.warn('HOST visitas: no se pudo registrar esta apertura.');
  } catch (_error) {
    // Nunca impedir el uso del menú ni el carrito por un error estadístico.
  }
}
if (document.visibilityState === 'hidden') {
  document.addEventListener('visibilitychange', trackOpening);
} else {
  trackOpening();
}
