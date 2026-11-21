// HOST | Descuentos manuales sobre pedidos que ya iniciaron WhatsApp.
// Los cálculos definitivos y el control de permisos se realizan en Supabase.
import { db, money, escapeHTML, alertError } from '../shared.js';

const h = value => escapeHTML(String(value ?? ''));
const allowedStatuses = new Set(['iniciado_whatsapp', 'confirmado', 'preparando']);

export async function fetchOrderDiscounts(orders) {
  if (!orders.length) return new Map();
  const { data, error } = await db.from('host_order_discounts')
    .select('order_id,original_total,discount_type,discount_value,discount_amount,discounted_total')
    .in('order_id', orders.map(order => order.id));
  if (error) throw Error('No se pudieron cargar los descuentos de pedidos: ' + error.message);
  return new Map((data || []).map(item => [item.order_id, item]));
}

function discountLabel(discount) {
  return discount.discount_type === 'percent'
    ? Number(discount.discount_value) + '%'
    : money(discount.discount_value);
}

export function renderOrderAmount(order, discount) {
  if (!discount) return '<strong>' + money(order.total) + '</strong>';
  return '<del class="host-order-old-total">' + money(discount.original_total) + '</del> ' +
    '<strong class="host-order-new-total">' + money(order.total) + '</strong>' +
    '<small class="host-order-discount-label">🏷️ Descuento ' +
    h(discountLabel(discount)) + ' (−' + money(discount.discount_amount) + ')</small>';
}

export function renderOrderDiscountActions(order, discount) {
  let buttons = '';
  if (allowedStatuses.has(order.status)) {
    buttons += '<button type="button" class="secondary" data-order-discount-open="' +
      h(order.id) + '">' + (discount ? '✏️ Editar descuento' : '🏷️ Aplicar descuento') + '</button>';
  }
  if (discount) {
    buttons += '<button type="button" class="secondary" data-order-discount-copy="' +
      h(order.id) + '">Copiar total para WhatsApp</button>';
  }
  return buttons;
}

export function renderOrderDiscountEditor(order, discount) {
  if (!allowedStatuses.has(order.status)) return '';
  const id = h(order.id);
  const currentType = discount?.discount_type === 'amount' ? 'amount' : 'percent';
  const currentValue = discount ? String(Number(discount.discount_value)) : '10';
  return [
    '<div class="host-order-discount-editor" data-order-discount-editor="', id, '" hidden>',
      '<strong>Descuento para este pedido</strong>',
      '<div class="host-order-discount-fields">',
        '<label>Tipo de descuento',
          '<select data-order-discount-type>',
            '<option value="percent"', currentType === 'percent' ? ' selected' : '', '>Porcentaje (%)</option>',
            '<option value="amount"', currentType === 'amount' ? ' selected' : '', '>Monto fijo ($)</option>',
          '</select>',
        '</label>',
        '<label>Valor del descuento',
          '<input data-order-discount-value type="number" min="1" step="1" value="', h(currentValue), '">',
        '</label>',
      '</div>',
      '<p class="host-order-discount-preview" data-order-discount-preview aria-live="polite"></p>',
      '<p class="muted host-order-discount-tip">Se actualizará el total del pedido en HOST. ',
      'El mensaje que el cliente ya envió por WhatsApp no se modifica: ',
      'avisale el importe nuevo. Si la compra ya está confirmada, los puntos se recalcularán.</p>',
      '<div class="host-order-discount-buttons">',
        '<button type="button" data-order-discount-save>Guardar descuento</button>',
        discount ? '<button type="button" class="secondary" data-order-discount-remove>Quitar descuento</button>' : '',
        '<button type="button" class="secondary" data-order-discount-cancel>Cancelar</button>',
      '</div>',
      '<p class="host-order-discount-feedback" data-order-discount-feedback role="status" aria-live="polite"></p>',
    '</div>'
  ].join('');
}

function installStyles() {
  if (document.getElementById('host-order-discount-style')) return;
  const style = document.createElement('style');
  style.id = 'host-order-discount-style';
  style.textContent = [
    '#order-list .item-row{display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px}',
    '#order-list .host-order-info{flex:1 1 350px;min-width:0}',
    '#order-list .host-order-actions{display:flex;flex:0 1 300px;flex-wrap:wrap;align-items:center;gap:8px}',
    '#order-list .host-order-actions select{min-width:145px;max-width:100%}',
    '#order-list .host-order-actions button{min-height:38px;font-size:12px}',
    '#order-list .host-order-old-total{color:#a89b94;font-size:13px}',
    '#order-list .host-order-new-total{color:#ffc329}',
    '#order-list .host-order-discount-label{display:block;color:#ffc329;font-size:12px;margin:5px 0}',
    '#order-list .host-order-discount-editor{flex:1 0 100%;min-width:0;margin-top:10px;padding:16px;border:1px solid rgba(255,195,41,.4);border-radius:12px;background:rgba(255,195,41,.045)}',
    '#order-list .host-order-discount-editor[hidden]{display:none!important}',
    '#order-list .host-order-discount-fields{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}',
    '#order-list .host-order-discount-fields label{display:flex;flex-direction:column;gap:7px;flex:1 1 170px;max-width:280px}',
    '#order-list .host-order-discount-fields input,#order-list .host-order-discount-fields select{width:100%;min-width:0}',
    '#order-list .host-order-discount-preview{color:#ffc329;font-size:15px;font-weight:800}',
    '#order-list .host-order-discount-tip{font-size:12px;line-height:1.5}',
    '#order-list .host-order-discount-buttons{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}',
    '#order-list .host-order-discount-feedback{min-height:16px;color:#ffb34f;font-size:12px}',
    '@media(max-width:650px){#order-list .host-order-actions{flex:1 1 100%}}'
  ].join('\n');
  document.head.append(style);
}

