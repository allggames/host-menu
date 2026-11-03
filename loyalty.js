
import { db, escapeHTML } from './shared.js';
import { WHATSAPP_NUMBER } from './config.js';

export function normalizeHostPhone(value) {
  let d = String(value || '').replace(/\D/g, '');

  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);

  if (/^549\d{10}$/.test(d)) return '+' + d;
  if (/^54\d{10}$/.test(d)) return '+549' + d.slice(2);
  if (/^\d{10}$/.test(d)) return '+549' + d;

  return null;
}

const h = value => escapeHTML(String(value ?? ''));
const $ = id => document.getElementById(id);

const main = document.querySelector('.host-main');
const checkout = $('checkout');

let signedPhone = null;
let signedCode = null;

// AGREGAR CELULAR AL CHECKOUT

if (checkout && !checkout.querySelector('[name="customer_phone"]')) {
  const wrap = document.createElement('div');

  wrap.className = 'host-loyalty-phone';

  wrap.innerHTML = `
    <label for="host-order-phone">
      Tu celular * (para acumular puntos)
    </label>

    <input
      id="host-order-phone"
      name="customer_phone"
      type="tel"
      autocomplete="tel"
      inputmode="tel"
      placeholder="Ej.: 3764123456"
      required
      maxlength="25"
    >

    <small>
      Los puntos se suman cuando HOST confirma tu compra.
    </small>
  `;

  checkout.querySelector('.two')?.after(wrap);
}

// SECCIÓN HOST PUNTOS

