
import { db, money, escapeHTML, uid, alertError } from './shared.js';
import { configured, WHATSAPP_NUMBER } from './config.js';
import { normalizeHostPhone } from './loyalty.js';


const $ = selector => document.querySelector(selector);
const h = value => escapeHTML(String(value ?? ''));

let categories = [];
let products = [];
let optionGroups = [];
let optionValues = [];
let productLinks = [];
let active = 'all';

const cart = new Map();

if (!configured) {
  $('#setup').classList.remove('hidden');
} else {
  load().catch(alertError);
}

// CARGAR PRODUCTOS Y OPCIONALES

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

// TARJETAS DE PRODUCTOS

// La misma tarjeta se utiliza en el menú normal
// y en la sección de productos destacados.

function productCard(p, featured = false) {
  return `
    <article class="product ${featured ? 'host-featured-card' : ''}">
      ${
        p.image_url
          ? `<img
              src="${h(p.image_url)}"
              alt="${h(p.name)}"
              loading="lazy"
            >`
          : '<div class="placeholder">🍗</div>'
      }

      ${
        featured
          ? '<span class="host-featured-label">⭐ DESTACADO</span>'
          : ''
      }

      <h3>${h(p.name)}</h3>

      <p class="muted">
        ${h(p.description)}
      </p>

      <div class="price">
        ${money(p.price)}
      </div>

      <button type="button" data-add="${h(p.id)}">
        Agregar +
      </button>
    </article>
  `;
}

// NUEVA SECCIÓN DE DESTACADOS

function renderFeatured() {
  const layout = document.querySelector('.store-layout');

  if (!layout) return;

  let section = $('#host-featured');

  if (!section) {
    section = document.createElement('section');

    section.id = 'host-featured';
    section.className = 'store-products';

    // La sección queda debajo del banner
    // y antes del menú normal.

    layout.before(section);

    // Estilos propios sin modificar style.css.

    const style = document.createElement('style');

    style.textContent = `
      #host-featured {
        margin: 34px 0 42px;
      }

      #host-featured .host-featured-card {
        border: 1px solid rgba(255,195,41,.6);
        box-shadow: 0 4px 24px rgba(237,23,31,.12);
      }

      #host-featured .host-featured-label {
        display: inline-block;
        align-self: flex-start;
        margin: 3px 5px 0;
        padding: 5px 10px;
        border-radius: 7px;
        background: #ffc329;
        color: #171717;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: .6px;
      }

      #host-featured .section-heading h2 span {
        color: #ed171f;
      }

      #host-featured .grid {
        margin-top: 16px;
      }
    `;

    document.head.append(style);
  }

  // Mostrar solamente productos disponibles
  // que estén marcados como destacados.

  const featured = products.filter(p => p.featured === true);

  section.classList.toggle('hidden', featured.length === 0);

  if (!featured.length) {
    section.innerHTML = '';
    return;
  }

  section.innerHTML = `
    <div class="section-heading">
      <div>
        <span class="section-kicker">
          🔥 LOS FAVORITOS DE HOST
        </span>

        <h2>
          PRODUCTOS <span>DESTACADOS</span>
        </h2>
      </div>
    </div>

    <div class="grid">
      ${featured.map(p => productCard(p, true)).join('')}
    </div>
  `;
}

// MENÚ PÚBLICO

function render() {
  const categoryContainer = $('#categories');

  categoryContainer.replaceChildren();

  [['all', 'Todos'], ...categories.map(c => [c.id, c.name])]
    .forEach(([id, name]) => {
      const button = document.createElement('button');

      button.type = 'button';
      button.textContent = name;
      button.className = active === id ? 'active' : '';

      button.onclick = () => {
        active = id;
        render();
      };

      categoryContainer.append(button);
    });

  $('#products').innerHTML = products
    .filter(p => active === 'all' || p.category_id === active)
    .map(p => productCard(p))
    .join('') || '<p>No hay productos en esta categoría.</p>';

  // Mostrar destacados.

  renderFeatured();

  // IMPORTANTE:
  // Conectar los botones Agregar +
  // tanto del menú como de los destacados.

  document.querySelectorAll('[data-add]').forEach(button => {
    button.onclick = () => chooseOptions(button.dataset.add);
  });

  renderCart();
}

// SELECCIÓN DE OPCIONALES CON CANTIDADES

