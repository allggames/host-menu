import { db } from './shared.js';
import { normalizeHostPhone } from './loyalty.js';

// La elección del cliente es independiente de si su cuenta ya fue aprobada.
let rewardChoice = null;
let pendingProductId = null;
let lastAuthPhone = null;
let lastAuthCredentials = null;
let pendingRegistrationConfirmed = false;

const byId = id => document.getElementById(id);

const active = id => {
  const el = byId(id);
  return !!el && !el.hidden && !el.classList.contains('hidden');
};

const signedIn = () => active('host-loyalty-account');
const registrationPending = () => active('host-loyalty-pending');

// loyalty.js confirma los registros pendientes en el texto de respuesta.
// No damos por válido un registro sólo porque alguien haya enviado un formulario.
function pendingFeedback() {
  const value = byId('host-loyalty-feedback')?.textContent || '';
  return /cuenta est[aá] creada.*(verificar|activarla|pendiente)|registro (pendiente|exitoso)|pendiente de aprobaci[oó]n/i
    .test(value);
}

function registeredPhone() {
  const loginInput = document.querySelector('#host-login-form [name="phone"]');
  const registerInput = document.querySelector('#host-register-form [name="phone"]');
  return normalizeHostPhone(
    lastAuthPhone ||
    lastAuthCredentials?.phone ||
    (signedIn() ? loginInput?.value : registerInput?.value)
  );
}

// Usada por el carrito para mostrar el estado antes de finalizar.
// IMPORTANTE: el estado "waiting" nunca se trata como un pedido sin puntos.
export function getHostLoyaltyOrder() {
  const wantsPoints =
    rewardChoice === 'points' ||
    rewardChoice === 'waiting' ||
    (rewardChoice !== 'guest' && signedIn());

  return {
    wantsPoints,
    phone: wantsPoints ? registeredPhone() : null
  };
}

// Esta validación ocurre al FINALIZAR el pedido, después de abrir la ventana
// de WhatsApp. Comprueba en Supabase el código del cliente, incluso si la
// cuenta está pendiente de aprobación. Nunca aceptamos un celular simplemente
// porque esté escrito en un campo.
export async function verifyHostLoyaltyOrder() {
  const choice = getHostLoyaltyOrder();
  if (!choice.wantsPoints) return choice;

  const credentials = lastAuthCredentials;

  if (!choice.phone || !credentials ||
      credentials.phone !== choice.phone || !credentials.code) {
    throw Error(
      'Para acumular puntos, terminá el registro o iniciá sesión en HOST PUNTOS. ' +
      'También podés elegir continuar sin puntos.'
    );
  }

  const { data, error } = await db.rpc('host_rewards_login', {
    p_phone: credentials.phone,
    p_code: credentials.code
  });

  if (error) throw Error('No se pudo verificar HOST PUNTOS: ' + error.message);
  if (!data || data.error || (data.pending !== true && !data.name)) {
    throw Error(
      data?.error || 'No se pudo validar tu cuenta de HOST PUNTOS. ' +
      'Revisá tu celular y tu código.'
    );
  }

  lastAuthPhone = credentials.phone;
  if (rewardChoice !== 'guest') rewardChoice = 'points';
  pendingRegistrationConfirmed = data.pending === true;
  syncCheckout();

  return { wantsPoints: true, phone: credentials.phone };
}

function syncCheckout() {
  const wrap = document.querySelector('.host-loyalty-phone');
  const input = document.querySelector('#checkout [name="customer_phone"]');
  const status = byId('host-points-order-note');
  const { wantsPoints, phone } = getHostLoyaltyOrder();

  if (wrap) wrap.hidden = !wantsPoints;
  if (input) {
    input.required = wantsPoints;
    input.readOnly = wantsPoints;
    input.value = wantsPoints ? (phone || '') : '';
  }

  if (status) {
    status.textContent = wantsPoints
      ? '🔥 HOST PUNTOS activado. Guardaremos tu celular con el pedido al confirmarlo.'
      : rewardChoice === 'guest'
        ? 'Pedido sin puntos. Podés seguir comprando normalmente.'
        : 'Podés sumar puntos al iniciar sesión o registrarte.';
  }
}

