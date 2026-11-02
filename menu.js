
import { db, money, escapeHTML, uid, alertError } from './shared.js';
import { configured, WHATSAPP_NUMBER } from './config.js';

const $ = s => document.querySelector(s);

let categories = [];
let products = [];
let active = 'all';
let optionGroups = [];
let optionValues = [];
let productLinks = [];

const cart = new Map();

if (!configured) {
  $('#setup').classList.remove('hidden');
} else {
  load().catch(alertError);
}

async function load() {
  const [c, p, g, v, l] = await Promise.all([
    db.from('categories').select('*').order('position'),
    db.from('products').select('*').eq('available', true).order('position'),
    db.from('option_groups').select('*').order('position'),
    db.from('option_values').select('*').order('position'),
    db.from('product_option_groups').select('*').order('position')
  ]);

  for (const result of [c, p, g, v, l]) {
    if (result.error) throw result.error;
  }

  categories = c.data || [];
  products = p.data || [];
  optionGroups = g.data || [];
  optionValues = v.data || [];
  productLinks = l.data || [];

  render();
}

function render() {
  const cat = $('#categories');
  cat.replaceChildren();

  [['all', 'Todos'], ...categories.map(c => [c.id, c.name])]
    .forEach(([id, name]) => {
      const b = document.createElement('button');
      b.textContent = name;
      b.className = active === id ? 'active' : '';

      b.onclick = () => {
        active = id;
        render();
      };

      cat.append(b);
    });

  $('#products').innerHTML = products
    .filter(p => active === 'all' || p.category_id === active)
    .map(p => `
      <article class="product">
        ${p.image_url
          ? `<img src="${escapeHTML(p.image_url)}"
                  alt="${escapeHTML(p.name)}" loading="lazy">`
          : '<div class="placeholder">🍗</div>'}

        <h3>${escapeHTML(p.name)}</h3>
        <p class="muted">${escapeHTML(p.description || '')}</p>
        <div class="price">${money(p.price)}</div>
        <button data-add="${p.id}">Agregar +</button>
      </article>
    `).join('') || '<p>No hay productos en esta categoría.</p>';

  document.querySelectorAll('[data-add]').forEach(b => {
    b.onclick = () => chooseOptions(b.dataset.add);
  });

  renderCart();
}

// NUEVO SELECTOR DE OPCIONALES CON CANTIDADES

