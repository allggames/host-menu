
import { normalizeHostPhone } from './loyalty.js';

let rewardChoice = null;
let pendingProductId = null;
let lastAuthPhone = null;

const byId = id => document.getElementById(id);

const active = id => {
  const el = byId(id);

  return !!el &&
    !el.hidden &&
    !el.classList.contains('hidden');
};

const signedIn = () => active('host-loyalty-account');

const registrationPending = () =>
  active('host-loyalty-pending');

// Obtener el celular de la cuenta que ingresó
// o que acaba de registrarse.

function registeredPhone() {
  if (!signedIn() && !registrationPending()) {
    return null;
  }

  const input = signedIn()
    ? document.querySelector(
        '#host-login-form [name="phone"]'
      )
    : document.querySelector(
        '#host-register-form [name="phone"]'
      );

  return normalizeHostPhone(
    lastAuthPhone || input?.value
  );
}

// Esta función se utiliza al enviar el pedido.

export function getHostLoyaltyOrder() {
  return {
    wantsPoints: rewardChoice === 'points',
    phone: rewardChoice === 'points'
      ? registeredPhone()
      : null
  };
}

// Actualizar el checkout según la elección.

function syncCheckout() {
  const wrap = document.querySelector(
    '.host-loyalty-phone'
  );

  const input = document.querySelector(
    '#checkout [name="customer_phone"]'
  );

  const status = byId('host-points-order-note');

  const { wantsPoints, phone } =
    getHostLoyaltyOrder();

  if (wrap) {
    wrap.hidden = !wantsPoints;
  }

  if (input) {
    input.required = wantsPoints;
    input.readOnly = wantsPoints;
    input.value = wantsPoints ? (phone || '') : '';
  }

  if (status) {
    status.textContent = wantsPoints
      ? '🔥 HOST PUNTOS activado para este pedido.'
      : rewardChoice === 'guest'
        ? 'Pedido sin puntos. Podés seguir comprando normalmente.'
        : 'Podés sumar puntos al iniciar sesión o registrarte.';
  }
}

// Continuar agregando el producto elegido.

function resumeProduct() {
  const id = pendingProductId;
  pendingProductId = null;

  if (!id) return;

  const button = [
    ...document.querySelectorAll('button[data-add]')
  ].find(b => b.dataset.add === id);

  if (button) {
    button.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    button.click();
  }
}

// OPCIÓN: CONTINUAR SIN PUNTOS

function chooseGuest() {
  rewardChoice = 'guest';

  syncCheckout();

  byId('host-points-invite')?.remove();

  const returnButton = byId('host-rewards-resume');

  if (returnButton) {
    returnButton.hidden = true;
  }

  resumeProduct();
}

// OPCIONES: INICIAR SESIÓN O REGISTRARSE

function showLoginOrRegister(kind) {
  byId('host-points-invite')?.remove();

  rewardChoice = 'waiting';

  syncCheckout();

  const section = byId('puntos');

  if (!section) {
    alert(
      'No se encontró HOST PUNTOS. ' +
      'Podés continuar sin puntos.'
    );

    chooseGuest();
    return;
  }

  const tab = kind === 'register'
    ? 'host-tab-register'
    : 'host-tab-login';

  byId(tab)?.click();

  section.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });

  let button = byId('host-rewards-resume');

  if (!button) {
    button = document.createElement('button');

    button.type = 'button';
    button.id = 'host-rewards-resume';
    button.className = 'secondary';

    button.style.cssText = `
      margin: 10px auto;
      padding: 10px 16px;
      display: block;
    `;

    section.querySelector('.host-loyalty-card')
      ?.append(button);
  }

  button.hidden = false;
  button.textContent = 'Continuar mi compra';

  button.onclick = () => {
    if (signedIn() || registrationPending()) {
      rewardChoice = 'points';
      syncCheckout();
      resumeProduct();
    } else {
      chooseGuest();
    }
  };
}

// MOSTRAR LA INVITACIÓN

