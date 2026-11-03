
import { db } from './shared.js';

// Normalizar celulares argentinos.

export function normalizeHostPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);

  if (/^549\d{10}$/.test(digits)) {
    return `+${digits}`;
  }

  if (/^54\d{10}$/.test(digits)) {
    return `+549${digits.slice(2)}`;
  }

  if (/^\d{10}$/.test(digits)) {
    return `+549${digits}`;
  }

  return null;
}

// AGREGAR CELULAR AL CHECKOUT

const checkout = document.querySelector('#checkout');

if (checkout) {
  const phoneWrap = document.createElement('div');

  phoneWrap.className = 'host-checkout-phone';

  phoneWrap.innerHTML = `
    <label for="host-customer-phone">
      Tu celular * (para acumular puntos)
    </label>

    <input
      id="host-customer-phone"
      name="customer_phone"
      type="tel"
      inputmode="tel"
      autocomplete="tel"
      required
      maxlength="25"
      placeholder="Ej.: 3764123456"
    >

    <small>
      Usamos tu número para registrar tus compras y puntos.
    </small>
  `;

  checkout.querySelector('.two')
    ?.insertAdjacentElement('afterend', phoneWrap);
}

// SECCIÓN MIS PUNTOS

const hostMain = document.querySelector('.host-main');

