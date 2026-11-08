// HOST — Administrador de descuentos por producto.
// No modifica el precio original; aplica una promoción porcentual temporal.
// Los permisos reales son validados por las políticas RLS de Supabase (MFA AAL2).
import { db, money, escapeHTML } from '../shared.js';

const hostDashboard = document.querySelector('#dashboard');
const hostTabs = hostDashboard?.querySelector('.tabs');
const $ = id => document.getElementById(id);
const h = v => escapeHTML(String(v ?? ''));

if (hostDashboard && hostTabs && !$('descuentos-panel')) {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.dataset.tab = 'descuentos';
  tab.textContent = '🏷️ Descuentos';
  const optionsTab = hostTabs.querySelector('[data-tab="options"]');
  if (optionsTab) optionsTab.before(tab);
  else hostTabs.append(tab);

  const panel = document.createElement('section');
  panel.id = 'descuentos-panel';
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <h2>🏷️ Descuentos de productos</h2>
    <p class="muted">
      Elegí un producto, escribí el porcentaje y activá la promoción.
      El precio anterior se mostrará tachado y el nuevo precio se cobrará
      también al registrar el pedido. Los opcionales con recargo no se descuentan.
    </p>
    <div class="host-sale-toolbar">
      <label>Buscar producto
        <input id="host-sale-search" type="search" placeholder="Nombre del producto">
      </label>
      <label class="host-sale-filter"><input id="host-sale-only" type="checkbox"> Solo promociones activas</label>
      <button id="host-sale-refresh" type="button" class="secondary">Actualizar</button>
    </div>
    <p id="host-sale-summary" class="muted"></p>
    <p id="host-sale-message" role="status" aria-live="polite"></p>
    <div id="host-sale-list" class="host-sale-list"></div>
  `;
  hostDashboard.append(panel);

  const style = document.createElement('style');
  style.textContent = `
    #descuentos-panel .host-sale-toolbar {display:flex;flex-wrap:wrap;align-items:end;gap:12px;margin:16px 0}
    #descuentos-panel .host-sale-toolbar>label {display:flex;flex-direction:column;gap:6px;flex:1 1 220px}
    #descuentos-panel .host-sale-toolbar .host-sale-filter {flex:0 1 auto;flex-direction:row;align-items:center}
    #descuentos-panel .host-sale-filter input {width:auto}
    #host-sale-message {min-height:22px;color:#ffc329;font-weight:700}
    #descuentos-panel .host-sale-list {display:grid;gap:12px}
    #descuentos-panel .host-sale-card {background:rgba(255,255,255,.045);border:1px solid #66412d;
      padding:16px;border-radius:13px}
    #descuentos-panel .host-sale-card .host-sale-title {display:flex;flex-wrap:wrap;align-items:center;gap:9px}
    #descuentos-panel .host-sale-card .host-sale-title strong {font-size:17px}
    #descuentos-panel .host-sale-card .host-sale-fields {display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin-top:10px}
    #descuentos-panel .host-sale-fields label {display:flex;flex-direction:column;gap:5px;min-width:120px;flex:1}
    #descuentos-panel .host-sale-fields input[type="number"] {max-width:140px}
    #descuentos-panel .host-sale-fields .host-sale-enabled {flex:0 1 auto;flex-direction:row;align-items:center}
    #descuentos-panel .host-sale-enabled input {width:auto}
    #descuentos-panel .host-sale-price {color:#ffc329;font-weight:900;margin-top:8px}
    #descuentos-panel .host-sale-price del {color:#aaa;margin-right:8px;font-weight:500}
    #descuentos-panel .host-sale-badge {font-size:11px;font-weight:800;background:#ed171f;color:#fff;
      padding:4px 8px;border-radius:6px}
    #descuentos-panel .host-sale-card button {min-height:42px}
    @media (max-width:600px) {#descuentos-panel .host-sale-fields label {flex:1 1 100px}}
  `;
  document.head.append(style);

  let products = [];
  let loading = false;
  const list = $('host-sale-list');
  const message = text => { $('host-sale-message').textContent = String(text || ''); };

  const discountedPrice = (price, percent) =>
    Math.round(Number(price) * (100 - Number(percent)) / 100);

  async function authorize() {
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) throw Error('Iniciá sesión en el administrador.');
    const member = await db.from('admin_users')
      .select('user_id').eq('user_id', user.id).maybeSingle();
    if (member.error || !member.data) throw Error('No tenés permisos de administrador.');
    const aal = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.error || aal.data?.currentLevel !== 'aal2') {
      throw Error('Validá el código de doble autenticación para editar descuentos.');
    }
  }

  function pricePreview(card, product) {
    const percent = Number(card.querySelector('[data-sale-percent]').value);
    const enabled = card.querySelector('[data-sale-enabled]').checked;
    const target = card.querySelector('[data-sale-preview]');
    if (!enabled) {
      target.textContent = `Precio normal: ${money(product.price)}`;
      return;
    }
    if (!Number.isInteger(percent) || percent < 1 || percent > 90) {
      target.textContent = 'Ingresá un descuento entre 1% y 90%.';
      return;
    }
    target.replaceChildren();
    const oldPrice = document.createElement('del');
    oldPrice.textContent = money(product.price);
    const newPrice = document.createElement('strong');
    newPrice.textContent = `${money(discountedPrice(product.price, percent))} (${percent}% OFF)`;
    target.append(oldPrice, newPrice);
  }

  function render() {
    const search = $('host-sale-search').value.trim().toLowerCase();
    const only = $('host-sale-only').checked;
    const activeCount = products.filter(p => p.discount_active).length;
    $('host-sale-summary').textContent =
      `${products.length} productos · ${activeCount} promociones activas`;
    const filtered = products.filter(p =>
      p.name.toLowerCase().includes(search) && (!only || p.discount_active)
    );
    list.innerHTML = filtered.map(p => `
      <article class="host-sale-card" data-sale-id="${h(p.id)}">
        <div class="host-sale-title">
          <strong>${h(p.name)}</strong>
          ${p.discount_active ? `<span class="host-sale-badge">-${Number(p.discount_percent)}% ACTIVO</span>` : ''}
          ${p.available ? '' : '<small class="muted">Producto oculto</small>'}
        </div>
        <small class="muted">Precio original: ${money(p.price)}</small>
        <div class="host-sale-fields">
          <label>Descuento (%)
            <input type="number" data-sale-percent min="1" max="90" step="1"
              value="${p.discount_percent ?? ''}" placeholder="Ej.: 20">
          </label>
          <label class="host-sale-enabled">
            <input type="checkbox" data-sale-enabled ${p.discount_active ? 'checked' : ''}>
            Promoción activa
          </label>
          <button type="button" data-sale-save>Guardar descuento</button>
        </div>
        <div class="host-sale-price" data-sale-preview></div>
        <small class="muted">Para desactivar sin perder el porcentaje, desmarcá «Promoción activa» y guardá.</small>
      </article>
    `).join('') || '<p class="muted">No hay productos para mostrar.</p>';

    list.querySelectorAll('[data-sale-id]').forEach(card => {
      const product = products.find(p => p.id === card.dataset.saleId);
      if (!product) return;
      const percent = card.querySelector('[data-sale-percent]');
      const enabled = card.querySelector('[data-sale-enabled]');
      pricePreview(card, product);
      percent.oninput = () => pricePreview(card, product);
      enabled.onchange = () => pricePreview(card, product);
      card.querySelector('[data-sale-save]').onclick = async () => {
        const raw = percent.value.trim();
        const pct = raw === '' ? null : Number(raw);
        if (pct !== null && (!Number.isInteger(pct) || pct < 1 || pct > 90)) {
          return alert('Elegí un porcentaje entero de 1 a 90.');
        }
        if (enabled.checked && pct === null) {
          return alert('Ingresá el porcentaje antes de activar la promoción.');
        }
        if (enabled.checked && Number(product.price) <= 0) {
          return alert('No se puede descontar un producto que tiene precio cero.');
        }
        const saving = card.querySelector('[data-sale-save]');
        saving.disabled = true;
        message('Guardando promoción...');
        try {
          await authorize();
          const { data, error } = await db.from('products')
            .update({ discount_percent: pct, discount_active: enabled.checked })
            .eq('id', product.id).select('id');
          if (error) throw error;
          if (!data?.length) throw Error('No se pudo guardar el descuento; revisá los permisos.');
          message('Descuento guardado. Se aplicará al menú al actualizarlo.');
          await load();
        } catch (e) {
          message('Error: ' + e.message);
          saving.disabled = false;
        }
      };
    });
  }

  async function load() {
    if (loading) return;
    loading = true;
    message('Cargando productos...');
    try {
      await authorize();
      const rows = [];
      for (let start = 0; ; start += 500) {
        const { data, error } = await db.from('products')
          .select('id,name,price,available,discount_percent,discount_active')
          .order('name', { ascending: true })
          .range(start, start + 499);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 500) break;
      }
      products = rows;
      render();
      message('');
    } catch (e) {
      message('Error: ' + e.message);
    } finally {
      loading = false;
    }
  }

  hostTabs.querySelectorAll('[data-tab]').forEach(other => {
    if (other !== tab) {
      other.addEventListener('click', () => panel.classList.add('hidden'));
    }
  });

  tab.onclick = () => {
    hostTabs.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b === tab));
    ['categories','products','options','orders','points','canjes','orden-todos']
      .forEach(id => $(id + '-panel')?.classList.add('hidden'));
    panel.classList.remove('hidden');
    load();
  };
  $('host-sale-search').addEventListener('input', render);
  $('host-sale-only').addEventListener('change', render);
  $('host-sale-refresh').onclick = () => load();
}