export function bindOrderDiscountControls(orders, discounts, refresh) {
  installStyles();
  const list = document.getElementById('order-list');
  if (!list) return;

  const closeAll = () => list.querySelectorAll('[data-order-discount-editor]')
    .forEach(el => { el.hidden = true; });

  list.querySelectorAll('[data-order-discount-editor]').forEach(editor => {
    const order = orders.find(item => item.id === editor.dataset.orderDiscountEditor);
    if (!order) return;
    const existing = discounts.get(order.id);
    const base = Number(existing?.original_total ?? order.total);
    const type = editor.querySelector('[data-order-discount-type]');
    const input = editor.querySelector('[data-order-discount-value]');
    const preview = editor.querySelector('[data-order-discount-preview]');
    const feedback = editor.querySelector('[data-order-discount-feedback]');
    const save = editor.querySelector('[data-order-discount-save]');

    const calc = () => {
      const percent = type.value === 'percent';
      input.max = percent ? '100' : String(base);
      input.step = percent ? '1' : '0.01';
      const raw = input.value.trim();
      const value = Number(raw);
      const valid = raw !== '' && Number.isFinite(value) && base > 0 &&
        (percent ? (Number.isInteger(value) && value >= 1 && value <= 100)
          : (value >= 1 && value <= base && Math.round(value * 100) / 100 === value));
      if (!valid) {
        preview.textContent = 'Ingresá un descuento válido para el total de ' + money(base) + '.';
        save.disabled = true;
        return null;
      }
      const discountAmount = percent ? Math.round(base * value) / 100 : value;
      const final = Math.round((base - discountAmount) * 100) / 100;
      preview.textContent = 'Total anterior: ' + money(base) +
        ' · Descuento: −' + money(discountAmount) + ' · Nuevo total: ' + money(final);
      save.disabled = false;
      return { type: type.value, value, final };
    };

    type.onchange = calc;
    input.oninput = calc;
    editor.querySelector('[data-order-discount-cancel]').onclick = () => {
      editor.hidden = true;
      feedback.textContent = '';
    };
    const open = list.querySelector('[data-order-discount-open="' + order.id + '"]');
    if (open) open.onclick = () => {
      closeAll();
      editor.hidden = false;
      feedback.textContent = '';
      calc();
      input.focus();
    };

    save.onclick = async () => {
      const quote = calc();
      if (!quote) return;
      if (!confirm('¿Guardar el descuento y actualizar el total del pedido a ' +
        money(quote.final) + '?')) return;
      save.disabled = true;
      feedback.textContent = 'Guardando descuento...';
      try {
        const { data, error } = await db.rpc('host_admin_set_order_discount', {
          p_order_id: order.id, p_type: quote.type, p_value: quote.value
        });
        if (error) throw error;
        if (data?.error) throw Error(data.error);
        await refresh();
      } catch (error) {
        feedback.textContent = 'No se pudo guardar: ' + (error.message || 'Error desconocido');
        calc();
      }
    };

    const remove = editor.querySelector('[data-order-discount-remove]');
    if (remove) remove.onclick = async () => {
      if (!confirm('¿Quitar el descuento y restaurar el total a ' + money(base) + '?')) return;
      remove.disabled = true;
      feedback.textContent = 'Quitando descuento...';
      try {
        const { data, error } = await db.rpc('host_admin_set_order_discount', {
          p_order_id: order.id, p_type: 'none', p_value: null
        });
        if (error) throw error;
        if (data?.error) throw Error(data.error);
        await refresh();
      } catch (error) {
        feedback.textContent = 'No se pudo quitar: ' + (error.message || 'Error desconocido');
        remove.disabled = false;
      }
    };
    calc();
  });

  list.querySelectorAll('[data-order-discount-copy]').forEach(button => {
    button.onclick = async () => {
      const order = orders.find(item => item.id === button.dataset.orderDiscountCopy);
      const discount = order && discounts.get(order.id);
      if (!order || !discount) return;
      const message = 'HOST 🍗 | Pedido #' + order.id.slice(0,8).toUpperCase() +
        '\nTotal anterior: ' + money(discount.original_total) +
        '\nDescuento: −' + money(discount.discount_amount) +
        '\nTotal actualizado: ' + money(order.total) +
        '\n¡Gracias por elegirnos!';
      try {
        if (!navigator.clipboard?.writeText) throw Error('Portapapeles no disponible');
        await navigator.clipboard.writeText(message);
        button.textContent = '✓ Copiado para WhatsApp';
      } catch (error) {
        alertError(error);
      }
    };
  });
}