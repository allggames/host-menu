// HOST - Ubicación opcional para delivery.
// No pide GPS sin intervención del cliente y no altera el pedido de retiro.
const MAPS_BASE = 'https://www.google.com/maps?q=';
const POSADAS_CENTER = [-27.3671, -55.8961]; // Solo centra el mapa; NO se usa como ubicación del cliente.
let selectedPoint = null;
let originLabel = '';
let initialized = false;
let leafletPromise;

const $ = selector => document.querySelector(selector);
const coordsLink = (lat, lng) =>
  `${MAPS_BASE}${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;

function validateGoogleMapsLink(input) {
  const text = String(input || '').trim();
  if (!text) return null;
  let url;
  try { url = new URL(text); } catch { throw Error('Pegá un enlace completo de Google Maps que comience con https://.'); }
  const hostname = url.hostname.toLowerCase();
  const valid = url.protocol === 'https:' && (
    ['google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl'].includes(hostname) ||
    (hostname === 'goo.gl' && url.pathname.startsWith('/maps/'))
  );
  if (!valid || url.username || url.password) {
    throw Error('La ubicación debe ser un enlace de Google Maps válido.');
  }
  if (text.length > 220) {
    throw Error('El enlace del mapa es demasiado largo. Usá «Compartir» y «Copiar vínculo» desde Google Maps.');
  }
  return url.href;
}

function locationLink() {
  const manual = $('#host-location-link')?.value?.trim();
  if (manual) return validateGoogleMapsLink(manual);
  return selectedPoint ? coordsLink(selectedPoint.lat, selectedPoint.lng) : null;
}

export function getHostDeliveryLocation() {
  if ($('#delivery')?.value !== 'Delivery') return null;
  return locationLink();
}

function renderStatus(message = '') {
  const status = $('#host-location-status');
  const remove = $('#host-location-clear');
  const preview = $('#host-location-preview');
  if (!status) return;
  let link;
  let validationError = '';
  try { link = locationLink(); } catch (error) { link = null; validationError = error.message; }
  status.textContent = message || (link ?
    (selectedPoint && !$('#host-location-link')?.value ? `✓ Punto guardado (${originLabel}).` : '✓ Enlace de Google Maps agregado.') :
    (validationError || 'Opcional: podés agregar un punto exacto además de la dirección escrita.'));
  if (preview) {
    preview.hidden = !link;
    preview.href = link || '#';
  }
  if (remove) remove.hidden = !link && !$('#host-location-link')?.value;
}

function setPoint(lat, lng, source) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw Error('Coordenadas inválidas.');
  }
  selectedPoint = { lat, lng };
  originLabel = source;
  const manual = $('#host-location-link');
  if (manual) manual.value = '';
  renderStatus();
}

function getGpsPosition() {
  const status = $('#host-location-status');
  if (!navigator.geolocation) {
    renderStatus('Tu navegador no permite obtener GPS. Elegí un punto en el mapa o pegá un enlace.');
    return;
  }
  if (status) status.textContent = 'Solicitando permiso para acceder a tu ubicación…';
  navigator.geolocation.getCurrentPosition(
    p => {
      setPoint(p.coords.latitude, p.coords.longitude, 'GPS');
      renderStatus(`✓ Ubicación obtenida. Precisión aproximada: ${Math.round(p.coords.accuracy)} m. Revisá el punto antes de enviar.`);
    },
    error => {
      const detail = error.code === 1 ? 'No diste permiso de ubicación.' :
        error.code === 2 ? 'No se pudo determinar tu posición.' : 'Se agotó el tiempo de espera.';
      renderStatus(`${detail} Podés elegir el punto en el mapa o pegar un enlace.`);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function loadLeaflet() {
  if (window.L?.map) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.append(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => window.L?.map ? resolve(window.L) : reject(Error('Mapa no disponible'));
    script.onerror = () => reject(Error('No se pudo cargar el mapa'));
    document.head.append(script);
  }).catch(error => { leafletPromise = null; throw error; });
  return leafletPromise;
}

async function openMapPicker() {
  const overlay = document.createElement('div');
  overlay.className = 'host-map-overlay';
  overlay.innerHTML = `
    <div class="host-map-dialog" role="dialog" aria-modal="true" aria-labelledby="host-map-title">
      <div class="host-map-head">
        <div><strong id="host-map-title">📍 Marcá el lugar de entrega</strong>
          <small>Tocá el mapa para ubicar el pin. También podés arrastrarlo.</small>
        </div>
        <button type="button" class="host-map-close" aria-label="Cerrar mapa">✕</button>
      </div>
      <div class="host-map-canvas" id="host-map-canvas"><p>Cargando mapa…</p></div>
      <p class="host-map-hint">Seleccioná la entrada de tu casa o el punto donde querés recibir el pedido.</p>
      <div class="host-map-actions">
        <button type="button" class="host-map-cancel">Cancelar</button>
        <button type="button" class="host-map-confirm" disabled>Usar este punto</button>
      </div>
    </div>`;
  document.body.append(overlay);
  const close = () => { overlay.remove(); document.removeEventListener('keydown', esc); };
  const esc = event => { if (event.key === 'Escape') close(); };
  overlay.querySelector('.host-map-close').onclick = close;
  overlay.querySelector('.host-map-cancel').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', esc);
  const ok = overlay.querySelector('.host-map-confirm');
  let map;
  let marker;
  let draft = selectedPoint ? { ...selectedPoint } : null;
  try {
    const L = await loadLeaflet();
    if (!overlay.isConnected) return;
    const canvas = overlay.querySelector('#host-map-canvas');
    canvas.replaceChildren();
    const center = selectedPoint ? [selectedPoint.lat, selectedPoint.lng] : POSADAS_CENTER;
    map = L.map(canvas, { scrollWheelZoom: false }).setView(center, selectedPoint ? 17 : 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
    }).addTo(map);
    function updateDraft(position) {
      draft = { lat: position.lat, lng: position.lng };
      if (!marker) {
        marker = L.marker([draft.lat, draft.lng], { draggable: true }).addTo(map);
        marker.on('dragend', () => updateDraft(marker.getLatLng()));
      } else marker.setLatLng([draft.lat, draft.lng]);
      ok.disabled = false;
    }
    if (draft) updateDraft(draft);
    map.on('click', event => updateDraft(event.latlng));
    ok.onclick = () => { if (!draft) return; setPoint(draft.lat, draft.lng, 'mapa'); close(); };
    requestAnimationFrame(() => map.invalidateSize());
  } catch (error) {
    const container = overlay.querySelector('#host-map-canvas');
    container.textContent = 'El mapa no pudo abrirse. Podés pegar un enlace de Google Maps en el pedido.';
  }
  // Liberar eventos/capas cuando el diálogo se elimina.
  const observer = new MutationObserver(() => {
    if (!overlay.isConnected) {
      observer.disconnect();
      if (map) map.remove();
    }
  });
  observer.observe(document.body, { childList: true });
}

export function initHostDeliveryLocation() {
  if (initialized) return;
  const addressWrap = $('#address-wrap');
  const delivery = $('#delivery');
  if (!addressWrap || !delivery) return;
  initialized = true;

  const panel = document.createElement('div');
  panel.id = 'host-delivery-location';
  panel.hidden = delivery.value !== 'Delivery';
  panel.innerHTML = `
    <label class="host-location-title">📍 Ubicación en el mapa <span>(opcional)</span></label>
    <p class="host-location-help">Además de escribir tu dirección, compartí un punto exacto para que el delivery te encuentre.</p>
    <div class="host-location-buttons">
      <button type="button" id="host-location-gps">Usar mi ubicación actual</button>
      <button type="button" id="host-location-map">Elegir punto en el mapa</button>
      <button type="button" id="host-location-clear" hidden>Quitar ubicación</button>
    </div>
    <label for="host-location-link" class="host-location-alt">O pegá un enlace de Google Maps</label>
    <input id="host-location-link" type="url" inputmode="url" placeholder="https://maps.app.goo.gl/..." autocomplete="off">
    <p id="host-location-status" role="status" aria-live="polite"></p>
    <a id="host-location-preview" href="#" target="_blank" rel="noopener noreferrer" hidden>Ver ubicación elegida en Google Maps</a>
  `;
  addressWrap.after(panel);
  delivery.addEventListener('change', () => { panel.hidden = delivery.value !== 'Delivery'; });
  $('#host-location-gps').onclick = getGpsPosition;
  $('#host-location-map').onclick = openMapPicker;
  $('#host-location-clear').onclick = () => { selectedPoint = null; originLabel = ''; $('#host-location-link').value = ''; renderStatus(); };
  $('#host-location-link').addEventListener('input', () => renderStatus());

  const style = document.createElement('style');
  style.id = 'host-location-style';
  style.textContent = `
    #host-delivery-location { margin:14px 0 18px; padding:15px; background:#1c0e09; border:1px solid #754422; border-radius:13px; color:#fff; }
    #host-delivery-location[hidden], #host-location-clear[hidden], #host-location-preview[hidden] { display:none!important; }
    #host-delivery-location .host-location-title {display:block;color:#ffc329;font-size:15px;font-weight:900;margin:0 0 6px;}
    #host-delivery-location .host-location-title span {font-size:12px;color:#e9d4bd;font-weight:400;}
    #host-delivery-location .host-location-help {font-size:12px;color:#d9c6b7;margin:5px 0 13px;}
    .host-location-buttons { display:flex; flex-wrap:wrap; gap:7px; margin-bottom:13px; }
    #host-delivery-location .host-location-buttons button { flex:1 1 130px; background:#3a241b; color:#fff; border:1px solid #8b5130; border-radius:8px; padding:11px 8px; font-size:12px; font-weight:800; cursor:pointer; }
    #host-delivery-location #host-location-map {background:#ffc329;color:#171008;border-color:#ffc329;}
    #host-delivery-location .host-location-alt {font-size:12px;color:#e5c7b0;display:block;margin:4px 0 6px;}
    #host-location-link {width:100%;box-sizing:border-box;background:#120e0c!important;color:#fff!important;border:1px solid #754422!important;border-radius:8px;padding:11px;}
    #host-location-status {color:#eac89c;font-size:12px;margin:8px 0;}
    #host-location-preview {display:inline-block;color:#ffc329;font-size:12px;text-decoration:underline;margin:0 0 3px;}
    .host-map-overlay {position:fixed;inset:0;z-index:100010;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.88);padding:12px;}
    .host-map-dialog {width:min(690px,100%);max-height:95vh;overflow:auto;background:#21110c;border:1px solid #985129;border-radius:15px;padding:13px;box-shadow:0 20px 70px #000a;color:#fff;}
    .host-map-head {display:flex;justify-content:space-between;align-items:start;gap:12px;margin-bottom:11px;}
    .host-map-head strong {display:block;color:#ffc329;font-size:17px;}
    .host-map-head small {display:block;color:#ddd;font-size:12px;margin-top:4px;}
    .host-map-head button {background:#4b2b20;color:#fff;border:0;border-radius:8px;padding:9px 12px;cursor:pointer;}
    .host-map-canvas {width:100%;height:min(55vh,410px);min-height:280px;background:#292929;border-radius:9px;overflow:hidden;}
    .host-map-hint {font-size:12px;color:#d4b9a1;margin:10px 0;}
    .host-map-actions {display:flex;justify-content:flex-end;gap:10px;}
    .host-map-actions button {border:1px solid #8b5130;border-radius:8px;padding:12px 15px;font-weight:800;background:#3a241b;color:#fff;cursor:pointer;}
    .host-map-actions .host-map-confirm {background:#ed171f;border-color:#ed171f;color:#fff;}
    .host-map-actions button:disabled {opacity:.5;cursor:not-allowed;}
  `;
  document.head.append(style);
  renderStatus();
}