function chooseOptions(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;

  const gs = productLinks
    .filter(l => l.product_id === id)
    .map(l => optionGroups.find(g => g.id === l.group_id))
    .filter(Boolean);

  if (!gs.length) {
    addConfigured(p, []);
    return;
  }

  const quantities = new Map();

  const overlay = document.createElement('div');
  overlay.className = 'option-overlay';

  overlay.innerHTML = `
    <div class="option-dialog" role="dialog" aria-modal="true">
      <div class="row">
        <h2 class="grow">${escapeHTML(p.name)}</h2>
        <button type="button" class="secondary" id="close-options">
          ✕
        </button>
      </div>

      <p class="muted">Personalizá tu pedido</p>

      <form id="choose-form">
        ${gs.map(g => {
          const max = Number(g.max_select);
          const values = optionValues.filter(v => v.group_id === g.id);

          return `
            <fieldset data-option-group="${g.id}">
              <legend>
                <strong>${escapeHTML(g.name)}</strong>
                <small>Elegí ${max} unidades</small>
              </legend>

              ${values.map(v => `
                <div class="host-quantity-choice">
                  <div class="host-choice-name">
                    <strong>${escapeHTML(v.name)}</strong>
                    <small>
                      ${Number(v.extra_price)
                        ? `(+${money(v.extra_price)} c/u)`
                        : '(sin cargo)'}
                    </small>
                  </div>

                  <div class="host-quantity-controls">
                    <button
                      type="button"
                      class="secondary"
                      data-option-minus="${v.id}"
                    >−</button>

                    <strong data-option-count="${v.id}">0</strong>

                    <button
                      type="button"
                      class="secondary"
                      data-option-plus="${v.id}"
                    >+</button>
                  </div>
                </div>
              `).join('') || '<p>No hay opciones disponibles</p>'}

              <p class="muted selection-status"></p>
            </fieldset>
          `;
        }).join('')}

        <button type="submit" id="confirm-options">
          Agregar al carrito
        </button>
      </form>
    </div>
  `;

  document.body.append(overlay);

  const form = overlay.querySelector('#choose-form');
  const confirmButton = overlay.querySelector('#confirm-options');

  function groupTotal(g) {
    return optionValues
      .filter(v => v.group_id === g.id)
      .reduce((sum, v) => sum + (quantities.get(v.id) || 0), 0);
  }

  function updateSelections() {
    let valid = true;

    for (const g of gs) {
      const max = Number(g.max_select);
      const total = groupTotal(g);

      const fieldset = [...form.querySelectorAll('[data-option-group]')]
        .find(el => el.dataset.optionGroup === String(g.id));

      if (!fieldset) continue;

      for (const v of optionValues.filter(v => v.group_id === g.id)) {
        const quantity = quantities.get(v.id) || 0;

        const count = [...fieldset.querySelectorAll('[data-option-count]')]
          .find(el => el.dataset.optionCount === String(v.id));

        const plus = [...fieldset.querySelectorAll('[data-option-plus]')]
          .find(el => el.dataset.optionPlus === String(v.id));

        const minus = [...fieldset.querySelectorAll('[data-option-minus]')]
          .find(el => el.dataset.optionMinus === String(v.id));

        if (count) count.textContent = quantity;
        if (plus) plus.disabled = total >= max;
        if (minus) minus.disabled = quantity <= 0;
      }

      const status = fieldset.querySelector('.selection-status');

      status.textContent = total === max
        ? `✓ Cupo completo: ${total} de ${max}`
        : `${total} de ${max} unidades · Faltan ${max - total}`;

      if (total !== max) valid = false;
    }

    confirmButton.disabled = !valid;
    return valid;
  }

  form.addEventListener('click', e => {
    const plus = e.target.closest('[data-option-plus]');
    const minus = e.target.closest('[data-option-minus]');

    if (!plus && !minus) return;

    const button = plus || minus;
    const optionId = plus
      ? plus.dataset.optionPlus
      : minus.dataset.optionMinus;

    const value = optionValues.find(v => v.id === optionId);
    if (!value) return;

    const group = gs.find(g => g.id === value.group_id);
    if (!group) return;

    const current = quantities.get(optionId) || 0;

    if (plus && groupTotal(group) < Number(group.max_select)) {
      quantities.set(optionId, current + 1);
    }

    if (minus && current > 0) {
      quantities.set(optionId, current - 1);
    }

    updateSelections();
  });

  updateSelections();

  overlay.querySelector('#close-options').onclick = () => {
    overlay.remove();
  };

  overlay.onclick = e => {
    if (e.target === overlay) overlay.remove();
  };

  form.onsubmit = e => {
    e.preventDefault();

    if (!updateSelections()) {
      alert('Completá el cupo de todas las opciones.');
      return;
    }

    const selected = [];

    for (const g of gs) {
      for (const v of optionValues.filter(v => v.group_id === g.id)) {
        const quantity = quantities.get(v.id) || 0;

        if (quantity > 0) {
          selected.push({
            id: v.id,
            group: g.name,
            name: v.name,
            quantity,
            extra_price: Number(v.extra_price)
          });
        }
      }
    }

    addConfigured(p, selected);
    overlay.remove();
  };
}

// CARRITO

function optionQuantity(o) {
  return Number(o.quantity || 1);
}

function optionTotal(selected) {
  return selected.reduce(
    (sum, o) => sum + Number(o.extra_price) * optionQuantity(o),
    0
  );
}

function addConfigured(p, selected) {
  const key = p.id + '|' + selected
    .map(o => `${o.id}:${optionQuantity(o)}`)
    .sort()
    .join(',');

  const existing = cart.get(key);

  cart.set(key, {
    id: p.id,
    quantity: (existing?.quantity || 0) + 1,
    selected
  });

  renderCart();
}

function renderCart() {
  const entries = [...cart];

  $('#cart').innerHTML = entries.map(([key, item]) => {
    const p = products.find(x => x.id === item.id);
    if (!p) return '';

    const unit = Number(p.price) + optionTotal(item.selected);

    return `
      <div class="item-row">
        <div>
          <strong>${escapeHTML(p.name)}</strong><br>

          ${item.selected.map(o =>
            `${optionQuantity(o)} × ${escapeHTML(o.group)}: ${escapeHTML(o.name)}`
          ).join('<br>')}

          ${item.selected.length ? '<br>' : ''}

          ${item.quantity} × ${money(unit)} =
          ${money(item.quantity * unit)}
        </div>

        <div class="actions">
          <button class="secondary" data-minus="${key}">−</button>
          <button data-plus="${key}">+</button>
        </div>
      </div>
    `;
  }).join('') || '<p class="muted">Tu carrito está vacío.</p>';

  const total = entries.reduce((sum, [, item]) => {
    const p = products.find(x => x.id === item.id);
    const unit = Number(p?.price || 0) + optionTotal(item.selected);
    return sum + item.quantity * unit;
  }, 0);

  $('#total').textContent = money(total);

  document.querySelectorAll('[data-minus]').forEach(b => {
    b.onclick = () => {
      const key = b.dataset.minus;
      const item = cart.get(key);
      if (!item) return;

      item.quantity--;

      if (item.quantity <= 0) cart.delete(key);
      renderCart();
    };
  });

  document.querySelectorAll('[data-plus]').forEach(b => {
    b.onclick = () => {
      const item = cart.get(b.dataset.plus);
      if (!item) return;

      item.quantity++;
      renderCart();
    };
  });
}