function resumeProduct() {
  const id = pendingProductId;
  pendingProductId = null;
  if (!id) return;

  const button = [...document.querySelectorAll('button[data-add]')]
    .find(b => b.dataset.add === id);
  if (button) {
    button.scrollIntoView({ behavior: 'smooth', block: 'center' });
    button.click();
  }
}

function chooseGuest() {
  rewardChoice = 'guest';
  pendingRegistrationConfirmed = false;
  lastAuthPhone = null;
  lastAuthCredentials = null;
  syncCheckout();
  byId('host-points-invite')?.remove();
  const returnButton = byId('host-rewards-resume');
  if (returnButton) returnButton.hidden = true;
  resumeProduct();
}

function showLoginOrRegister(kind) {
  byId('host-points-invite')?.remove();
  rewardChoice = 'waiting';
  syncCheckout();

  const section = byId('puntos');
  if (!section) {
    alert('No se encontró HOST PUNTOS. Podés continuar sin puntos.');
    chooseGuest();
    return;
  }

  byId(kind === 'register' ? 'host-tab-register' : 'host-tab-login')?.click();
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  let button = byId('host-rewards-resume');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.id = 'host-rewards-resume';
    button.className = 'secondary';
    button.style.cssText = 'margin:10px auto;padding:10px 16px;display:block;';
    section.querySelector('.host-loyalty-card')?.append(button);
  }
  button.hidden = false;
  button.textContent = 'Continuar mi compra';
  button.onclick = () => {
    if (signedIn() || registrationPending() || pendingRegistrationConfirmed) {
      rewardChoice = 'points';
      syncCheckout();
      resumeProduct();
    } else {
      if (confirm('Todavía no se verificó tu cuenta. ¿Querés continuar sin sumar puntos?')) {
        chooseGuest();
      }
    }
  };
}

