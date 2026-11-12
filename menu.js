
import {
  db,
  money,
  escapeHTML,
  alertError
} from './shared.js';

import {
  configured,
  WHATSAPP_NUMBER
} from './config.js';

import {
  normalizeHostPhone
} from './loyalty.js';

import {
  getHostLoyaltyOrder,
  verifyHostLoyaltyOrder
} from './host-points-prompt.js?v=primer-pedido-1';

import {
  setHostCanjeSubtotal,
  validateHostCanjeSelection,
  getHostCanjeCredentials,
  registerHostRedeemedOrder,
  registerHostCanjeOptionsPicker
} from './host-canjes.js';

import {
  initHostDeliveryLocation,
  getHostDeliveryLocation
} from './host-ubicacion.js';

const $ = selector => document.querySelector(selector);
const h = value => escapeHTML(String(value ?? ''));

let categories = [];
let products = [];
let optionGroups = [];
let optionValues = [];
let productLinks = [];
let active = 'all';

const cart = new Map();

// Descuentos oficiales: solo sobre el precio base del producto.
// Supabase verifica nuevamente estos mismos valores antes de guardar el pedido.
// Un producto puede tener un porcentaje o un importe fijo de descuento.
// El servidor calcula el mismo precio desde los datos oficiales de Supabase.
const hostSaleType = product =>
  product?.discount_type === 'amount' ? 'amount' : 'percent';

const hasHostDiscount = product => {
  if (product?.discount_active !== true) return false;
  const price = Number(product?.price || 0);
  if (!(price > 0)) return false;
  if (hostSaleType(product) === 'amount') {
    const amount = Number(product.discount_amount);
    return Number.isFinite(amount) && amount > 0 && amount < price;
  }
  const percent = Number(product.discount_percent);
  return Number.isInteger(percent) && percent >= 1 && percent <= 90;
};

const hostBasePrice = product => {
  const price = Number(product?.price || 0);
  if (!hasHostDiscount(product)) return price;
  if (hostSaleType(product) === 'amount') {
    return Math.round((price - Number(product.discount_amount)) * 100) / 100;
  }
  return Math.round(price * (100 - Number(product.discount_percent)) / 100);
};

const hostDiscountLabel = product =>
  hostSaleType(product) === 'amount'
    ? `${money(product.discount_amount)} DE DESCUENTO`
    : `${Number(product.discount_percent)}% DE DESCUENTO`;

if (!document.getElementById('host-discounts-style')) {
  const discountStyle = document.createElement('style');
  discountStyle.id = 'host-discounts-style';
  discountStyle.textContent = `
    /* Precio de oferta separado de .price, que el tema HOST usa como etiqueta amarilla.
       Así no se recorta ni desaparece el importe final en tarjetas angostas. */
    .product .host-promo-prices {
      display:flex !important;
      flex-direction:column !important;
      align-items:flex-start !important;
      justify-content:center !important;
      gap:3px !important;
      width:100% !important;
      min-width:0 !important;
      min-height:64px !important;
      height:auto !important;
      max-height:none !important;
      overflow:visible !important;
      box-sizing:border-box !important;
      padding:9px 12px !important;
      margin:8px 0 10px !important;
      background:#17100c !important;
      border:1px solid rgba(255,195,41,.45) !important;
      border-radius:9px !important;
      transform:none !important;
      text-align:left !important;
      line-height:1.2 !important;
    }
    .product .host-promo-prices .host-promo-before {
      display:block !important;
      color:#c5c0bc !important;
      font-size:12px !important;
      font-weight:600 !important;
      line-height:1.3 !important;
    }
    .product .host-promo-prices .host-promo-before del {
      color:#c5c0bc !important;
      text-decoration:line-through !important;
    }
    .product .host-promo-prices .host-promo-final {
      display:block !important;
      position:relative !important;
      color:#ffc329 !important;
      font-size:clamp(19px, 2.5vw, 25px) !important;
      font-weight:900 !important;
      line-height:1.2 !important;
      white-space:normal !important;
      overflow:visible !important;
      opacity:1 !important;
      visibility:visible !important;
      text-decoration:none !important;
      text-shadow:none !important;
    }
    .host-sale-tag {display:inline-block;background:#ed171f;color:white;
      font-size:11px;font-weight:900;letter-spacing:.3px;
      padding:5px 9px;border-radius:7px;margin:5px 0}
  `;
  document.head.append(discountStyle);
}