// MÉTODOS DE PAGO Y ENTREGA

$('#payment').onchange = () => {
  const cash = $('#payment').value === 'Efectivo';
  $('#cash-wrap').classList.toggle('hidden', !cash);

  if (!cash) $('#cash_amount').value = '';
};

$('#delivery').onchange = () => {
  const delivery = $('#delivery').value === 'Delivery';

  $('#address-wrap').classList.toggle('hidden', !delivery);
  $('#address').required = delivery;
};

// ENVÍO A WHATSAPP

$('#checkout').onsubmit = async e => {
  e.preventDefault();

  if (!configured) return alert('Falta configurar Supabase');
  if (!cart.size) return alert('Agregá al menos un producto');

  if (!/^\d{10,15}$/.test(WHATSAPP_NUMBER)) {
    return alert('HOST todavía no configuró su número de WhatsApp');
  }

  const btn = $('#send');
  btn.disabled = true;

  const f = new FormData(e.target);

  const items = [...cart].map(([, item]) => {
    const p = products.find(x => x.id === item.id);

    return {
      product_id: item.id,
      name: p.name,
      price: Number(p.price) + optionTotal(item.selected),
      quantity: item.quantity,
      options: item.selected
    };
  });

  const total = items.reduce(
    (sum, p) => sum + p.price * p.quantity, 0
  );

  const orderId = uid();
  const name = String(f.get('name') || '').trim();
  const delivery = String(f.get('delivery') || '');
  const address = String(f.get('address') || '').trim();
  const notes = String(f.get('notes') || '').trim();
  const payment = String(f.get('payment') || '');

  const cashAmount =
    payment === 'Efectivo' && f.get('cash_amount') !== ''
      ? Number(f.get('cash_amount'))
      : null;

  if (!['Efectivo', 'Transferencia / Mercado Pago'].includes(payment)) {
    btn.disabled = false;
    return alert('Seleccioná una forma de pago');
  }

  if (
    cashAmount !== null &&
    (!Number.isFinite(cashAmount) || cashAmount < total)
  ) {
    btn.disabled = false;
    return alert('El efectivo indicado debe alcanzar el total del pedido');
  }

  const paymentNotes =
    `Forma de pago: ${payment}` +
    (cashAmount !== null
      ? ` | Abona con: ${money(cashAmount)} | Vuelto: ${money(cashAmount - total)}`
      : '');

  const storedNotes = [paymentNotes, notes]
    .filter(Boolean)
    .join('\n');

  const orderLines = items.flatMap(item => {
    const lines = [
      `• ${item.quantity} × ${item.name} — ${money(item.quantity * item.price)}`
    ];

    const grouped = new Map();

    for (const option of item.options) {
      if (!grouped.has(option.group)) {
        grouped.set(option.group, []);
      }
      grouped.get(option.group).push(option);
    }

    for (const [group, options] of grouped) {
      lines.push(`  *${group}:*`);

      for (const option of options) {
        lines.push(
          `  - ${optionQuantity(option)} × ${option.name}` +
          (Number(option.extra_price)
            ? ` (+${money(Number(option.extra_price) * optionQuantity(option))})`
            : '')
        );
      }
    }

    lines.push('');
    return lines;
  });

  const message = [
    '🍗 *PEDIDO HOST*',
    `Código: ${orderId.slice(0, 8).toUpperCase()}`,
    `Cliente: ${name}`,
    `Entrega: ${delivery}`,
    `Pago: ${payment}`,

    ...(cashAmount !== null
      ? [
          `Abona con: ${money(cashAmount)}`,
          `Vuelto: ${money(cashAmount - total)}`
        ]
      : []),

    ...(address ? [`Dirección: ${address}`] : []),

    '',
    '*DETALLE DEL PEDIDO*',
    '',
    ...orderLines,
    `*TOTAL: ${money(total)}*`,

    ...(notes ? [`Observaciones: ${notes}`] : [])
  ].join('\n');

  const url =
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

  const win = window.open('about:blank', '_blank');

  try {
    const { error } = await db.from('orders').insert({
      id: orderId,
      customer_name: name,
      delivery_type: delivery,
      address,
      notes: storedNotes,
      items,
      total,
      status: 'iniciado_whatsapp'
    });

    if (error) throw error;

    $('#checkout-status').textContent =
      'Pedido registrado como iniciado. Confirmalo enviando el mensaje en WhatsApp.';

    cart.clear();
    renderCart();

    if (win) {
      win.location.href = url;
    } else {
      window.location.href = url;
    }

  } catch (err) {
    if (win) win.close();
    alertError(err);
  } finally {
    btn.disabled = false;
  }
};