if (hostMain) {
  const section = document.createElement('section');

  section.id = 'puntos';
  section.className = 'host-points-section';

  section.innerHTML = `
    <div class="host-points-inner">

      <span class="host-points-kicker">
        🔥 PREMIAMOS TUS PEDIDOS
      </span>

      <h2>HOST <span>PUNTOS</span></h2>

      <p>
        Por cada $10.000 de compra, sumás 10 puntos.
      </p>

      <p class="host-points-small">
        Los puntos aparecen cuando HOST confirma tu pedido.
      </p>

      <form id="host-points-request">
        <label for="host-points-phone">
          Consultá tus puntos con tu celular
        </label>

        <input
          id="host-points-phone"
          type="tel"
          inputmode="tel"
          autocomplete="tel"
          placeholder="Ej.: 3764123456"
          required
        >

        <button type="submit">
          RECIBIR CÓDIGO POR SMS
        </button>
      </form>

      <form id="host-points-verify" hidden>
        <label for="host-points-code">
          Código de verificación
        </label>

        <input
          id="host-points-code"
          inputmode="numeric"
          autocomplete="one-time-code"
          minlength="6"
          maxlength="8"
          placeholder="Código recibido"
          required
        >

        <button type="submit">
          VER MIS PUNTOS
        </button>
      </form>

      <div id="host-points-balance" hidden>
        <span>TENÉS ACUMULADOS</span>

        <strong id="host-points-total">0</strong>

        <span>PUNTOS</span>

        <p id="host-points-orders"></p>

        <button
          id="host-points-exit"
          type="button"
          class="secondary"
        >
          Cerrar sesión
        </button>
      </div>

      <p
        id="host-points-message"
        role="status"
        aria-live="polite"
      ></p>

    </div>
  `;

  const info = document.querySelector('#informacion');

  if (info) {
    info.before(section);
  } else {
    hostMain.append(section);
  }

  // AGREGAR ENLACE AL MENÚ SUPERIOR

  const navigation = document.querySelector('.header-nav');

  if (
    navigation &&
    !navigation.querySelector('a[href="#puntos"]')
  ) {
    const link = document.createElement('a');

    link.href = '#puntos';
    link.textContent = '⭐ Puntos';

    const cartLink =
      navigation.querySelector('a[href="#carrito"]');

    if (cartLink) {
      cartLink.before(link);
    } else {
      navigation.append(link);
    }
  }

  // ESTILOS

  const style = document.createElement('style');

  style.textContent = `
    .host-checkout-phone {
      margin: 12px 0 18px;
    }

    .host-checkout-phone small {
      display: block;
      color: #bbb;
      margin-top: 5px;
    }

    .host-points-section {
      margin: 40px 0;
      padding: 28px 18px;
      border: 1px solid #673318;
      border-radius: 18px;
      background:
        linear-gradient(145deg, #1d0c08, #0a0a0a);
      color: white;
    }

    .host-points-inner {
      max-width: 560px;
      margin: auto;
      text-align: center;
    }

    .host-points-kicker {
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 1px;
      color: #ffbd29;
    }

    .host-points-inner h2 {
      font: clamp(30px, 5vw, 46px)/1.1 Anton, sans-serif;
      margin: 8px 0;
    }

    .host-points-inner h2 span {
      color: #ffbd29;
    }

    .host-points-small {
      color: #bbb;
      font-size: 13px;
    }

    .host-points-inner form {
      display: grid;
      gap: 12px;
      max-width: 370px;
      margin: 25px auto;
    }

    .host-points-inner form[hidden],
    #host-points-balance[hidden] {
      display: none !important;
    }

    .host-points-inner form label {
      text-align: left;
      font-weight: 700;
    }

    .host-points-inner form input {
      width: 100%;
      padding: 12px;
      background: white;
      color: #151515;
      border-radius: 8px;
      border: 1px solid #aaa;
      box-sizing: border-box;
    }

    .host-points-inner form button {
      background: #ed171f;
      color: white;
      font-weight: 800;
      border: 0;
      border-radius: 9px;
      padding: 13px;
      cursor: pointer;
    }

    #host-points-balance {
      padding: 24px 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    #host-points-total {
      font: 65px/1.1 Anton, sans-serif;
      color: #ffc329;
    }

    #host-points-balance span {
      font-size: 12px;
      letter-spacing: 1px;
    }

    #host-points-orders {
      color: #bbb;
    }

    #host-points-message {
      color: #ffbd29;
      min-height: 20px;
      font-size: 13px;
    }

    @media (max-width: 620px) {
      .header-nav a[href="#puntos"] {
        font-size: 11px;
        padding: 6px 4px;
        white-space: nowrap;
      }
    }
  `;

  document.head.append(style);

  // FORMULARIOS

  const requestForm =
    document.querySelector('#host-points-request');

  const verifyForm =
    document.querySelector('#host-points-verify');

  const balance =
    document.querySelector('#host-points-balance');

  const message =
    document.querySelector('#host-points-message');

  let requestedPhone = '';

  function showMessage(value) {
    message.textContent = String(value || '');
  }

  // CONSULTAR SALDO

  async function showPoints() {
    const { data, error } =
      await db.rpc('host_my_points');

    if (error) throw error;

    const points = Number(data?.points || 0);
    const orders = Number(data?.orders || 0);

    document.querySelector('#host-points-total')
      .textContent = points.toLocaleString('es-AR');

    document.querySelector('#host-points-orders')
      .textContent =
        `Compras que sumaron puntos: ${orders}`;

    requestForm.hidden = true;
    verifyForm.hidden = true;
    balance.hidden = false;

    showMessage('');
  }

  // ENVIAR CÓDIGO DE VERIFICACIÓN

  requestForm.onsubmit = async event => {
    event.preventDefault();

    const phone = normalizeHostPhone(
      document.querySelector('#host-points-phone').value
    );

    if (!phone) {
      showMessage(
        'Ingresá un celular argentino válido, ' +
        'por ejemplo 3764123456.'
      );
      return;
    }

    const button = requestForm.querySelector('button');
    button.disabled = true;

    showMessage('Solicitando código...');

    try {
      const { error } = await db.auth.signInWithOtp({
        phone
      });

      if (error) throw error;

      requestedPhone = phone;
      verifyForm.hidden = false;

      showMessage(
        'Te enviamos un código por SMS. ' +
        'Ingresalo para consultar tu saldo.'
      );

    } catch (error) {
      showMessage(
        `No se pudo enviar el SMS: ${error.message || error}`
      );

    } finally {
      button.disabled = false;
    }
  };

  // VERIFICAR CÓDIGO

  verifyForm.onsubmit = async event => {
    event.preventDefault();

    const code = document
      .querySelector('#host-points-code')
      .value.trim();

    const button = verifyForm.querySelector('button');

    button.disabled = true;

    try {
      const { error } = await db.auth.verifyOtp({
        phone: requestedPhone,
        token: code,
        type: 'sms'
      });

      if (error) throw error;

      await showPoints();

    } catch (error) {
      showMessage(
        `No pudimos verificar el código: ` +
        (error.message || error)
      );

    } finally {
      button.disabled = false;
    }
  };

  // CERRAR SESIÓN

  document.querySelector('#host-points-exit')
    .onclick = async () => {
      await db.auth.signOut();

      balance.hidden = true;
      verifyForm.hidden = true;
      requestForm.hidden = false;

      showMessage('Sesión cerrada.');
    };

  // SI YA VERIFICÓ SU CELULAR ANTERIORMENTE

  db.auth.getUser()
    .then(async ({ data: { user }, error }) => {
      if (
        !error &&
        user?.phone &&
        user.phone_confirmed_at
      ) {
        try {
          await showPoints();
        } catch {
          // La consulta estará disponible cuando
          // la base de puntos esté configurada.
        }
      }
    })
    .catch(() => {});
}
