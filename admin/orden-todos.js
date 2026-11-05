// HOST / admin / orden-todos.js
// Orden independiente para la pestaña publica "Todos".
// Se puede arrastrar en computadora o usar flechas en celular.
// El orden se guarda en Supabase SOLO cuando se pulsa "Guardar orden".

import { db, escapeHTML, money } from '../shared.js';

const dashboard = document.querySelector('#dashboard');
const tabs = dashboard?.querySelector('.tabs');
const $ = selector => document.querySelector(selector);
const h = value => escapeHTML(String(value ?? ''));

if (dashboard && tabs && !$('#orden-todos-panel')) {
  // Pestaña nueva, junto a "Productos".
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.dataset.tab = 'orden-todos';
  tab.textContent = '↕ Orden de Todos';

  const productTab = tabs.querySelector('[data-tab="products"]');
  if (productTab) productTab.after(tab);
  else tabs.append(tab);

  const panel = document.createElement('section');
  panel.id = 'orden-todos-panel';
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <h2>↕ Orden de los productos en «Todos»</h2>
    <p class="muted">
      Los productos de arriba son los primeros que aparecen en la categoría
      <strong>Todos</strong> del menú público. Arrastrá las tarjetas en computadora
      o usá las flechas y «Al inicio» en el celular.
    </p>
    <p class="muted">
      Este orden <strong>no modifica las categorías ni los destacados</strong>.
      Los productos ocultos aparecen aquí para que puedas ubicarlos antes
      de volver a activarlos.
    </p>
    <div class="host-todos-toolbar">
      <label class="host-todos-search-label">
        Buscar producto
        <input id="host-todos-search" type="search" placeholder="Ej.: Box HOST">
      </label>
      <button type="button" class="secondary" id="host-todos-refresh">Recargar</button>
      <button type="button" id="host-todos-save" disabled>Guardar orden</button>
    </div>
    <p id="host-todos-status" role="status" aria-live="polite"></p>
    <div id="host-todos-list" class="host-todos-list"></div>
  `;

  const productsPanel = $('#products-panel');
  if (productsPanel) productsPanel.after(panel);
  else dashboard.append(panel);

  const styles = document.createElement('style');
  styles.textContent = `
    .host-todos-toolbar {
      display:flex; flex-wrap:wrap; gap:12px; align-items:end;
      margin:18px 0;
    }
    .host-todos-search-label { flex:1; min-width:170px; }
    .host-todos-search-label input { margin-top:5px; }
    #host-todos-status { min-height:22px; color:#ffc329; font-size:14px; }
    .host-todos-list { display:grid; gap:9px; margin-bottom:28px; }
    .host-todos-card {
      display:flex; align-items:center; flex-wrap:wrap; gap:10px;
      padding:12px; background:rgba(255,255,255,.04);
      border:1px solid rgba(255,255,255,.2); border-radius:12px;
    }
    .host-todos-card.host-todos-hidden { opacity:.58; }
    .host-todos-card.host-todos-target { outline:2px dashed #ffc329; }
    .host-todos-card.host-todos-dragging { opacity:.35; }
    .host-todos-card.host-todos-found { border-color:#ffc329; }
    .host-todos-handle { cursor:grab; user-select:none; padding:12px 6px;
      font-weight:800; color:#ffc329; touch-action:none; }
    .host-todos-num { font-weight:900; color:#ffc329; min-width:30px; }
    .host-todos-thumb { width:54px; height:54px; border-radius:8px;
      object-fit:cover; background:#30231d; flex:none; }
    .host-todos-body { flex:1; min-width:140px; }
    .host-todos-body strong { display:block; }
    .host-todos-body small { display:block; color:#bdb7b4; line-height:1.5; }
    .host-todos-actions { display:flex; gap:6px; flex-wrap:wrap; }
    .host-todos-actions button { min-width:36px; padding:9px 11px; }
  `;
  document.head.append(styles);

  let products = [];
  let categories = new Map();
  let changed = false;
  let loading = false;
  let draggingId = null;

  const list = $('#host-todos-list');
  const saveButton = $('#host-todos-save');
  const status = $('#host-todos-status');
  const setStatus = text => { status.textContent = text; };

  function orderValue(product) {
    return product.all_position === null || product.all_position === undefined
      ? Number.MAX_SAFE_INTEGER
      : Number(product.all_position);
  }

  function draw() {
    list.innerHTML = products.map((p, index) => `
      <article class="host-todos-card ${p.available ? '' : 'host-todos-hidden'}"
        data-order-id="${h(p.id)}">
        <span class="host-todos-handle" draggable="true"
          title="Arrastrar para reordenar" aria-label="Arrastrar ${h(p.name)}">☰</span>
        <span class="host-todos-num">${index + 1}.</span>
        ${p.image_url
          ? `<img class="host-todos-thumb" src="${h(p.image_url)}" alt="" loading="lazy">`
          : '<div class="host-todos-thumb" aria-hidden="true"></div>'}
        <div class="host-todos-body">
          <strong>${h(p.name)}</strong>
          <small>${h(categories.get(p.category_id) || 'Sin categoría')} · ${money(p.price)}</small>
          <small>${p.available ? 'Visible' : 'Oculto'}${p.featured ? ' · ⭐ Destacado' : ''}</small>
        </div>
        <div class="host-todos-actions">
          <button type="button" class="secondary" data-move="top" title="Enviar al inicio"
            ${index === 0 ? 'disabled' : ''}>Al inicio</button>
          <button type="button" class="secondary" data-move="up" title="Subir"
            aria-label="Subir ${h(p.name)}" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="secondary" data-move="down" title="Bajar"
            aria-label="Bajar ${h(p.name)}" ${index === products.length - 1 ? 'disabled' : ''}>↓</button>
        </div>
      </article>
    `).join('') || '<p class="muted">No hay productos cargados.</p>';
    saveButton.disabled = !changed || loading;
    highlightSearch();
  }

  function dirty() {
    changed = true;
    setStatus('Tenés cambios sin guardar. Tocá «Guardar orden» para publicarlos.');
    draw();
  }

  function move(id, action, beforeId = null, after = false) {
    const from = products.findIndex(p => p.id === id);
    if (from < 0) return;
    let to;
    if (action === 'top') to = 0;
    else if (action === 'up') to = Math.max(0, from - 1);
    else if (action === 'down') to = Math.min(products.length - 1, from + 1);
    else {
      const destination = products.findIndex(p => p.id === beforeId);
      if (destination < 0 || destination === from) return;
      to = destination;
      if (after) to += from < destination ? 0 : 1;
      else to -= from < destination ? 1 : 0;
    }
    if (to === from) return;
    const [product] = products.splice(from, 1);
    products.splice(to, 0, product);
    dirty();
  }

  // Flechas y botón «Al inicio» para usar también desde el celular.
  list.addEventListener('click', event => {
    const button = event.target.closest('button[data-move]');
    if (!button || loading) return;
    const card = button.closest('[data-order-id]');
    if (!card) return;
    move(card.dataset.orderId, button.dataset.move);
  });

  // Arrastrar y soltar en computadora.
  list.addEventListener('dragstart', event => {
    if (!event.target.closest('.host-todos-handle') || loading) {
      event.preventDefault();
      return;
    }
    const card = event.target.closest('[data-order-id]');
    if (!card) return;
    draggingId = card.dataset.orderId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggingId);
    card.classList.add('host-todos-dragging');
  });

  list.addEventListener('dragover', event => {
    const card = event.target.closest('[data-order-id]');
    if (!draggingId || !card || draggingId === card.dataset.orderId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    list.querySelectorAll('.host-todos-target').forEach(el => {
      el.classList.remove('host-todos-target');
    });
    card.classList.add('host-todos-target');
  });

  list.addEventListener('drop', event => {
    event.preventDefault();
    const card = event.target.closest('[data-order-id]');
    const id = draggingId;
    draggingId = null;
    if (id && card && card.dataset.orderId !== id) {
      const rect = card.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      move(id, 'drag', card.dataset.orderId, after);
    }
    list.querySelectorAll('.host-todos-target,.host-todos-dragging').forEach(el => {
      el.classList.remove('host-todos-target', 'host-todos-dragging');
    });
  });

  list.addEventListener('dragend', () => {
    draggingId = null;
    list.querySelectorAll('.host-todos-target,.host-todos-dragging').forEach(el => {
      el.classList.remove('host-todos-target', 'host-todos-dragging');
    });
  });

  function highlightSearch() {
    const query = ($('#host-todos-search')?.value || '').trim().toLocaleLowerCase('es');
    list.querySelectorAll('[data-order-id]').forEach(card => {
      const p = products.find(x => x.id === card.dataset.orderId);
      card.classList.toggle('host-todos-found', !!query && !!p?.name?.toLocaleLowerCase('es').includes(query));
    });
  }

  $('#host-todos-search').addEventListener('input', () => {
    highlightSearch();
    const found = list.querySelector('.host-todos-found');
    if (found) found.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  async function authorize() {
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) throw Error('Iniciá sesión como administrador de HOST.');
    const result = await db.from('admin_users')
      .select('user_id').eq('user_id', user.id).maybeSingle();
    if (result.error || !result.data) {
      throw Error('Tu cuenta no tiene permisos de administrador.');
    }
  }

  async function load() {
    loading = true;
    saveButton.disabled = true;
    setStatus('Cargando productos...');
    try {
      await authorize();
      const [p, c] = await Promise.all([
        db.from('products')
          .select('id,name,price,image_url,category_id,position,all_position,featured,available'),
        db.from('categories').select('id,name')
      ]);
      if (p.error) throw p.error;
      if (c.error) throw c.error;
      products = (p.data || []).sort((a, b) =>
        orderValue(a) - orderValue(b) ||
        Number(a.position || 0) - Number(b.position || 0) ||
        a.name.localeCompare(b.name, 'es')
      );
      categories = new Map((c.data || []).map(x => [x.id, x.name]));
      changed = false;
      setStatus(`${products.length} productos cargados. El primer visible será el primero de «Todos».`);
      draw();
    } catch (error) {
      console.error('HOST orden Todos:', error);
      setStatus('No se pudo cargar: ' + error.message);
    } finally {
      loading = false;
      saveButton.disabled = !changed;
    }
  }

  saveButton.addEventListener('click', async () => {
    if (!changed || loading) return;
    loading = true;
    saveButton.disabled = true;
    setStatus('Guardando orden...');
    try {
      await authorize();
      const { data, error } = await db.rpc('host_set_all_products_order', {
        p_ids: products.map(p => p.id)
      });
      if (error) throw error;
      if (Number(data) !== products.length) {
        throw Error('No se confirmó la actualización de todos los productos.');
      }
      changed = false;
      products.forEach((p, index) => { p.all_position = index; });
      setStatus('✅ Orden guardado. Ya se verá en «Todos» al actualizar el menú.');
    } catch (error) {
      console.error('HOST guardar orden:', error);
      setStatus('No se pudo guardar: ' + error.message);
    } finally {
      loading = false;
      saveButton.disabled = !changed;
    }
  });

  $('#host-todos-refresh').addEventListener('click', () => {
    if (changed && !confirm('Tenés cambios sin guardar. ¿Descartarlos y recargar?')) return;
    load();
  });

  // Avisar antes de abandonar cambios sin guardar, incluso si se cambia
  // a Puntos, Recompensas u otra pestaña agregada posteriormente.
  tabs.addEventListener('click', event => {
    const destination = event.target.closest('button[data-tab]');
    if (!destination || destination === tab) return;
    if (changed && !confirm('Hay cambios sin guardar en «Todos». ¿Descartarlos?')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    changed = false;
    panel.classList.add('hidden');
  }, true);

  tab.addEventListener('click', () => {
    const wasHidden = panel.classList.contains('hidden');
    tabs.querySelectorAll('[data-tab]').forEach(button => {
      button.classList.toggle('active', button === tab);
    });
    dashboard.querySelectorAll(':scope > .panel').forEach(other => {
      other.classList.toggle('hidden', other !== panel);
    });
    if (wasHidden) load();
  });
}
