// HOST — Promociones programadas. Fechas y horas en Argentina.
// Requiere permisos de administrador y MFA AAL2; Supabase aplica RLS también.
import { db, money, escapeHTML } from '../shared.js';

const dashboard = document.getElementById('dashboard');
const tabs = dashboard?.querySelector('.tabs');
const $ = id => document.getElementById(id);
const h = value => escapeHTML(String(value ?? ''));
const DAYS = [
  [1, 'Lun'], [2, 'Mar'], [3, 'Mié'], [4, 'Jue'], [5, 'Vie'], [6, 'Sáb'], [0, 'Dom']
];
const dayNames = Object.fromEntries(DAYS);
const localParts = at => {
  const data = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(at).map(x => [x.type, x.value]));
  return { date: `${data.year}-${data.month}-${data.day}`, time: `${data.hour}:${data.minute}` };
};
const dayNumber = date => new Date(`${date}T12:00:00Z`).getUTCDay();
const dayBefore = date => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
const time5 = t => String(t || '00:00').slice(0, 5);
const today = () => localParts(new Date()).date;

if (dashboard && tabs && !$('host-schedules-panel')) {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.dataset.tab = 'programados';
  tab.textContent = '📅 Programados';
  const discountsTab = tabs.querySelector('[data-tab="descuentos"]');
  if (discountsTab) discountsTab.after(tab);
  else tabs.append(tab);

  const panel = document.createElement('section');
  panel.id = 'host-schedules-panel';
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <h2>📅 Descuentos programados</h2>
    <p class="muted">Creá promociones por fechas, días y horarios de Argentina.
    Se aplican automáticamente al menú y a los pedidos. No se suman al descuento manual:
    mientras una programación está activa, reemplaza temporalmente la oferta manual del producto.</p>
    <form id="host-schedule-form" class="host-schedule-form">
      <input type="hidden" name="id">
      <div class="host-schedule-grid">
        <label>Producto
          <select name="product_id" required id="host-schedule-product"></select>
        </label>
        <label>Nombre de la promoción (opcional)
          <input name="title" maxlength="100" placeholder="Ej.: Lunes de Nuggets">
        </label>
        <label>Tipo de descuento
          <select name="discount_type" id="host-schedule-kind">
            <option value="percent">Porcentaje (%)</option>
            <option value="amount">Monto fijo ($)</option>
          </select>
        </label>
        <label><span id="host-schedule-value-label">Descuento (%)</span>
          <input name="value" id="host-schedule-value" type="number" min="1" step="1" required placeholder="Ej.: 20">
        </label>
        <label>Desde el día
          <input name="valid_from" type="date" required>
        </label>
        <label>Hasta el día (vacío = sin fecha de fin)
          <input name="valid_until" type="date">
        </label>
        <label>Hora de inicio
          <input name="starts_at" type="time" value="00:00" required>
        </label>
        <label>Hora de fin
          <input name="ends_at" type="time" value="00:00" required>
        </label>
      </div>
      <fieldset class="host-schedule-weekdays">
        <legend>Días de la semana</legend>
        <div class="host-schedule-days">
          ${DAYS.map(([v, label]) => `<label><input type="checkbox" name="weekdays" value="${v}" checked> ${label}</label>`).join('')}
        </div>
        <div class="host-schedule-presets">
          <button type="button" class="secondary" data-days="all">Todos</button>
          <button type="button" class="secondary" data-days="week">Lun a vie</button>
          <button type="button" class="secondary" data-days="weekend">Sáb y dom</button>
          <button type="button" class="secondary" data-days="monday">Solo lunes</button>
        </div>
      </fieldset>
      <label class="host-schedule-enabled"><input name="enabled" type="checkbox" checked> Programación habilitada</label>
      <div id="host-schedule-preview" class="host-schedule-preview"></div>
      <p class="muted">Si inicio y fin son 00:00, se aplica todo el día. También admitimos horarios
      que cruzan la medianoche, por ejemplo de 22:00 a 02:00.</p>
      <div class="row" style="gap:10px;flex-wrap:wrap">
        <button id="host-schedule-save" type="submit">Guardar programación</button>
        <button id="host-schedule-cancel" type="button" class="secondary">Limpiar / nueva</button>
      </div>
    </form>
    <p id="host-schedule-message" role="status" aria-live="polite"></p>
    <h3>Promociones programadas</h3>
    <p id="host-schedule-summary" class="muted"></p>
    <div id="host-schedule-list"></div>
    <button type="button" id="host-schedule-refresh" class="secondary">Actualizar</button>
  `;
  dashboard.append(panel);

  const style = document.createElement('style');
  style.textContent = `
    #host-schedules-panel .host-schedule-form {background:rgba(255,255,255,.035);border:1px solid #69412b;border-radius:14px;padding:16px;margin:18px 0}
    #host-schedules-panel .host-schedule-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}
    #host-schedules-panel label {display:flex;flex-direction:column;gap:6px;font-weight:650}
    #host-schedules-panel input,#host-schedules-panel select {max-width:100%;box-sizing:border-box}
    #host-schedules-panel .host-schedule-weekdays {border:1px solid #6a472d;border-radius:10px;margin:14px 0;padding:12px}
    #host-schedules-panel .host-schedule-days {display:flex;flex-wrap:wrap;gap:9px;margin:9px 0}
    #host-schedules-panel .host-schedule-days label,#host-schedules-panel .host-schedule-enabled {display:flex;flex-direction:row;align-items:center;gap:8px}
    #host-schedules-panel input[type=checkbox] {width:auto}
    #host-schedules-panel .host-schedule-presets {display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
    #host-schedules-panel .host-schedule-presets button {min-height:34px;padding:7px 10px}
    #host-schedules-panel .host-schedule-preview {padding:12px;margin:14px 0;background:#26180e;border-radius:9px;color:#ffc329;font-weight:800}
    #host-schedules-panel #host-schedule-message {color:#ffc329;min-height:22px;font-weight:700}
    #host-schedules-panel #host-schedule-list {display:grid;gap:11px;margin:12px 0}
    #host-schedules-panel .host-schedule-entry {padding:14px;border:1px solid #62422b;border-radius:13px;background:rgba(255,255,255,.045)}
    #host-schedules-panel .host-schedule-entry .row {display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}
    #host-schedules-panel .host-schedule-entry button {min-height:36px;padding:8px 12px}
    #host-schedules-panel .host-schedule-status {display:inline-block;border-radius:6px;background:#494036;padding:4px 8px;color:#fff;font-size:12px;font-weight:800}
    #host-schedules-panel .host-schedule-status.now {background:#13794c}
    #host-schedules-panel .host-schedule-status.paused {background:#875e19}
  `;
  document.head.append(style);

  const form = $('host-schedule-form');
  const statusText = message => { $('host-schedule-message').textContent = message || ''; };
  let products = [];
  let schedules = [];
  let loading = false;

  async function authorize() {
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) throw Error('Iniciá sesión en el administrador.');
    const aal = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal.error || aal.data?.currentLevel !== 'aal2') {
      throw Error('Primero completá la verificación de doble autenticación.');
    }
  }

  function selectedWeekdays() {
    return [...form.querySelectorAll('input[name="weekdays"]:checked')].map(x => Number(x.value));
  }

  function setDays(days) {
    form.querySelectorAll('input[name="weekdays"]').forEach(x => {
      x.checked = days.includes(Number(x.value));
    });
  }

  function resetForm() {
    form.reset();
    form.elements.id.value = '';
    form.elements.valid_from.value = today();
    form.elements.starts_at.value = '00:00';
    form.elements.ends_at.value = '00:00';
    form.elements.enabled.checked = true;
    setDays([0, 1, 2, 3, 4, 5, 6]);
    $('host-schedule-save').textContent = 'Guardar programación';
    updatePreview();
  }

  function priceFor(product, type, value) {
    return type === 'amount'
      ? Math.round((Number(product.price) - value) * 100) / 100
      : Math.round(Number(product.price) * (100 - value) / 100);
  }

  function validate() {
    const d = new FormData(form);
    const product = products.find(x => x.id === d.get('product_id'));
    if (!product) throw Error('Seleccioná un producto válido.');
    const type = d.get('discount_type');
    const value = Number(d.get('value'));
    if (!Number.isFinite(value)) throw Error('Ingresá un descuento válido.');
    if (type === 'percent' && (!Number.isInteger(value) || value < 1 || value > 90)) {
      throw Error('Elegí un porcentaje entero entre 1 y 90.');
    }
    if (type === 'amount' && (!Number.isInteger(value) || value <= 0 || value >= Number(product.price))) {
      throw Error(`El monto debe ser mayor a $0 y menor que ${money(product.price)}.`);
    }
    if (!['amount', 'percent'].includes(type)) throw Error('Tipo de descuento inválido.');
    const start = String(d.get('valid_from') || '');
    const end = String(d.get('valid_until') || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw Error('Elegí una fecha de inicio.');
    if (end && ( !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < start)) {
      throw Error('La fecha final no puede ser anterior al inicio.');
    }
    const days = selectedWeekdays();
    if (!days.length) throw Error('Elegí al menos un día de la semana.');
    const fromTime = String(d.get('starts_at') || '');
    const toTime = String(d.get('ends_at') || '');
    if (!/^\d{2}:\d{2}$/.test(fromTime) || !/^\d{2}:\d{2}$/.test(toTime)) {
      throw Error('Ingresá un horario válido.');
    }
    if (fromTime === toTime && fromTime !== '00:00') {
      throw Error('Para una promoción de todo el día, usá 00:00 a 00:00.');
    }
    return {
      product_id: product.id,
      title: String(d.get('title') || '').trim(),
      discount_type: type,
      discount_percent: type === 'percent' ? value : null,
      discount_amount: type === 'amount' ? value : null,
      valid_from: start,
      valid_until: end || null,
      weekdays: days,
      starts_at: fromTime,
      ends_at: toTime,
      enabled: d.has('enabled'),
      updated_at: new Date().toISOString()
    };
  }

  function updatePreview() {
    const product = products.find(x => x.id === form.elements.product_id.value);
    const type = form.elements.discount_type.value;
    const value = Number(form.elements.value.value);
    $('host-schedule-value-label').textContent = type === 'amount' ? 'Monto a descontar ($)' : 'Descuento (%)';
    const field = form.elements.value;
    field.placeholder = type === 'amount' ? 'Ej.: 2000' : 'Ej.: 20';
    field.max = type === 'percent' ? '90' : product ? String(Math.ceil(Number(product.price)) - 1) : '';
    if (!product) { $('host-schedule-preview').textContent = 'Elegí un producto para ver su precio.'; return; }
    const valid = form.elements.value.value !== '' && (
      type === 'amount' ? Number.isInteger(value) && value > 0 && value < Number(product.price)
        : Number.isInteger(value) && value >= 1 && value <= 90
    );
    $('host-schedule-preview').textContent = valid
      ? `Precio original: ${money(product.price)} → Precio de promoción: ${money(priceFor(product, type, value))}`
      : `Precio original: ${money(product.price)} · Ingresá un descuento válido.`;
  }

  function applies(s, at = new Date()) {
    if (!s.enabled) return false;
    const now = localParts(at);
    const start = time5(s.starts_at);
    const end = time5(s.ends_at);
    const inWindow = day => day >= s.valid_from && (!s.valid_until || day <= s.valid_until)
      && s.weekdays.includes(dayNumber(day));
    if (start === end) return inWindow(now.date);
    if (start < end) return inWindow(now.date) && now.time >= start && now.time < end;
    return (inWindow(now.date) && now.time >= start)
      || (inWindow(dayBefore(now.date)) && now.time < end);
  }

  function state(s) {
    if (!s.enabled) return ['Pausada', 'paused'];
    if (applies(s)) return ['Activa ahora', 'now'];
    if (s.valid_until && today() > s.valid_until) return ['Finalizada', ''];
    return ['Programada', ''];
  }

  function render() {
    const active = schedules.filter(s => applies(s)).length;
    $('host-schedule-summary').textContent = `${schedules.length} programaciones · ${active} activas ahora`;
    const byProduct = Object.fromEntries(products.map(x => [x.id, x]));
    $('host-schedule-list').innerHTML = schedules.map(s => {
      const product = byProduct[s.product_id];
      const [stateText, stateClass] = state(s);
      const value = s.discount_type === 'amount' ? money(s.discount_amount) : `${s.discount_percent}%`;
      const days = [...s.weekdays].sort((a, b) => (a || 7) - (b || 7)).map(d => dayNames[d]).join(', ');
      return `<article class="host-schedule-entry" data-schedule-id="${h(s.id)}">
        <div class="row"><strong>${h(s.title || product?.name || 'Promoción')}</strong>
          <span class="host-schedule-status ${stateClass}">${stateText}</span></div>
        <div>${h(product?.name || 'Producto eliminado')} · <strong>${h(value)} OFF</strong></div>
        <small class="muted">${h(s.valid_from)} a ${h(s.valid_until || 'sin fecha de fin')} · ${h(days)} · ${h(time5(s.starts_at))} a ${h(time5(s.ends_at))}${time5(s.starts_at) === time5(s.ends_at) ? ' (todo el día)' : ''}</small>
        <div class="row">
          <button type="button" class="secondary" data-schedule-edit="${h(s.id)}">Editar</button>
          <button type="button" class="secondary" data-schedule-toggle="${h(s.id)}">${s.enabled ? 'Pausar' : 'Activar'}</button>
          <button type="button" class="danger" data-schedule-remove="${h(s.id)}">Eliminar</button>
        </div>
      </article>`;
    }).join('') || '<p class="muted">Todavía no hay descuentos programados.</p>';
    $('host-schedule-list').querySelectorAll('[data-schedule-edit]').forEach(b => {
      b.onclick = () => edit(b.dataset.scheduleEdit);
    });
    $('host-schedule-list').querySelectorAll('[data-schedule-toggle]').forEach(b => {
      b.onclick = () => toggle(b.dataset.scheduleToggle);
    });
    $('host-schedule-list').querySelectorAll('[data-schedule-remove]').forEach(b => {
      b.onclick = () => remove(b.dataset.scheduleRemove);
    });
  }

  function edit(id) {
    const s = schedules.find(x => x.id === id);
    if (!s) return;
    form.elements.id.value = s.id;
    form.elements.product_id.value = s.product_id;
    form.elements.title.value = s.title || '';
    form.elements.discount_type.value = s.discount_type;
    form.elements.value.value = s.discount_type === 'amount' ? s.discount_amount : s.discount_percent;
    form.elements.valid_from.value = s.valid_from;
    form.elements.valid_until.value = s.valid_until || '';
    form.elements.starts_at.value = time5(s.starts_at);
    form.elements.ends_at.value = time5(s.ends_at);
    form.elements.enabled.checked = s.enabled;
    setDays(s.weekdays);
    $('host-schedule-save').textContent = 'Guardar cambios';
    updatePreview();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function load() {
    if (loading) return;
    loading = true;
    statusText('Cargando programaciones...');
    try {
      await authorize();
      const [p, s] = await Promise.all([
        db.from('products').select('id,name,price,available').order('name'),
        db.from('host_scheduled_discounts').select('*').order('created_at', { ascending: false })
      ]);
      if (p.error) throw p.error;
      if (s.error) throw s.error;
      products = p.data || [];
      schedules = s.data || [];
      const selected = form.elements.product_id.value;
      $('host-schedule-product').innerHTML = products.map(x =>
        `<option value="${h(x.id)}">${h(x.name)}${x.available ? '' : ' (oculto)'}</option>`
      ).join('');
      if (selected && products.some(x => x.id === selected)) form.elements.product_id.value = selected;
      else if (!form.elements.id.value) resetForm();
      render();
      updatePreview();
      statusText('');
    } catch (e) {
      statusText('Error: ' + e.message);
    } finally { loading = false; }
  }

  async function toggle(id) {
    const schedule = schedules.find(x => x.id === id);
    if (!schedule) return;
    statusText('Actualizando promoción...');
    try {
      await authorize();
      const { error } = await db.from('host_scheduled_discounts')
        .update({ enabled: !schedule.enabled, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await load();
      statusText('Programación actualizada.');
    } catch (e) { statusText('Error: ' + e.message); }
  }

  async function remove(id) {
    if (!confirm('¿Eliminar esta programación? No afecta los precios originales.')) return;
    statusText('Eliminando programación...');
    try {
      await authorize();
      const { error } = await db.from('host_scheduled_discounts').delete().eq('id', id);
      if (error) throw error;
      if (form.elements.id.value === id) resetForm();
      await load();
      statusText('Programación eliminada.');
    } catch (e) { statusText('Error: ' + e.message); }
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    let record;
    try { record = validate(); }
    catch (err) { statusText(err.message); return; }
    const save = $('host-schedule-save');
    save.disabled = true;
    statusText('Guardando programación...');
    try {
      await authorize();
      const editing = form.elements.id.value;
      const query = db.from('host_scheduled_discounts');
      const { error } = editing
        ? await query.update(record).eq('id', editing)
        : await query.insert(record);
      if (error) throw error;
      resetForm();
      await load();
      statusText('Promoción guardada. Se activará y terminará automáticamente.');
    } catch (e) {
      statusText('Error: ' + e.message);
    } finally { save.disabled = false; }
  });

  form.addEventListener('input', updatePreview);
  form.addEventListener('change', updatePreview);
  form.querySelectorAll('[data-days]').forEach(b => {
    b.onclick = () => {
      const choices = {
        all: [0, 1, 2, 3, 4, 5, 6], week: [1, 2, 3, 4, 5],
        weekend: [6, 0], monday: [1]
      };
      setDays(choices[b.dataset.days] || []);
    };
  });
  $('host-schedule-cancel').onclick = resetForm;
  $('host-schedule-refresh').onclick = load;

  tabs.querySelectorAll('[data-tab]').forEach(other => {
    if (other !== tab) other.addEventListener('click', () => panel.classList.add('hidden'));
  });
  tab.onclick = () => {
    tabs.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b === tab));
    [...dashboard.children].filter(p => p.classList.contains('panel')).forEach(p => p.classList.add('hidden'));
    panel.classList.remove('hidden');
    load();
  };

  resetForm();
  window.setInterval(() => {
    if (!panel.classList.contains('hidden') && schedules.length) render();
  }, 60000);
}