function showInvite() {
  if (byId('host-points-invite')) return;

  const overlay = document.createElement('div');
  overlay.id = 'host-points-invite';
  overlay.innerHTML = `
    <div class="host-invite-dialog" role="dialog" aria-modal="true"
         aria-labelledby="host-invite-title">
      <span class="host-invite-kicker">🔥 HOST PUNTOS</span>
      <h2 id="host-invite-title">¿QUERÉS SUMAR PUNTOS?</h2>
      <p>Por cada $10.000 en compras confirmadas, sumás 10 puntos.</p>
      <button type="button" data-reward="login">Ya tengo cuenta · Iniciar sesión</button>
      <button type="button" data-reward="register">Quiero registrarme</button>
      <button type="button" class="host-invite-skip" data-reward="skip">
        No, gracias · Continuar sin puntos
      </button>
      <small>Registrarte es opcional. Tu pedido se envía por WhatsApp en ambos casos.</small>
    </div>`;
  document.body.append(overlay);

  overlay.querySelector('[data-reward="login"]')
    .onclick = () => showLoginOrRegister('login');
  overlay.querySelector('[data-reward="register"]')
    .onclick = () => showLoginOrRegister('register');
  overlay.querySelector('[data-reward="skip"]').onclick = chooseGuest;
  overlay.onclick = event => {
    if (event.target === overlay) chooseGuest();
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

// Guardar los datos *de la solicitud de registro o ingreso*.
// El servidor volverá a comprobarlos antes de registrar el pedido con puntos.
document.addEventListener('submit', event => {
  const form = event.target;
  if (form.id !== 'host-login-form' && form.id !== 'host-register-form') return;

  const phone = normalizeHostPhone(form.querySelector('[name="phone"]')?.value);
  const code = String(form.querySelector('[name="code"]')?.value || '');

  if (!phone || !/^[A-Za-z0-9]{8}$/.test(code)) return;

  lastAuthPhone = phone;
  lastAuthCredentials = { phone, code };
  pendingRegistrationConfirmed = false;
  rewardChoice = 'waiting';
  syncCheckout();
}, true);

// Un cierre de sesión siempre desasocia el próximo pedido.
document.addEventListener('click', event => {
  if (!event.target.closest('#host-loyalty-logout')) return;
  lastAuthPhone = null;
  lastAuthCredentials = null;
  pendingRegistrationConfirmed = false;
  rewardChoice = 'guest';
  syncCheckout();
}, true);

// Interceptar la primera selección de producto.
document.addEventListener('click', event => {
  const button = event.target.closest('button[data-add]');
  if (!button || rewardChoice !== null) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  pendingProductId = button.dataset.add;
  showInvite();
}, true);

function closeAuthModalIfOpen() {
  const modal = byId('host-auth-overlay');
  if (modal && !modal.hidden) byId('host-auth-close')?.click();
}

// Cuando loyalty.js confirma que la cuenta está iniciada, o informa que
// el registro fue exitoso pero está pendiente, conservamos su celular.
function updateFromAccount() {
  const logged = signedIn();
  const pending = registrationPending() ||
    (lastAuthCredentials && pendingFeedback());

  if (rewardChoice !== 'waiting') return;
  if (!logged && !pending) return;

  rewardChoice = 'points';
  pendingRegistrationConfirmed = !!pending && !logged;
  syncCheckout();

  const button = byId('host-rewards-resume');
  if (button) button.hidden = true;
  closeAuthModalIfOpen();
  resumeProduct();
}

const account = byId('host-loyalty-account');
const feedback = byId('host-loyalty-feedback');
const pendingBox = byId('host-loyalty-pending');
const section = byId('puntos');

const observer = new MutationObserver(updateFromAccount);
if (account) observer.observe(account, { attributes: true, attributeFilter: ['hidden', 'class'] });
if (feedback) observer.observe(feedback, { childList: true, subtree: true, characterData: true });
if (pendingBox) observer.observe(pendingBox, { attributes: true, attributeFilter: ['hidden', 'class'] });
if (!account && !feedback && section) {
  observer.observe(section, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
}

// Mensaje en carrito.
const checkout = byId('checkout');
if (checkout && !byId('host-points-order-note')) {
  const info = document.createElement('p');
  info.id = 'host-points-order-note';
  info.style.cssText = 'font-size:12px;color:#ffbd29;margin:10px 0;';
  const wrap = checkout.querySelector('.host-loyalty-phone');
  if (wrap) wrap.after(info);
  else checkout.prepend(info);
}

const style = document.createElement('style');
style.textContent = `
  .host-loyalty-phone[hidden], #host-rewards-resume[hidden] { display:none!important; }
  #host-points-invite {
    position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.87);
    display:flex;align-items:center;justify-content:center;padding:18px;
  }
  .host-invite-dialog {
    width:min(420px,100%);background:linear-gradient(145deg,#291108,#101010);
    border:1px solid #ad5b22;border-radius:19px;padding:26px 22px;
    text-align:center;color:white;box-shadow:0 20px 80px #0009;
  }
  .host-invite-kicker {
    color:#ffc329;font-size:12px;font-weight:900;letter-spacing:2px;
  }
  .host-invite-dialog h2 {
    color:white;font:32px/1.1 Anton,sans-serif;margin:12px 0;
  }
  .host-invite-dialog p { color:#e8e8e8;margin-bottom:20px; }
  .host-invite-dialog button {
    display:block;width:100%;padding:13px 12px;margin:9px 0;
    border-radius:9px;font-weight:900;background:#ed171f;color:white;border:0;cursor:pointer;
  }
  .host-invite-dialog button.host-invite-skip {
    background:transparent;border:1px solid #666;color:#ddd;
  }
  .host-invite-dialog small {
    display:block;color:#bbb;font-size:12px;margin-top:14px;
  }
`;
document.head.append(style);
syncCheckout();