if (!configured) {
  $('#setup').classList.remove('hidden');
} else {
  load().catch(alertError);
}

// CARGAR PRODUCTOS Y OPCIONALES

async function load() {
  const [c, p, g, v, l] = await Promise.all([
    db.from('categories')
      .select('*')
      .order('position'),

    db.from('products')
      .select('*')
      .eq('available', true)
      .order('position'),

    db.from('option_groups')
      .select('*')
      .order('position'),

    db.from('option_values')
      .select('*')
      .order('position'),

    db.from('product_option_groups')
      .select('*')
      .order('position')
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

function productCard(p, featured = false) {
  return `
    <article class="product ${
      featured ? 'host-featured-card' : ''
    }">

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

      ${hasHostDiscount(p)
        ? `<span class="host-sale-tag">🔥 ${hostDiscountLabel(p)}</span>`
        : ''}

      ${hasHostDiscount(p)
        ? `<div class="host-promo-prices" aria-label="Precio con descuento">
             <span class="host-promo-before">Antes: <del>${money(p.price)}</del></span>
             <strong class="host-promo-final">Ahora: ${money(hostBasePrice(p))}</strong>
           </div>`
        : `<div class="price">${money(p.price)}</div>`}

      <button
        type="button"
        data-add="${h(p.id)}"
      >
        Agregar +
      </button>

    </article>
  `;
}

// PRODUCTOS DESTACADOS

function renderFeatured() {
  const layout = document.querySelector('.store-layout');

  if (!layout) return;

  let section = $('#host-featured');

  if (!section) {
    section = document.createElement('section');

    section.id = 'host-featured';
    section.className = 'store-products';

    layout.before(section);

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

  const featured = products.filter(
    p => p.featured === true
  );

  section.classList.toggle(
    'hidden',
    featured.length === 0
  );

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
      ${featured.map(
        p => productCard(p, true)
      ).join('')}
    </div>
  `;
}

// MENÚ PÚBLICO

function render() {
  const categoryContainer = $('#categories');

  categoryContainer.replaceChildren();

  [
    ['all', 'Todos'],
    ...categories.map(c => [c.id, c.name])
  ].forEach(([id, name]) => {
    const button = document.createElement('button');

    button.type = 'button';
    button.textContent = name;
    button.className =
      active === id ? 'active' : '';

    button.onclick = () => {
      active = id;
      render();
    };

    categoryContainer.append(button);
  });

  // Orden exclusivo de «Todos» (se configura desde el administrador).
  const shownProducts = products.filter(
    p => active === 'all' || p.category_id === active
  );

  if (active === 'all') {
    shownProducts.sort((a, b) => {
      const first = a.all_position == null
        ? Number.MAX_SAFE_INTEGER : Number(a.all_position);
      const second = b.all_position == null
        ? Number.MAX_SAFE_INTEGER : Number(b.all_position);
      return first - second ||
        Number(a.position || 0) - Number(b.position || 0) ||
        a.name.localeCompare(b.name, 'es');
    });
  }

  $('#products').innerHTML = shownProducts
    .map(p => productCard(p))
    .join('') ||
    '<p>No hay productos en esta categoría.</p>';

  renderFeatured();

  // Conectar botones Agregar +.

  document.querySelectorAll('[data-add]')
    .forEach(button => {
      button.onclick = () =>
        chooseOptions(button.dataset.add);
    });

  renderCart();
}

// SELECCIÓN DE OPCIONALES CON CANTIDADES
// También sirve para configurar premios canjeados.

function chooseOptions(
  id,
  onSelected = null,
  onCanceled = null
) {
  const product = products.find(
    p => String(p.id) === String(id)
  );

  if (!product) return;

  const groups = productLinks
    .filter(
      link =>
        String(link.product_id) === String(id)
    )
    .map(link =>
      optionGroups.find(
        g =>
          String(g.id) === String(link.group_id)
      )
    )
    .filter(Boolean);

  // Si no tiene opcionales:
  // agregarlo directamente o confirmar premio.

  if (!groups.length) {
    if (onSelected) {
      onSelected([]);
    } else {
      addConfigured(product, []);
    }

    return;
  }

  // Verificar grupos vacíos.

  const emptyGroup = groups.find(g =>
    Number(g.max_select) > 0 &&
    !optionValues.some(
      v =>
        String(v.group_id) === String(g.id)
    )
  );

  if (emptyGroup) {
    alert(
      `El grupo "${emptyGroup.name}" ` +
      'no tiene opciones cargadas. Contactá a HOST.'
    );
    return;
  }

  const quantities = new Map();
  const overlay = document.createElement('div');

  overlay.className = 'option-overlay';

  overlay.innerHTML = `
    <div
      class="option-dialog"
      role="dialog"
      aria-modal="true"
    >

      <div class="row">

        <h2 class="grow">
          ${h(product.name)}
        </h2>

        <button
          type="button"
          class="secondary"
          data-close-options
        >
          ✕
        </button>

      </div>

      <p class="muted">
        Personalizá tu pedido.
        Completá el cupo de cada grupo.
      </p>

      <form id="choose-form">

        ${groups.map(g => {
          const max = Number(g.max_select);

          const options = optionValues.filter(
            v =>
              String(v.group_id) === String(g.id)
          );

          return `
            <fieldset
              data-option-group="${h(g.id)}"
            >

              <legend>
                <strong>${h(g.name)}</strong>
                <small>
                  Elegí ${max} unidades
                </small>
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

                    <strong
                      data-option-count="${h(v.id)}"
                    >
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

        <button
          type="submit"
          id="confirm-options"
        >
          Agregar al carrito
        </button>

      </form>

    </div>
  `;

  document.body.append(overlay);

  const form =
    overlay.querySelector('#choose-form');

  const confirmButton =
    overlay.querySelector('#confirm-options');

  // CONTAR UNIDADES ELEGIDAS

  function groupTotal(group) {
    return optionValues
      .filter(
        v =>
          String(v.group_id) === String(group.id)
      )
      .reduce(
        (sum, v) =>
          sum + (
            quantities.get(String(v.id)) || 0
          ),
        0
      );
  }

  // ACTUALIZAR CUPOS

  function updateSelections() {
    let complete = true;

    for (const group of groups) {
      const max = Number(group.max_select);
      const total = groupTotal(group);

      const fieldset = [
        ...form.querySelectorAll(
          '[data-option-group]'
        )
      ].find(
        el =>
          el.dataset.optionGroup ===
          String(group.id)
      );

      if (!fieldset) continue;

      const groupValues = optionValues.filter(
        v =>
          String(v.group_id) === String(group.id)
      );

      for (const value of groupValues) {
        const quantity =
          quantities.get(String(value.id)) || 0;

        const count = [
          ...fieldset.querySelectorAll(
            '[data-option-count]'
          )
        ].find(
          el =>
            el.dataset.optionCount ===
            String(value.id)
        );

        const plus = [
          ...fieldset.querySelectorAll(
            '[data-option-plus]'
          )
        ].find(
          el =>
            el.dataset.optionPlus ===
            String(value.id)
        );

        const minus = [
          ...fieldset.querySelectorAll(
            '[data-option-minus]'
          )
        ].find(
          el =>
            el.dataset.optionMinus ===
            String(value.id)
        );

        if (count) {
          count.textContent = quantity;
        }

        if (plus) {
          plus.disabled = total >= max;
        }

        if (minus) {
          minus.disabled = quantity <= 0;
        }
      }

      const status = fieldset.querySelector(
        '.selection-status'
      );

      status.textContent = total === max
        ? `✓ Cupo completo: ${total} de ${max}`
        : `${total} de ${max} unidades · ` +
          `Faltan ${max - total}`;

      if (total !== max) {
        complete = false;
      }
    }

    confirmButton.disabled = !complete;

    return complete;
  }

  // BOTONES + Y - DE OPCIONALES

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
      g =>
        String(g.id) === String(value.group_id)
    );

    if (!group) return;

    const current =
      quantities.get(optionId) || 0;

    if (
      plus &&
      groupTotal(group) <
      Number(group.max_select)
    ) {
      quantities.set(
        optionId,
        current + 1
      );
    }

    if (minus && current > 0) {
      quantities.set(
        optionId,
        current - 1
      );
    }

    updateSelections();
  });

  // CERRAR VENTANA

  const closeOptions = () => {
    overlay.remove();

    if (onCanceled) {
      onCanceled();
    }
  };

  overlay
    .querySelector('[data-close-options]')
    .onclick = closeOptions;

  overlay.onclick = event => {
    if (event.target === overlay) {
      closeOptions();
    }
  };

  // Diferenciar botón para canjes.

  if (onSelected) {
    overlay
      .querySelector('#confirm-options')
      .textContent =
        'GUARDAR OPCIONES DEL PREMIO';
  }

  // GUARDAR OPCIONES

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
        v =>
          String(v.group_id) === String(group.id)
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

    // Producto común: sumar al carrito.
    // Premio: guardar opciones sin cobrar producto.

    if (onSelected) {
      onSelected(selected);
    } else {
      addConfigured(product, selected);
    }

    overlay.remove();
  };

  updateSelections();
}

// CONECTAR EL SELECTOR CON HOST CANJES

registerHostCanjeOptionsPicker(chooseOptions);

// PRECIOS DE OPCIONALES

function optionQuantity(option) {
  return Number(option.quantity || 1);
}

function optionTotal(selected) {
  return selected.reduce(
    (sum, option) =>
      sum +
      Number(option.extra_price) *
      optionQuantity(option),
    0
  );
}

// AGREGAR PRODUCTO AL CARRITO

function addConfigured(product, selected) {
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

    quantity:
      (existing?.quantity || 0) + 1,

    selected
  });

  renderCart();

  // AVISO DE PRODUCTO AGREGADO

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

  $('#cart').innerHTML = entries
    .map(([key, item]) => {
      const p = products.find(
        product => product.id === item.id
      );

      if (!p) return '';

      const unit =
        hostBasePrice(p) +
        optionTotal(item.selected);

      return `
        <div class="item-row">

          <div>
            <strong>${h(p.name)}</strong>
            <br>

            ${item.selected.map(option =>
              `${optionQuantity(option)} × ` +
              `${h(option.group)}: ` +
              `${h(option.name)}`
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
    })
    .join('') ||
    '<p class="muted">Tu carrito está vacío.</p>';

  const total = entries.reduce(
    (sum, [, item]) => {
      const p = products.find(
        product => product.id === item.id
      );

      return sum + item.quantity * (
        hostBasePrice(p) +
        optionTotal(item.selected)
      );
    },
    0
  );

  $('#total').textContent = money(total);

  // Informar subtotal a HOST CANJES.

  setHostCanjeSubtotal(total);

  // RESTAR PRODUCTOS

  document.querySelectorAll('[data-minus]')
    .forEach(button => {
      button.onclick = () => {
        const item = cart.get(
          button.dataset.minus
        );

        if (!item) return;

        item.quantity--;

        if (item.quantity <= 0) {
          cart.delete(
            button.dataset.minus
          );
        }

        renderCart();
      };
    });

  // SUMAR PRODUCTOS

  document.querySelectorAll('[data-plus]')
    .forEach(button => {
      button.onclick = () => {
        const item = cart.get(
          button.dataset.plus
        );

        if (!item) return;

        item.quantity++;

        renderCart();
      };
    });
}

// FORMA DE PAGO

$('#payment').onchange = () => {
  const cash =
    $('#payment').value === 'Efectivo';

  $('#cash-wrap').classList.toggle(
    'hidden',
    !cash
  );

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

// Campo opcional de ubicación exacta, solo para delivery.
initHostDeliveryLocation();

// FINALIZAR PEDIDO POR WHATSAPP Y CANJES HOST

$('#checkout').onsubmit = async event => {
  event.preventDefault();

  if (!configured) {
    return alert(
      'Falta configurar Supabase.'
    );
  }

  // Los premios físicos pueden pedirse
  // aunque el carrito normal esté vacío.

  if (!/^\d{10,15}$/.test(WHATSAPP_NUMBER)) {
    return alert(
      'El WhatsApp de HOST no está configurado.'
    );
  }

  const button = $('#send');
  const status = $('#checkout-status');

  button.disabled = true;
  button.textContent = 'PREPARANDO PEDIDO...';

  status.textContent = '';

  let popup = null;

  try {
    const form = new FormData(event.target);

    const name = String(
      form.get('name') || ''
    ).trim();

    const delivery = String(
      form.get('delivery') || ''
    );

    const address = String(
      form.get('address') || ''
    ).trim();

    const notes = String(
      form.get('notes') || ''
    ).trim();

    // La ubicación se obtiene solo si el cliente decidió compartirla.
    const mapLink = delivery === 'Delivery'
      ? getHostDeliveryLocation()
      : null;

    // El administrador también podrá verla en las observaciones.
    const storedNotes = [
      notes,
      ...(mapLink ? [`Ubicación Google Maps: ${mapLink}`] : [])
    ].filter(Boolean).join('\n');

    if (storedNotes.length > 300) {
      throw Error(
        'Acortá las observaciones para poder incluir la ubicación en el pedido.'
      );
    }

    const payment = String(
      form.get('payment') || ''
    );

    const cashRaw = String(
      form.get('cash_amount') ?? ''
    ).trim();

    const cashAmount =
      payment === 'Efectivo' &&
      cashRaw !== ''
        ? Number(cashRaw)
        : null;

    // VALIDAR DATOS

    if (!name) {
      throw Error('Ingresá tu nombre.');
    }

    if (
      delivery === 'Delivery' &&
      !address
    ) {
      throw Error(
        'Ingresá la dirección de entrega.'
      );
    }

    if (![
      'Delivery',
      'Retiro en local'
    ].includes(delivery)) {
      throw Error(
        'Elegí una entrega válida.'
      );
    }

    if (![
      'Efectivo',
      'Transferencia / Mercado Pago'
    ].includes(payment)) {
      throw Error(
        'Seleccioná una forma de pago.'
      );
    }

    if (
      cashAmount !== null &&
      (
        !Number.isFinite(cashAmount) ||
        cashAmount < 0
      )
    ) {
      throw Error(
        'El importe de efectivo es inválido.'
      );
    }

    // VALIDAR PREMIO ELEGIDO

    const reward =
      validateHostCanjeSelection();

    if (
      !cart.size &&
      (
        !reward ||
        reward.kind !== 'product'
      )
    ) {
      throw Error(
        'Agregá un producto al carrito ' +
        'o elegí un premio para canjear.'
      );
    }

    // IDENTIFICACIÓN DEL CLIENTE

    const credential =
      getHostCanjeCredentials();

    const loyalty =
      getHostLoyaltyOrder();

    let customerPhone = reward
      ? credential?.phone
      : loyalty.wantsPoints
        ? loyalty.phone
        : null;

    if (
      loyalty.wantsPoints &&
      !customerPhone &&
      !reward
    ) {
      throw Error(
        'Iniciá sesión en HOST PUNTOS ' +
        'o continuá sin puntos.'
      );
    }

    if (
      reward &&
      (
        !credential?.phone ||
        !credential?.code
      )
    ) {
      throw Error(
        'Iniciá sesión en HOST PUNTOS ' +
        'para usar tus puntos.'
      );
    }

    // PRODUCTOS DEL CARRITO

    const items = [
      ...cart.values()
    ].map(item => {
      const product = products.find(
        p => p.id === item.id
      );

      if (!product) {
        throw Error(
          'Un producto del carrito dejó ' +
          'de estar disponible.'
        );
      }

      return {
        product_id: item.id,

        name: product.name,

        price:
          hostBasePrice(product) +
          optionTotal(item.selected),

        quantity: item.quantity,

        options: item.selected
      };
    });

    let subtotal = items.reduce(
      (sum, item) =>
        sum +
        Number(item.price) *
        Number(item.quantity),
      0
    );

    let total = subtotal;
    let discount = 0;

    let selectedRewardName = '';
    let orderItems = items;
    let orderId = null;

    // Abrir ventana de WhatsApp antes de
    // esperar la respuesta de Supabase.

    popup = window.open(
      'about:blank',
      '_blank'
    );

    button.textContent =
      'REGISTRANDO PEDIDO...';

    status.textContent =
      'Guardando tu pedido...';

    // Confirmar la cuenta ANTES de crear un pedido normal con puntos.
    // Abrimos WhatsApp primero para no perder la interacción del usuario
    // (algunas versiones del navegador bloquean ventanas tras un await).
    if (!reward) {
      const confirmedLoyalty = await verifyHostLoyaltyOrder();
      customerPhone = confirmedLoyalty.wantsPoints
        ? confirmedLoyalty.phone
        : null;
    }

    // PEDIDO CON CANJE

    if (reward) {
      const result =
        await registerHostRedeemedOrder({
          reward,
          phone: credential.phone,
          code: credential.code,
          name,
          delivery,
          address,
          notes: storedNotes,
          payment,
          cashAmount,
          items
        });

      orderId = result.order_id;

      subtotal = Number(
        result.subtotal
      );

      total = Number(
        result.total
      );

      discount = Number(
        result.discount || 0
      );

      selectedRewardName =
        result.reward_name;

      orderItems =
        result.items;

    } else {

      // PEDIDO NORMAL: SUPABASE FIJA PRECIOS, OPCIONALES Y TOTAL.
      // No se guardan precios enviados por el navegador.
      // Si el precio del menú cambió, se rechaza ANTES de crear el pedido.
      const { data: result, error } = await db.rpc(
        'host_create_normal_order',
        {
          p_customer_name: name,
          p_customer_phone: customerPhone,
          p_delivery_type: delivery,
          p_address: address,
          p_notes: storedNotes,
          p_payment: payment,
          p_cash_amount: cashAmount,
          p_items: items,
          p_expected_total: total
        }
      );

      if (error) throw error;
      if (!result || result.error || !result.order_id || !Array.isArray(result.items)) {
        throw Error(result?.error || 'No se pudo registrar el pedido.');
      }

      orderId = result.order_id;
      subtotal = Number(result.subtotal);
      total = Number(result.total);
      orderItems = result.items;
    }

    // PREPARAR PRODUCTOS PARA WHATSAPP

    const orderLines = orderItems.flatMap(
      item => {
        const lines = [
          `• ${item.quantity} × ${item.name}` +
          (
            item.is_reward
              ? (
                  Number(item.price) > 0
                    ? ` — CANJE (+ adicionales ` +
                      `${money(item.price)})`
                    : ' — GRATIS (CANJE)'
                )
              : ` — ${money(
                  item.quantity * item.price
                )}`
          )
        ];

        const grouped = new Map();

        for (const option of item.options || []) {
          if (!grouped.has(option.group)) {
            grouped.set(
              option.group,
              []
            );
          }

          grouped
            .get(option.group)
            .push(option);
        }

        for (const [group, options] of grouped) {
          lines.push(
            `  *${group}:*`
          );

          for (const option of options) {
            const quantity =
              optionQuantity(option);

            lines.push(
              `  - ${quantity} × ${option.name}`
            );
          }
        }

        lines.push('');

        return lines;
      }
    );

    // MENSAJE FINAL PARA WHATSAPP

    const message = [
      '🍗 *PEDIDO HOST*',

      `Código: ${
        String(orderId)
          .slice(0, 8)
          .toUpperCase()
      }`,

      `Cliente: ${name}`,

      ...(
        customerPhone
          ? [`Celular: ${customerPhone}`]
          : []
      ),

      `Entrega: ${delivery}`,

      `Pago: ${payment}`,

      ...(
        address
          ? [`Dirección: ${address}`]
          : []
      ),

      ...(mapLink ? [`📍 Ubicación exacta (Google Maps): ${mapLink}`] : []),

      '',
      '*DETALLE DEL PEDIDO*',
      '',

      ...orderLines,

      ...(
        selectedRewardName
          ? [
              `🎁 *CANJE: ${selectedRewardName}*`,

              `Subtotal: ${money(subtotal)}`,

              ...(
                discount
                  ? [
                      `Descuento por puntos: ` +
                      `-${money(discount)}`
                    ]
                  : []
              )
            ]
          : []
      ),

      `*TOTAL FINAL: ${money(total)}*`,

      ...(
        cashAmount !== null
          ? [
              `Abona con: ${money(cashAmount)}`,

              `Vuelto: ${
                money(cashAmount - total)
              }`
            ]
          : []
      ),

      ...(
        notes
          ? [`Observaciones: ${notes}`]
          : []
      )

    ].join('\n');

    const whatsappUrl =
      `https://wa.me/${WHATSAPP_NUMBER}` +
      `?text=${encodeURIComponent(message)}`;

    // CONFIRMAR PEDIDO REGISTRADO

    status.replaceChildren();

    const text =
      document.createElement('span');

    text.textContent =
      'Pedido registrado. Confirmalo ' +
      'enviando el WhatsApp. ';

    const link =
      document.createElement('a');

    link.href = whatsappUrl;

    link.target = '_blank';

    link.rel =
      'noopener noreferrer';

    link.textContent =
      'Abrir WhatsApp';

    status.append(text, link);

    // LIMPIAR CARRITO DESPUÉS DE GUARDAR

    cart.clear();
    renderCart();

    // ABRIR WHATSAPP

    if (
      popup &&
      !popup.closed
    ) {
      popup.location.href =
        whatsappUrl;
    } else {
      window.location.href =
        whatsappUrl;
    }

  } catch (error) {

    if (
      popup &&
      !popup.closed
    ) {
      popup.close();
    }

    console.error(
      'Checkout HOST:',
      error
    );

    status.textContent =
      error?.message ||
      'Error al enviar el pedido.';

    alert(status.textContent);

  } finally {

    button.disabled = false;

    button.textContent =
      'CONTINUAR PEDIDO ›';

  }
};