function chooseOptions(id) {
  const product = products.find(
    p => String(p.id) === String(id)
  );

  if (!product) return;

  const groups = productLinks
    .filter(link => String(link.product_id) === String(id))
    .map(link =>
      optionGroups.find(
        g => String(g.id) === String(link.group_id)
      )
    )
    .filter(Boolean);

  // Si no tiene opcionales, agregar directamente.

  if (!groups.length) {
    addConfigured(product, []);
    return;
  }

  // Detectar grupos que no tengan opciones cargadas.

  const emptyGroup = groups.find(g =>
    Number(g.max_select) > 0 &&
    !optionValues.some(
      v => String(v.group_id) === String(g.id)
    )
  );

  if (emptyGroup) {
    alert(
      `El grupo "${emptyGroup.name}" no tiene opciones cargadas. Contactá a HOST.`
    );
    return;
  }

  const quantities = new Map();

  const overlay = document.createElement('div');

  overlay.className = 'option-overlay';

  overlay.innerHTML = `
    <div class="option-dialog" role="dialog" aria-modal="true">

      <div class="row">
        <h2 class="grow">${h(product.name)}</h2>

        <button
          type="button"
          class="secondary"
          data-close-options
        >
          ✕
        </button>
      </div>

      <p class="muted">
        Personalizá tu pedido. Completá el cupo de cada grupo.
      </p>

      <form id="choose-form">

        ${groups.map(g => {
          const max = Number(g.max_select);

          const options = optionValues.filter(
            v => String(v.group_id) === String(g.id)
          );

          return `
            <fieldset data-option-group="${h(g.id)}">

              <legend>
                <strong>${h(g.name)}</strong>
                <small>Elegí ${max} unidades</small>
              </legend>

              ${options.map(v => `
                <div class="host-quantity-choice">

                  <div class="host-choice-name">
                    <strong>${h(v.name)}</strong>

                    <small>
                      ${
                        Number(v.extra_price)
                          ? `(+${money(v.extra_price)} c/u)`
                          : '(sin cargo)'
                      }
                    </small>
                  </div>

                  <div class="host-quantity-controls">

                    <button
                      type="button"
                      class="secondary"
                      data-option-minus="${h(v.id)}"
                    >
                      −
                    </button>

                    <strong data-option-count="${h(v.id)}">
                      0
                    </strong>

                    <button
                      type="button"
                      class="secondary"
                      data-option-plus="${h(v.id)}"
                    >
                      +
                    </button>

                  </div>
                </div>
              `).join('')}

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

  // Contar unidades seleccionadas por grupo.

  function groupTotal(group) {
    return optionValues
      .filter(
        v => String(v.group_id) === String(group.id)
      )
      .reduce(
        (sum, v) =>
          sum + (quantities.get(String(v.id)) || 0),
        0
      );
  }

  // Actualizar botones y validar cupos.

  function updateSelections() {
    let complete = true;

    for (const group of groups) {
      const max = Number(group.max_select);
      const total = groupTotal(group);

      const fieldset = [
        ...form.querySelectorAll('[data-option-group]')
      ].find(
        el => el.dataset.optionGroup === String(group.id)
      );

      if (!fieldset) continue;

      const groupValues = optionValues.filter(
        v => String(v.group_id) === String(group.id)
      );

      for (const value of groupValues) {
        const quantity =
          quantities.get(String(value.id)) || 0;

        const count = [
          ...fieldset.querySelectorAll('[data-option-count]')
        ].find(
          el => el.dataset.optionCount === String(value.id)
        );

        const plus = [
          ...fieldset.querySelectorAll('[data-option-plus]')
        ].find(
          el => el.dataset.optionPlus === String(value.id)
        );

        const minus = [
          ...fieldset.querySelectorAll('[data-option-minus]')
        ].find(
          el => el.dataset.optionMinus === String(value.id)
        );

        if (count) count.textContent = quantity;

        if (plus) plus.disabled = total >= max;

        if (minus) minus.disabled = quantity <= 0;
      }

      const status = fieldset.querySelector(
        '.selection-status'
      );

      status.textContent = total === max
        ? `✓ Cupo completo: ${total} de ${max}`
        : `${total} de ${max} unidades · Faltan ${max - total}`;

      if (total !== max) {
        complete = false;
      }
    }

    confirmButton.disabled = !complete;

    return complete;
  }

  // Botones + y - de los opcionales.

  form.addEventListener('click', event => {
    const plus = event.target.closest(
      '[data-option-plus]'
    );

    const minus = event.target.closest(
      '[data-option-minus]'
    );

    if (!plus && !minus) return;

    const optionId = String(
      plus
        ? plus.dataset.optionPlus
        : minus.dataset.optionMinus
    );

    const value = optionValues.find(
      v => String(v.id) === optionId
    );

    if (!value) return;

    const group = groups.find(
      g => String(g.id) === String(value.group_id)
    );

    if (!group) return;

    const current = quantities.get(optionId) || 0;

    if (
      plus &&
      groupTotal(group) < Number(group.max_select)
    ) {
      quantities.set(optionId, current + 1);
    }

    if (minus && current > 0) {
      quantities.set(optionId, current - 1);
    }

    updateSelections();
  });

  // Cerrar ventana.

  overlay.querySelector('[data-close-options]').onclick =
    () => overlay.remove();

  overlay.onclick = event => {
    if (event.target === overlay) {
      overlay.remove();
    }
  };

  // Confirmar configuración del producto.

  form.onsubmit = event => {
    event.preventDefault();

    if (!updateSelections()) {
      alert(
        'Completá el cupo de cada grupo de opcionales.'
      );
      return;
    }

    const selected = [];

    for (const group of groups) {
      const groupValues = optionValues.filter(
        v => String(v.group_id) === String(group.id)
      );

      for (const value of groupValues) {
        const quantity =
          quantities.get(String(value.id)) || 0;

        if (!quantity) continue;

        selected.push({
          id: value.id,
          group: group.name,
          name: value.name,
          quantity,
          extra_price: Number(value.extra_price)
        });
      }
    }

    addConfigured(product, selected);
    overlay.remove();
  };

  updateSelections();
}

