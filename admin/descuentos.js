// HOST — Administrador de descuentos por producto.
// No modifica el precio original; permite descuentos porcentuales o fijos en pesos.
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
      Elegí un producto, seleccioná porcentaje (%) o monto fijo ($) y activá la promoción.
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
    #descuentos-panel .host-sale-fields input[type="number"] {max-width:160px}
    #descuentos-panel .host-sale-fields select {min-width:130px}
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

  // En pesos se descuenta un importe del precio original (no es precio final).
  const discountedPrice = (price, type, value) =>
    type === 'amount'
      ? Math.round((Number(price) - Number(value)) * 100) / 100
      : Math.round(Number(price) * (100 - Number(value)) / 100);

  const saleType = p => p.discount_type === 'amount' ? 'amount' : 'percent';
  const discountDisplay = p => saleType(p) === 'amount'
    ? `${money(p.discount_amount)} OFF`
    : `${Number(p.discount_percent)}% OFF`;

  // Mensajes de validación compartidos por la vista previa y el guardado.
  function saleError(product, type, raw) {
    if (raw.trim() === '') return 'Ingresá un descuento antes de activarlo.';
    const value = Number(raw);
    if (type === 'percent') {
      return Number.isInteger(value) && value >= 1 && value <= 90
        ? ''
        : 'Elegí un porcentaje entero del 1 al 90.';
    }
    return Number.isInteger(value) && value > 0 && value < Number(product.price)
      ? ''
      : `Elegí un monto entero mayor a $0 y menor que ${money(product.price)}.`;
  }

  function updateField(card, product) {
    const type = card.querySelector('[data-sale-type]').value;
    const fieldLabel = card.querySelector('[data-sale-value-label]');
    const input = card.querySelector('[data-sale-value]');
    fieldLabel.firstChild.textContent = type === 'amount'
      ? 'Monto a descontar ($) ' : 'Descuento (%) ';
    input.placeholder = type === 'amount' ? 'Ej.: 2000' : 'Ej.: 20';
    input.max = type === 'amount'
      ? String(Math.max(0, Math.ceil(Number(product.price)) - 1)) : '90';
    input.min = '1';
    input.step = '1';
  }

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
    const type = card.querySelector('[data-sale-type]').value;
    const raw = card.querySelector('[data-sale-value]').value.trim();
    const enabled = card.querySelector('[data-sale-enabled]').checked;
    const target = card.querySelector('[data-sale-preview]');
    const invalid = saleError(product, type, raw);
    if (!enabled && !raw) {
      target.textContent = `Precio normal: ${money(product.price)}`;
      return;
    }
    if (invalid) {
      target.textContent = enabled ? invalid : `Promoción pausada · ${invalid}`;
      return;
    }
    const value = Number(raw);
    target.replaceChildren();
    const oldPrice = document.createElement('del');
    oldPrice.textContent = money(product.price);
    const newPrice = document.createElement('strong');
    const label = type === 'amount' ? `${money(value)} OFF` : `${value}% OFF`;
    newPrice.textContent = `${money(discountedPrice(product.price, type, value))} (${label})`;
    if (!enabled) {
      const muted = document.createElement('span');
      muted.textContent = 'Vista previa (promoción pausada): ';
      target.append(muted);
    }
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
          ${p.discount_active ? `<span class="host-sale-badge">${discountDisplay(p)} · ACTIVO</span>` : ''}
          ${p.available ? '' : '<small class="muted">Producto oculto</small>'}
        </div>
        <small class="muted">Precio original: ${money(p.price)}</small>
        <div class="host-sale-fields">
          <label>Tipo de descuento
            <select data-sale-type>
              <option value="percent" ${saleType(p) === 'percent' ? 'selected' : ''}>Porcentaje (%)</option>
              <option value="amount" ${saleType(p) === 'amount' ? 'selected' : ''}>Monto fijo ($)</option>
            </select>
          </label>
          <label data-sale-value-label>Descuento (%)
            <input type="number" data-sale-value min="1" step="1"
              value="${saleType(p) === 'amount' ? (p.discount_amount ?? '') : (p.discount_percent ?? '')}">
          </label>
          <label class="host-sale-enabled">
            <input type="checkbox" data-sale-enabled ${p.discount_active ? 'checked' : ''}>
            Promoción activa
          </label>
          <button type="button" data-sale-save>Guardar descuento</button>
        </div>
        <div class="host-sale-price" data-sale-preview></div>
        <small class="muted">Para pausar la oferta sin perder su valor, desmarcá «Promoción activa» y guardá. El monto fijo se resta al precio original. Escribí los pesos sin separador de miles (ej.: 2000).</small>
      </article>
    `).join('') || '<p class="muted">No hay productos para mostrar.</p>';

    list.querySelectorAll('[data-sale-id]').forEach(card => {
      const product = products.find(p => p.id === card.dataset.saleId);
      if (!product) return;
      const type = card.querySelector('[data-sale-type]');
      const valueInput = card.querySelector('[data-sale-value]');
      const enabled = card.querySelector('[data-sale-enabled]');
      updateField(card, product);
      pricePreview(card, product);
      type.onchange = () => {
        valueInput.value = '';
        updateField(card, product);
        pricePreview(card, product);
      };
      valueInput.oninput = () => pricePreview(card, product);
      enabled.onchange = () => pricePreview(card, product);
      card.querySelector('[data-sale-save]').onclick = async () => {
        const selectedType = type.value;
        const raw = valueInput.value.trim();
        if (raw !== '' && saleError(product, selectedType, raw)) {
          return alert(saleError(product, selectedType, raw));
        }
        if (enabled.checked && saleError(product, selectedType, raw)) {
          return alert(saleError(product, selectedType, raw));
        }
        const amount = raw === '' ? null : Number(raw);
        const update = {
          discount_type: selectedType,
          discount_percent: selectedType === 'percent' ? amount : null,
          discount_amount: selectedType === 'amount' ? amount : null,
          discount_active: enabled.checked
        };
        const saving = card.querySelector('[data-sale-save]');
        saving.disabled = true;
        message('Guardando promoción...');
        try {
          await authorize();
          const { data, error } = await db.from('products')
            .update(update)
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
          .select('id,name,price,available,discount_type,discount_percent,discount_amount,discount_active')
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