if (main && !$('puntos')) {
  const section = document.createElement('section');

  section.id = 'puntos';

  section.innerHTML = `
    <div class="host-loyalty-card">

      <span class="host-loyalty-kicker">
        🔥 PREMIAMOS TUS PEDIDOS
      </span>

      <h2>HOST <span>PUNTOS</span></h2>

      <p>
        Por cada $10.000 de compra, sumás 10 puntos.
      </p>

      <p class="host-loyalty-muted">
        Los puntos se acreditan cuando confirmamos tu pedido.
      </p>

      <!-- INGRESO Y REGISTRO -->

      <div id="host-loyalty-forms">

        <div class="host-loyalty-tabs">
          <button
            type="button"
            id="host-tab-login"
            class="selected"
          >
            Ingresar
          </button>

          <button
            type="button"
            id="host-tab-register"
          >
            Registrarme
          </button>
        </div>

        <form id="host-login-form" class="host-loyalty-form">

          <label>
            Tu celular
            <input
              type="tel"
              name="phone"
              autocomplete="tel"
              placeholder="Ej.: 3764123456"
              required
            >
          </label>

          <label>
            Tu código de 8 dígitos
            <input
              type="password"
              name="code"
              inputmode="numeric"
              maxlength="8"
              minlength="8"
              pattern="[0-9]{8}"
              required
            >
          </label>

          <button type="submit">
            VER MIS PUNTOS
          </button>

          <small>
            ¿Olvidaste tu código? Contactá a HOST para cambiarlo.
          </small>

        </form>

        <form
          id="host-register-form"
          class="host-loyalty-form"
          hidden
        >

          <label>
            Tu nombre
            <input
              name="name"
              maxlength="100"
              required
            >
          </label>

          <label>
            Tu celular
            <input
              type="tel"
              name="phone"
              autocomplete="tel"
              placeholder="Ej.: 3764123456"
              required
            >
          </label>

          <label>
            Creá tu código de 8 dígitos

            <input
              id="host-new-code"
              name="code"
              type="text"
              inputmode="numeric"
              maxlength="8"
              minlength="8"
              pattern="[0-9]{8}"
              required
            >
          </label>

          <button
            id="host-generate-code"
            type="button"
            class="secondary"
          >
            Generar un código para mí
          </button>

          <button type="submit">
            CREAR MI CUENTA
          </button>

          <small>
            Elegí un código diferente del PIN de tu banco.
            Guardalo en un lugar seguro.
          </small>

        </form>

      </div>

      <!-- NUEVO: SOLICITUD DE APROBACIÓN -->

      <div id="host-loyalty-pending" hidden>

        <h3>⏳ Tu cuenta está pendiente de aprobación</h3>

        <p>
          ¡Tu cuenta fue creada correctamente!
          Para activarla, necesitamos verificar tu WhatsApp.
        </p>

        <p>
          Enviá tu solicitud desde el número que registraste.
        </p>

        <a
          id="host-loyalty-request-whatsapp"
          class="host-loyalty-whatsapp-btn"
          target="_blank"
          rel="noopener noreferrer"
          href="#"
        >
          📲 ENVIAR SOLICITUD A HOST
        </a>

        <p class="host-loyalty-muted">
          HOST verificará tu número y habilitará tu cuenta.
          No incluyas tu código privado en el mensaje.
        </p>

        <button
          id="host-loyalty-back-login"
          type="button"
          class="secondary"
        >
          Volver a ingresar
        </button>

      </div>

      <!-- CUENTA DEL CLIENTE -->

      <div id="host-loyalty-account" hidden>

        <p>
          Hola, <strong id="host-loyalty-name"></strong>
        </p>

        <div class="host-loyalty-number">
          <strong id="host-loyalty-points">0</strong>
          puntos
        </div>

        <p class="host-loyalty-muted">
          Tu código de acceso
        </p>

        <div class="host-loyalty-code-row">

          <input
            id="host-visible-code"
            type="password"
            readonly
            aria-label="Código de acceso"
          >

          <button
            type="button"
            id="host-toggle-code"
            class="secondary"
          >
            Mostrar
          </button>

        </div>

        <h3>Movimientos</h3>

        <div id="host-loyalty-history"></div>

        <details>
          <summary>Cambiar mi código</summary>

          <form
            id="host-change-form"
            class="host-loyalty-form"
          >

            <label>
              Código actual

              <input
                name="old_code"
                type="password"
                inputmode="numeric"
                pattern="[0-9]{8}"
                required
              >
            </label>

            <label>
              Nuevo código (8 dígitos)

              <input
                name="new_code"
                type="text"
                inputmode="numeric"
                pattern="[0-9]{8}"
                maxlength="8"
                minlength="8"
                required
              >
            </label>

            <button type="submit">
              GUARDAR NUEVO CÓDIGO
            </button>

          </form>
        </details>

        <button
          type="button"
          id="host-loyalty-logout"
          class="secondary"
        >
          Salir de mi cuenta
        </button>

      </div>

      <p
        id="host-loyalty-feedback"
        role="status"
        aria-live="polite"
      ></p>

    </div>
  `;

  if ($('informacion')) {
    $('informacion').before(section);
  } else {
    main.append(section);
  }

  // ENLACE A PUNTOS EN LA NAVEGACIÓN

  const nav = document.querySelector('.header-nav');

  if (nav && !nav.querySelector('a[href="#puntos"]')) {
    const a = document.createElement('a');

    a.href = '#puntos';
    a.textContent = '⭐ Puntos';

    const cartLink = nav.querySelector('a[href="#carrito"]');

    if (cartLink) {
      cartLink.before(a);
    } else {
      nav.append(a);
    }
  }

  // DISEÑO

  const style = document.createElement('style');

  style.textContent = `
    .host-loyalty-card {
      max-width: 620px;
      margin: 35px auto;
      padding: 26px 22px;
      border: 1px solid #55311a;
      border-radius: 18px;
      background: linear-gradient(145deg, #230c07, #0b0b0b);
      color: white;
      text-align: center;
    }

    .host-loyalty-card h2 {
      font: clamp(30px,5vw,44px)/1.1 Anton,sans-serif;
      margin: 10px 0;
    }

    .host-loyalty-card h2 span,
    .host-loyalty-kicker,
    .host-loyalty-number {
      color: #ffc329;
    }

    .host-loyalty-kicker {
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 1px;
    }

    .host-loyalty-muted,
    .host-loyalty-card small {
      color: #bdbdbd;
    }

    .host-loyalty-form {
      display: grid;
      gap: 12px;
      margin: 20px auto;
      max-width: 385px;
      text-align: left;
    }

    .host-loyalty-form label {
      display: grid;
      gap: 6px;
      font-weight: 700;
    }

    .host-loyalty-form input,
    .host-loyalty-code-row input {
      width: 100%;
      box-sizing: border-box;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #aaa;
      background: #f4f5fb;
      color: #111;
    }

    .host-loyalty-form button {
      padding: 12px;
      border: 0;
      border-radius: 8px;
      background: #ee171f;
      color: white;
      font-weight: 900;
      cursor: pointer;
    }

    .host-loyalty-tabs {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-top: 18px;
    }

    .host-loyalty-tabs button {
      border: 1px solid #a64d23;
      background: transparent;
      color: white;
      border-radius: 8px;
      padding: 9px 15px;
    }

    .host-loyalty-tabs button.selected {
      background: #ed171f;
      border-color: #ed171f;
    }

    .host-loyalty-number {
      font: 38px Anton,sans-serif;
      margin: 16px 0;
    }

    .host-loyalty-code-row {
      display: flex;
      gap: 8px;
      max-width: 320px;
      margin: 10px auto 25px;
    }

    .host-loyalty-code-row button {
      flex-shrink: 0;
    }

    .host-loyalty-history-item {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #39302c;
      padding: 10px 0;
      text-align: left;
      gap: 12px;
    }

    .host-loyalty-card details {
      margin: 22px 0;
      text-align: left;
      cursor: pointer;
    }

    #host-loyalty-feedback {
      color: #ffbe29;
      min-height: 18px;
    }

    #host-loyalty-pending {
      padding: 20px 0;
    }

    .host-loyalty-whatsapp-btn {
      display: inline-block;
      padding: 13px 18px;
      margin: 14px 0;
      border-radius: 10px;
      background: #20bd61;
      color: white;
      text-decoration: none;
      font-weight: 900;
      box-shadow: 0 5px 20px rgba(0,0,0,.25);
    }

    .host-loyalty-whatsapp-btn:hover {
      background: #169d4d;
    }

    #host-loyalty-back-login {
      margin-top: 10px;
    }

    #host-loyalty-account[hidden],
    #host-loyalty-forms[hidden],
    #host-loyalty-pending[hidden],
    .host-loyalty-form[hidden] {
      display: none !important;
    }

    .host-loyalty-phone {
      margin: 13px 0;
    }

    .host-loyalty-phone small {
      display: block;
      opacity: .75;
      margin-top: 5px;
    }
  `;

  document.head.append(style);

  // FUNCIONES GENERALES

  const feedback = msg => {
    $('host-loyalty-feedback').textContent = String(msg || '');
  };

  const call = async (method, params) => {
    const { data, error } = await db.rpc(method, params);

    if (error) throw error;
    if (data?.error) throw Error(data.error);

    return data;
  };

  const setTab = tab => {
    $('host-login-form').hidden = tab !== 'login';
    $('host-register-form').hidden = tab !== 'register';

    $('host-loyalty-forms').hidden = false;
    $('host-loyalty-pending').hidden = true;

    $('host-tab-login').classList.toggle(
      'selected',
      tab === 'login'
    );

    $('host-tab-register').classList.toggle(
      'selected',
      tab === 'register'
    );

    feedback('');
  };

  $('host-tab-login').onclick = () => setTab('login');
  $('host-tab-register').onclick = () => setTab('register');

  // NUEVO: SOLICITAR APROBACIÓN POR WHATSAPP

  function showPending(phone, name) {
    const message = [
      '🔥 *HOST PUNTOS - NUEVA SOLICITUD*',
      '',
      'Hola HOST, quiero activar mi cuenta de puntos.',
      `Nombre: ${String(name || 'Cliente').trim()}`,
      `Celular registrado: ${phone}`,
      '',
      '¿Pueden verificar mi WhatsApp y aprobar mi cuenta?'
    ].join('\n');

    const link = $('host-loyalty-request-whatsapp');

    // Usa el mismo número de HOST configurado
    // para recibir pedidos por WhatsApp.

    const number = String(WHATSAPP_NUMBER || '')
      .replace(/\D/g, '');

    if (/^\d{10,15}$/.test(number)) {
      link.href =
        `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

      link.style.display = 'inline-block';
    } else {
      link.removeAttribute('href');
      link.style.display = 'none';

      feedback('HOST debe configurar su número de WhatsApp.');
    }

    $('host-loyalty-forms').hidden = true;
    $('host-loyalty-account').hidden = true;
    $('host-loyalty-pending').hidden = false;
  }

  $('host-loyalty-back-login').onclick = () => {
    setTab('login');
  };

  // GENERAR CÓDIGO ALEATORIO

  $('host-generate-code').onclick = () => {
    const nums = new Uint32Array(1);

    crypto.getRandomValues(nums);

    $('host-new-code').value =
      String(nums[0] % 100000000).padStart(8, '0');
  };

  // MOSTRAR CUENTA

  const showAccount = data => {
    $('host-loyalty-forms').hidden = true;
    $('host-loyalty-account').hidden = false;
    $('host-loyalty-pending').hidden = true;

    $('host-loyalty-name').textContent = data.name || '';

    $('host-loyalty-points').textContent =
      Number(data.points || 0).toLocaleString('es-AR');

    $('host-visible-code').value = signedCode;
    $('host-visible-code').type = 'password';

    $('host-toggle-code').textContent = 'Mostrar';

    $('host-loyalty-history').innerHTML =
      (data.history || []).map(x => `
        <div class="host-loyalty-history-item">
          <span>
            ${h(x.reason)}
            · ${new Date(x.date).toLocaleDateString('es-AR')}
          </span>

          <strong>
            ${Number(x.points) > 0 ? '+' : ''}
            ${Number(x.points)} pts
          </strong>
        </div>
      `).join('') ||
      '<p class="host-loyalty-muted">Todavía no tenés movimientos.</p>';

    const phone = checkout?.querySelector(
      '[name="customer_phone"]'
    );

    const name = checkout?.querySelector('[name="name"]');

    if (phone) phone.value = signedPhone;
    if (name && !name.value) name.value = data.name || '';

    feedback('');
  };

  // INGRESAR

  const login = async (phone, code) => {
    const data = await call('host_rewards_login', {
      p_phone: phone,
      p_code: code
    });

    if (data.pending) {
      showPending(phone, data.name || 'Cliente');

      feedback(
        'Tu cuenta sigue pendiente. Enviá la solicitud por WhatsApp.'
      );

      return false;
    }

    signedPhone = phone;
    signedCode = code;

    showAccount(data);

    return true;
  };

  $('host-login-form').onsubmit = async e => {
    e.preventDefault();

    const f = new FormData(e.target);
    const phone = normalizeHostPhone(f.get('phone'));

    if (!phone) {
      return feedback('Ingresá un celular argentino válido.');
    }

    try {
      await login(phone, String(f.get('code')));
    } catch (err) {
      feedback(err.message);
    }
  };

  // REGISTRAR CLIENTE

  $('host-register-form').onsubmit = async e => {
    e.preventDefault();

    const f = new FormData(e.target);

    const phone = normalizeHostPhone(f.get('phone'));
    const code = String(f.get('code') || '');
    const name = String(f.get('name') || '').trim();

    if (!phone) {
      return feedback('Ingresá un celular argentino válido.');
    }

    const submitButton = e.target.querySelector(
      'button[type="submit"]'
    );

    submitButton.disabled = true;

    try {
      await call('host_rewards_register', {
        p_name: name,
        p_phone: phone,
        p_code: code
      });

      // Crear cuenta pendiente y preparar
      // la solicitud por WhatsApp.

      showPending(phone, name);

      feedback(
        '¡Cuenta creada! Enviá la solicitud a HOST y guardá tu código privado.'
      );

    } catch (err) {
      feedback(err.message);
    } finally {
      submitButton.disabled = false;
    }
  };

  // MOSTRAR / OCULTAR CÓDIGO

  $('host-toggle-code').onclick = () => {
    const input = $('host-visible-code');

    input.type =
      input.type === 'password' ? 'text' : 'password';

    $('host-toggle-code').textContent =
      input.type === 'password' ? 'Mostrar' : 'Ocultar';
  };

  // CAMBIAR CÓDIGO DESDE LA CUENTA

  $('host-change-form').onsubmit = async e => {
    e.preventDefault();

    const f = new FormData(e.target);

    const next = String(f.get('new_code') || '');

    try {
      await call('host_rewards_change_code', {
        p_phone: signedPhone,
        p_old_code: String(f.get('old_code')),
        p_new_code: next
      });

      signedCode = next;
      $('host-visible-code').value = next;

      e.target.reset();

      feedback(
        'Código actualizado. El anterior ya no sirve.'
      );
    } catch (err) {
      feedback(err.message);
    }
  };

  // SALIR DE LA CUENTA

  $('host-loyalty-logout').onclick = () => {
    signedPhone = null;
    signedCode = null;

    $('host-loyalty-account').hidden = true;
    $('host-loyalty-forms').hidden = false;

    $('host-login-form').reset();

    setTab('login');
  };
}


export function getHostRewardsCredentials() {
  return signedPhone && signedCode
    ? { phone: signedPhone, code: signedCode }
    : null;
}