// PRECIOS DE OPCIONALES

function optionQuantity(option) {
  return Number(option.quantity || 1);
}

function optionTotal(selected) {
  return selected.reduce(
    (sum, option) =>
      sum +
      Number(option.extra_price) * optionQuantity(option),
    0
  );
}

// AGREGAR PRODUCTO AL CARRITO

function addConfigured(product, selected) {
  // Diferenciar combinaciones distintas.

  const key = product.id + '|' + selected
    .map(
      option =>
        `${option.id}:${optionQuantity(option)}`
    )
    .sort()
    .join(',');

  const existing = cart.get(key);

  cart.set(key, {
    id: product.id,
    quantity: (existing?.quantity || 0) + 1,
    selected
  });

  renderCart();

  // Mostrar confirmación al agregar.

  let notice = $('#host-cart-notice');

  if (!notice) {
    notice = document.createElement('div');

    notice.id = 'host-cart-notice';

    Object.assign(notice.style, {
      position: 'fixed',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: '#ffc329',
      color: '#111',
      padding: '12px 20px',
      borderRadius: '12px',
      fontWeight: '900',
      zIndex: '300',
      boxShadow: '0 8px 22px #0008',
      maxWidth: '90vw',
      textAlign: 'center'
    });

    document.body.append(notice);
  }

  notice.textContent =
    `✓ ${product.name} agregado al carrito`;

  notice.style.display = 'block';

  clearTimeout(notice._timer);

  notice._timer = setTimeout(() => {
    notice.style.display = 'none';
  }, 2400);
}

// MOSTRAR CARRITO

function renderCart() {
  const entries = [...cart];

  $('#cart').innerHTML = entries.map(([key, item]) => {
    const p = products.find(
      product => product.id === item.id
    );

    if (!p) return '';

    const unit =
      Number(p.price) + optionTotal(item.selected);

    return `
      <div class="item-row">

        <div>
          <strong>${h(p.name)}</strong>
          <br>

          ${item.selected.map(option =>
            `${optionQuantity(option)} × ${h(option.group)}: ${h(option.name)}`
          ).join('<br>')}

          ${item.selected.length ? '<br>' : ''}

          ${item.quantity} × ${money(unit)}
          = ${money(item.quantity * unit)}
        </div>

        <div class="actions">
          <button
            type="button"
            class="secondary"
            data-minus="${h(key)}"
          >
            −
          </button>

          <button
            type="button"
            data-plus="${h(key)}"
          >
            +
          </button>
        </div>

      </div>
    `;
  }).join('') ||
    '<p class="muted">Tu carrito está vacío.</p>';

  const total = entries.reduce((sum, [, item]) => {
    const p = products.find(
      product => product.id === item.id
    );

    return sum + item.quantity * (
      Number(p?.price || 0) +
      optionTotal(item.selected)
    );
  }, 0);

  $('#total').textContent = money(total);

  // Quitar unidades.

  document.querySelectorAll('[data-minus]').forEach(
    button => {
      button.onclick = () => {
        const item = cart.get(button.dataset.minus);

        if (!item) return;

        item.quantity--;

        if (item.quantity <= 0) {
          cart.delete(button.dataset.minus);
        }

        renderCart();
      };
    }
  );

  // Agregar más unidades de la misma combinación.

  document.querySelectorAll('[data-plus]').forEach(
    button => {
      button.onclick = () => {
        const item = cart.get(button.dataset.plus);

        if (!item) return;

        item.quantity++;

        renderCart();
      };
    }
  );
}