function showInvite() {
  if (byId('host-points-invite')) return;

  const overlay = document.createElement('div');

  overlay.id = 'host-points-invite';

  overlay.innerHTML = `
    <div
      class="host-invite-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="host-invite-title"
    >

      <span class="host-invite-kicker">
        🔥 HOST PUNTOS
      </span>

      <h2 id="host-invite-title">
        ¿QUERÉS SUMAR PUNTOS?
      </h2>

      <p>
        Por cada $10.000 en compras confirmadas,
        sumás 10 puntos.
      </p>

      <button type="button" data-reward="login">
        Ya tengo cuenta · Iniciar sesión
      </button>

      <button type="button" data-reward="register">
        Quiero registrarme
      </button>

      <button
        type="button"
        class="host-invite-skip"
        data-reward="skip"
      >
        No, gracias · Continuar sin puntos
      </button>

      <small>
        Registrarte es opcional.
        Tu pedido se envía por WhatsApp en ambos casos.
      </small>

    </div>
  `;

  document.body.append(overlay);

  overlay.querySelector('[data-reward="login"]')
    .onclick = () => showLoginOrRegister('login');

  overlay.querySelector('[data-reward="register"]')
    .onclick = () => showLoginOrRegister('register');

  overlay.querySelector('[data-reward="skip"]')
    .onclick = chooseGuest;

  overlay.onclick = event => {
    if (event.target === overlay) {
      chooseGuest();
    }
  };

  document.addEventListener('keydown', function escape(event) {
    if (!overlay.isConnected) {
      document.removeEventListener('keydown', escape);
      return;
    }

    if (event.key === 'Escape') {
      chooseGuest();
      document.removeEventListener('keydown', escape);
    }
  });

  overlay.querySelector('[data-reward="login"]').focus();
}

// Capturar el celular del registro o inicio de sesión.

document.addEventListener('submit', event => {
  if (
    event.target.id === 'host-login-form' ||
    event.target.id === 'host-register-form'
  ) {
    const input = event.target.querySelector(
      '[name="phone"]'
    );

    lastAuthPhone = normalizeHostPhone(
      input?.value
    );
  }
}, true);

// INTERCEPTAR EL PRIMER AGREGAR +

document.addEventListener('click', event => {
  const button = event.target.closest(
    'button[data-add]'
  );

  if (!button || rewardChoice !== null) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  pendingProductId = button.dataset.add;

  showInvite();
}, true);

// Detectar registro o ingreso correcto.

function updateFromAccount() {
  if (rewardChoice !== 'waiting') {
    if (
      rewardChoice === 'points' &&
      !signedIn() &&
      !registrationPending()
    ) {
      rewardChoice = 'guest';
      syncCheckout();
    }

    return;
  }

  if (signedIn()) {
    rewardChoice = 'points';

    syncCheckout();

    byId('host-rewards-resume')
      ?.setAttribute('hidden', '');

    resumeProduct();

  } else if (registrationPending()) {
    rewardChoice = 'points';

    syncCheckout();

    const button = byId('host-rewards-resume');

    if (button) {
      button.textContent =
        'Seguir comprando (cuenta pendiente)';
    }
  }
}

const pointsSection = byId('puntos');

if (pointsSection) {
  new MutationObserver(updateFromAccount).observe(
    pointsSection,
    {
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden']
    }
  );
}

// Mostrar el estado de puntos en el carrito.

const checkout = byId('checkout');

if (checkout && !byId('host-points-order-note')) {
  const info = document.createElement('p');

  info.id = 'host-points-order-note';

  info.style.cssText = `
    font-size: 12px;
    color: #ffbd29;
    margin: 10px 0;
  `;

  const wrap = checkout.querySelector(
    '.host-loyalty-phone'
  );

  if (wrap) {
    wrap.after(info);
  } else {
    checkout.prepend(info);
  }
}

// DISEÑO DEL CARTEL

const style = document.createElement('style');

style.textContent = `
  .host-loyalty-phone[hidden],
  #host-rewards-resume[hidden] {
    display: none !important;
  }

  #host-points-invite {
    position: fixed;
    inset: 0;
    z-index: 100001;
    background: rgba(0,0,0,.87);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
  }

  .host-invite-dialog {
    width: min(420px,100%);
    background: linear-gradient(
      145deg, #291108, #101010
    );
    border: 1px solid #ad5b22;
    border-radius: 19px;
    padding: 26px 22px;
    text-align: center;
    color: white;
    box-shadow: 0 20px 80px #0009;
  }

  .host-invite-kicker {
    color: #ffc329;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 2px;
  }

  .host-invite-dialog h2 {
    color: white;
    font: 32px/1.1 Anton, sans-serif;
    margin: 12px 0;
  }

  .host-invite-dialog p {
    color: #e8e8e8;
    margin-bottom: 20px;
  }

  .host-invite-dialog button {
    display: block;
    width: 100%;
    padding: 13px 12px;
    margin: 9px 0;
    border-radius: 9px;
    font-weight: 900;
    background: #ed171f;
    color: white;
    border: 0;
    cursor: pointer;
  }

  .host-invite-dialog button.host-invite-skip {
    background: transparent;
    border: 1px solid #666;
    color: #ddd;
  }

  .host-invite-dialog small {
    display: block;
    color: #bbb;
    font-size: 12px;
    margin-top: 14px;
  }
`;

document.head.append(style);

syncCheckout();
