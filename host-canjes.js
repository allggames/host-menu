
// HOST - Canjes con opcionales y premios sin compra adicional.

import { db, money, escapeHTML } from './shared.js';
import { getHostRewardsCredentials } from './loyalty.js';

const $ = selector => document.querySelector(selector);
const h = value => escapeHTML(String(value ?? ''));
const format = value =>
  Number(value || 0).toLocaleString('es-AR');

let rewards = [];
let selectedId = null;
let selectedOptions = [];
let rewardConfigured = false;
let chooseRewardOptions = null;
let subtotal = 0;

// CUENTA DEL CLIENTE

function account() {
  const element = $('#host-loyalty-account');
  return !!element && !element.hidden;
}

function points() {
  if (!account()) return 0;

  return Number(
    (
      $('#host-loyalty-points')?.textContent || '0'
    ).replace(/[^0-9-]/g, '')
  ) || 0;
}

function selectedReward() {
  return rewards.find(
    r => r.id === selectedId && r.active
  ) || null;
}

// USAR EL MISMO SELECTOR DE OPCIONALES DEL MENÚ

export function registerHostCanjeOptionsPicker(picker) {
  chooseRewardOptions = picker;
}

// CONSULTAR CANJE ACTUAL

export function getHostCanje() {
  const reward = selectedReward();

  if (
    !account() ||
    !reward ||
    points() < reward.points_cost
  ) {
    return null;
  }

  return reward;
}

// EVITAR ENVIAR UN CANJE INCOMPLETO

export function validateHostCanjeSelection() {
  if (!selectedId) return null;

  const reward = selectedReward();

  if (!reward) {
    throw Error(
      'La recompensa elegida ya no está disponible.'
    );
  }

  if (!account()) {
    throw Error(
      'Iniciá sesión en HOST PUNTOS para canjear.'
    );
  }

  if (points() < reward.points_cost) {
    throw Error(
      'No tenés puntos suficientes para ese canje.'
    );
  }

  if (
    reward.kind === 'product' &&
    !rewardConfigured
  ) {
    throw Error(
      'Elegí las opciones de tu premio antes de continuar.'
    );
  }

  return reward;
}

// CREDENCIALES DEL CLIENTE

export function getHostCanjeCredentials() {
  return getHostRewardsCredentials();
}

// SUBTOTAL DEL CARRITO

export function setHostCanjeSubtotal(number) {
  subtotal = Math.max(
    0,
    Number(number || 0)
  );

  updatePreview();
}

// DISEÑO

const style = document.createElement('style');

style.textContent = `
  #host-rewards-table {
    margin: 22px auto 8px;
    max-width: 620px;
    color: #fff;
    text-align: left;
  }

  #host-rewards-table h3 {
    color: #ffc329;
    margin: 8px 0;
  }

  #host-rewards-table table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  #host-rewards-table th,
  #host-rewards-table td {
    padding: 9px 5px;
    border-bottom: 1px solid #4a3934;
  }

  #host-rewards-table td:last-child {
    text-align: right;
    color: #ffc329;
    font-weight: 800;
    white-space: nowrap;
  }

  #host-canje-cart {
    margin: 20px 0;
    padding: 15px;
    border: 1px solid #ad5b22;
    border-radius: 12px;
    background: #1c100b;
    color: #fff;
  }

  #host-canje-cart h3 {
    margin: 0 0 8px;
    color: #ffbd29;
  }

  #host-canje-cart .host-canje-choice {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 9px 0;
    border-bottom: 1px solid #4c352d;
    cursor: pointer;
  }

  #host-canje-cart input[type=radio] {
    flex: none;
    width: auto;
    accent-color: #ed171f;
  }

  #host-canje-cart
  .host-canje-choice:has(input:disabled) {
    opacity: .48;
    cursor: not-allowed;
  }

  #host-canje-cart small {
    display: block;
    font-size: 12px;
    color: #c5bcb9;
    margin-top: 4px;
  }

  #host-canje-preview {
    font-weight: 800;
    color: #ffbd29;
    margin-top: 12px;
  }

  #host-canje-message {
    font-size: 12px;
    color: #f8c582;
  }

  #host-reward-options-summary {
    margin-top: 12px;
    padding: 11px;
    background: #342017;
    border-radius: 10px;
    font-size: 13px;
  }

  #host-reward-edit-options {
    margin-top: 8px;
    padding: 8px 10px;
  }
`;

document.head.append(style);

// TABLA DE RECOMPENSAS

const catalog = document.createElement('div');
catalog.id = 'host-rewards-table';

const loyaltyCard = $('.host-loyalty-card');

if (loyaltyCard) {
  loyaltyCard.append(catalog);
}

// SECCIÓN DE CANJES EN EL CARRITO

const cartBox = document.createElement('div');
cartBox.id = 'host-canje-cart';

const checkout = $('#checkout');