// FORMA DE PAGO

$('#payment').onchange = () => {
  const cash = $('#payment').value === 'Efectivo';

  $('#cash-wrap').classList.toggle('hidden', !cash);

  if (!cash) {
    $('#cash_amount').value = '';
  }
};

// ENTREGA

$('#delivery').onchange = () => {
  const delivery =
    $('#delivery').value === 'Delivery';

  $('#address-wrap').classList.toggle(
    'hidden',
    !delivery
  );

  $('#address').required = delivery;
};

// FINALIZAR PEDIDO POR WHATSAPP

$('#checkout').onsubmit = async event => {
  event.preventDefault();

  if (!configured) {
    return alert('Falta configurar Supabase');
  }

  if (!cart.size) {
    return alert('Agregá al menos un producto');
  }

  if (!/^\d{10,15}$/.test(WHATSAPP_NUMBER)) {
    return alert(
      'HOST todavía no configuró su número de WhatsApp'
    );
  }

  const button = $('#send');

  button.disabled = true;

  const form = new FormData(event.target);

  const items = [...cart].map(([, item]) => {
    const product = products.find(
      p => p.id === item.id
    );

    return {
      product_id: item.id,
      name: product.name,
      price:
        Number(product.price) +
        optionTotal(item.selected),
      quantity: item.quantity,
      options: item.selected
    };
  });

  const total = items.reduce(
    (sum, item) =>
      sum + item.price * item.quantity,
    0
  );

  const orderId = uid();

  const name = String(
    form.get('name') || ''
  ).trim();

  const customerPhone = normalizeHostPhone(
  form.get('customer_phone')
);

if (!customerPhone) {
  button.disabled = false;
  return alert(
    'Ingresá un celular válido para registrar tus puntos. ' +
    'Ejemplo: 3764123456'
  );
}

  const delivery = String(
    form.get('delivery') || ''
  );

  const address = String(
    form.get('address') || ''
  ).trim();

  const notes = String(
    form.get('notes') || ''
  ).trim();

  const payment = String(
    form.get('payment') || ''
  );

  const cashAmount =
    payment === 'Efectivo' &&
    form.get('cash_amount') !== ''
      ? Number(form.get('cash_amount'))
      : null;

  // Validaciones de pago.

  if (![
    'Efectivo',
    'Transferencia / Mercado Pago'
  ].includes(payment)) {
    button.disabled = false;
    return alert('Seleccioná una forma de pago');
  }

  if (
    cashAmount !== null &&
    (
      !Number.isFinite(cashAmount) ||
      cashAmount < total
    )
  ) {
    button.disabled = false;

    return alert(
      'El efectivo indicado debe alcanzar el total del pedido'
    );
  }

  const paymentNotes =
    `Forma de pago: ${payment}` +
    (
      cashAmount !== null
        ? ` | Abona con: ${money(cashAmount)} | Vuelto: ${money(cashAmount - total)}`
        : ''
    );

  const storedNotes = [
    paymentNotes,
    notes
  ].filter(Boolean).join('\n');

  // Detalle con cantidades de opcionales.

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
          (
            Number(option.extra_price)
              ? ` (+${money(Number(option.extra_price) * optionQuantity(option))})`
              : ''
          )
        );
      }
    }

    lines.push('');

    return lines;
  });

  // Mensaje final.

  const message = [
    '🍗 *PEDIDO HOST*',

    `Código: ${orderId.slice(0, 8).toUpperCase()}`,
    `Cliente: ${name}`,
    `Celular: ${customerPhone}`,
    `Entrega: ${delivery}`,
    `Pago: ${payment}`,

    ...(
      cashAmount !== null
        ? [
            `Abona con: ${money(cashAmount)}`,
            `Vuelto: ${money(cashAmount - total)}`
          ]
        : []
    ),

    ...(
      address
        ? [`Dirección: ${address}`]
        : []
    ),

    '',
    '*DETALLE DEL PEDIDO*',
    '',

    ...orderLines,

    `*TOTAL: ${money(total)}*`,

    ...(
      notes
        ? [`Observaciones: ${notes}`]
        : []
    )

  ].join('\n');

  const whatsappUrl =
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

  const popup = window.open(
    'about:blank',
    '_blank'
  );

  try {
    const { error } = await db
      .from('orders')
      .insert({
        id: orderId,
        customer_name: name,
        customer_phone: customerPhone,
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

    if (popup) {
      popup.location.href = whatsappUrl;
    } else {
      window.location.href = whatsappUrl;
    }

  } catch (error) {
    if (popup) popup.close();

    alertError(error);

  } finally {
    button.disabled = false;
  }
};