if (checkout) {
  const send =
    $('#send') ||
    checkout.querySelector('[type=submit]');

  if (send) {
    send.before(cartBox);
  } else {
    checkout.append(cartBox);
  }
}

// MOSTRAR TABLA DE PREMIOS

function tableRender() {
  if (!catalog.isConnected) return;

  catalog.innerHTML = `
    <h3>🎁 TABLA DE RECOMPENSAS</h3>

    <p style="font-size:13px;color:#bbb">
      Por cada $10.000 de compra confirmada
      ganás 10 puntos.
    </p>

    <table>
      <thead>
        <tr>
          <th>Premio</th>
          <th>Puntos</th>
        </tr>
      </thead>

      <tbody>
        ${rewards.map(r => `
          <tr>
            <td>${h(r.name)}</td>
            <td>${format(r.points_cost)} pts</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <small>
      Un canje por pedido.
      Los premios de productos se pueden solicitar
      sin comprar nada más.
      Los descuentos requieren un producto
      en el carrito.
    </small>
  `;
}

// MOSTRAR OPCIONALES ELEGIDOS

function optionsText() {
  if (!selectedOptions.length) {
    return 'Sin opcionales adicionales';
  }

  return selectedOptions
    .map(option =>
      `${format(option.quantity || 1)} × ` +
      `${h(option.group)}: ${h(option.name)}`
    )
    .join('<br>');
}

// MOSTRAR CANJES EN EL CARRITO

function cartRender() {
  if (!cartBox.isConnected) return;

  const balance = points();
  const isLogged = account();
  const current = selectedReward();

  // Quitar selección si dejó de estar disponible.

  if (
    selectedId &&
    (
      !isLogged ||
      !current ||
      balance < current.points_cost
    )
  ) {
    selectedId = null;
    selectedOptions = [];
    rewardConfigured = false;
  }

  const reward = selectedReward();

  cartBox.innerHTML = `
    <h3>🔥 UTILIZAR MIS PUNTOS</h3>

    <p style="font-size:13px">
      ${
        isLogged
          ? `Tu saldo:
             <strong>${format(balance)} puntos</strong>`
          : `Iniciá sesión en HOST PUNTOS para canjear.
             También podés comprar sin utilizar puntos.`
      }
    </p>

    ${
      !isLogged
        ? `
          <button
            type="button"
            class="secondary"
            id="host-go-points"
          >
            Ingresar / registrarme
          </button>
        `
        : ''
    }

    <label class="host-canje-choice">
      <input
        type="radio"
        name="host_reward"
        value=""
        ${selectedId === null ? 'checked' : ''}
      >

      <span>No usar puntos en este pedido</span>
    </label>

    ${rewards.map(r => `
      <label class="host-canje-choice">

        <input
          type="radio"
          name="host_reward"
          value="${h(r.id)}"
          ${selectedId === r.id ? 'checked' : ''}

          ${
            !isLogged || balance < r.points_cost
              ? 'disabled'
              : ''
          }
        >

        <span>
          ${h(r.name)}

          <small>
            ${format(r.points_cost)} pts ·

            ${
              balance < r.points_cost
                ? `Te faltan ${
                    format(r.points_cost - balance)
                  } puntos`
                : 'Disponible'
            }
          </small>
        </span>

      </label>
    `).join('')}

    ${
      reward?.kind === 'product'
        ? `
          <div id="host-reward-options-summary">

            <strong>🎁 Opciones de tu premio</strong>

            <p>
              ${
                rewardConfigured
                  ? optionsText()
                  : 'Elegí las opciones obligatorias para continuar.'
              }
            </p>

            ${
              reward.product_id
                ? `
                  <button
                    type="button"
                    class="secondary"
                    id="host-reward-edit-options"
                  >
                    ${
                      rewardConfigured
                        ? 'Modificar opciones'
                        : 'Elegir opciones'
                    }
                  </button>
                `
                : `
                  <small>
                    Si corresponde elegir un sabor,
                    detallalo en Observaciones.
                  </small>
                `
            }

          </div>
        `
        : ''
    }

    <div id="host-canje-preview"></div>

    <p id="host-canje-message">
      Los puntos se reservan al registrar el pedido
      y se devuelven si HOST lo cancela.
    </p>
  `;

  // IR A INICIAR SESIÓN

  $('#host-go-points')?.addEventListener(
    'click',
    () => {
      $('#host-tab-login')?.click();

      $('#puntos')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  );

  // ELEGIR UNA RECOMPENSA

  cartBox.querySelectorAll(
    'input[name=host_reward]'
  ).forEach(radio => {
    radio.addEventListener('change', () => {
      const id = radio.value || null;

      selectedId = id;
      selectedOptions = [];
      rewardConfigured = false;

      const chosen = selectedReward();

      cartRender();

      if (chosen?.kind === 'product') {
        openRewardPicker(chosen, false);
      }
    });
  });

  // MODIFICAR LOS OPCIONALES

  $('#host-reward-edit-options')
    ?.addEventListener('click', () => {
      const chosen = selectedReward();

      if (chosen) {
        openRewardPicker(chosen, true);
      }
    });

  updatePreview();
}

// ABRIR SELECTOR DE OPCIONALES

function openRewardPicker(reward, editing) {
  if (
    !reward ||
    reward.id !== selectedId
  ) {
    return;
  }

  // Premios especiales sin producto asociado.

  if (!reward.product_id) {
    rewardConfigured = true;
    cartRender();
    return;
  }

  if (typeof chooseRewardOptions !== 'function') {
    console.error(
      'HOST: la ventana de opcionales ' +
      'no está conectada al menú.'
    );
    return;
  }

  chooseRewardOptions(
    reward.product_id,

    // GUARDAR SELECCIÓN
    options => {
      if (selectedId !== reward.id) return;

      selectedOptions = (options || []).map(
        option => ({ ...option })
      );

      rewardConfigured = true;
      cartRender();
    },

    // CANCELAR SELECCIÓN
    () => {
      if (selectedId !== reward.id) return;

      if (!editing) {
        selectedId = null;
        selectedOptions = [];
        rewardConfigured = false;
      }

      cartRender();
    }
  );
}

// PREVISUALIZAR CANJE

function updatePreview() {
  const target = $('#host-canje-preview');

  if (!target) return;

  const reward = getHostCanje();

  if (!reward) {
    target.textContent =
      `Total sin canje: ${money(subtotal)}`;
    return;
  }

  if (reward.kind === 'product') {
    target.textContent = !rewardConfigured
      ? 'Completá las opciones de tu premio para continuar.'
      : `Premio: ${reward.name} · ` +
        `Costo: ${format(reward.points_cost)} pts · ` +
        `Subtotal sin adicionales del premio: ` +
        money(subtotal);

    return;
  }

  const discount = Math.round(
    subtotal * Number(reward.discount_percent)
  ) / 100;

  target.textContent =
    `Descuento: −${money(discount)} · ` +
    `Total estimado: ${money(subtotal - discount)}`;
}

// CARGAR RECOMPENSAS DESDE SUPABASE

async function load() {
  const { data, error } = await db
    .from('host_rewards_catalog')
    .select(
      'id,code,name,kind,product_id,' +
      'points_cost,discount_percent,active,position'
    )
    .eq('active', true)
    .order('points_cost', { ascending: true })
    .order('position', { ascending: true });

  if (error) {
    if (catalog.isConnected) {
      catalog.textContent =
        'No se pudieron cargar las recompensas: ' +
        error.message;
    }
    return;
  }

  rewards = data || [];

  tableRender();
  cartRender();
}

// RECARGAR CUANDO EL CLIENTE INGRESA

const accountEl = $('#host-loyalty-account');

if (accountEl) {
  new MutationObserver(cartRender).observe(
    accountEl,
    {
      attributes: true,
      attributeFilter: ['hidden']
    }
  );
}

const balanceEl = $('#host-loyalty-points');

if (balanceEl) {
  new MutationObserver(cartRender).observe(
    balanceEl,
    {
      childList: true,
      characterData: true,
      subtree: true
    }
  );
}

load().catch(error => {
  console.error('HOST canjes:', error);
});

// CREAR PEDIDO CON CANJE

export async function registerHostRedeemedOrder({
  reward,
  phone,
  code,
  name,
  delivery,
  address,
  notes,
  payment,
  cashAmount,
  items
}) {
  if (!reward || !phone || !code) {
    throw Error(
      'Iniciá sesión para canjear puntos.'
    );
  }

  if (
    reward.id !== selectedId ||
    (
      !rewardConfigured &&
      reward.kind === 'product'
    )
  ) {
    throw Error(
      'Completá las opciones de tu premio antes de continuar.'
    );
  }

  // SUPABASE VALIDA PRECIOS, OPCIONALES Y SALDO

  const { data, error } = await db.rpc(
    'host_rewards_checkout',
    {
      p_phone: phone,
      p_code: code,
      p_reward_id: reward.id,
      p_customer_name: name,
      p_delivery_type: delivery,
      p_address: address,
      p_notes: notes,
      p_payment: payment,
      p_cash_amount: cashAmount,

      p_items: {
        cart: items,

        reward_options:
          reward.kind === 'product'
            ? selectedOptions
            : []
      }
    }
  );

  if (error) throw error;

  if (data?.error) {
    throw Error(data.error);
  }

  // ACTUALIZAR SALDO VISIBLE

  if (
    data?.points_remaining !== undefined &&
    $('#host-loyalty-points')
  ) {
    $('#host-loyalty-points').textContent =
      String(data.points_remaining);
  }

  selectedId = null;
  selectedOptions = [];
  rewardConfigured = false;

  cartRender();

  return data;
}
