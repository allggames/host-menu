
export async function requireHostAdminMfa(db) {
  const aal = await db.auth.mfa
    .getAuthenticatorAssuranceLevel();

  if (aal.error) throw aal.error;

  if (aal.data?.currentLevel === 'aal2') {
    return true;
  }

  const list = await db.auth.mfa.listFactors();
  if (list.error) throw list.error;

  let factor = (list.data?.totp || [])
    .find(f => f.status === 'verified') || null;

  let setup = null;

  if (!factor) {
    const enroll = await db.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName:
        'HOST Admin ' +
        new Date().toISOString().slice(0, 16)
    });

    if (enroll.error) throw enroll.error;

    setup = enroll.data;
    factor = { id: setup.id };
  }

  const login = document.getElementById('login');
  const loginForm =
    document.getElementById('login-form');

  if (!login || !loginForm) {
    throw Error('No se encuentra el formulario.');
  }

  if (document.getElementById('host-admin-mfa')) {
    throw Error('Ya hay una verificación en curso.');
  }

  const formWasHidden = loginForm.hidden;
  loginForm.hidden = true;

  const box = document.createElement('div');
  box.id = 'host-admin-mfa';

  box.style.cssText = `
    border: 1px solid #ed171f;
    border-radius: 14px;
    padding: 18px;
    margin-top: 15px;
  `;

  box.innerHTML = `
    <h2>
      ${setup
        ? 'Activar doble autenticación'
        : 'Verificación de seguridad'}
    </h2>

    <p class="muted">
      ${setup
        ? 'Vinculá tu cuenta con una aplicación autenticadora.'
        : 'Abrí tu autenticador e ingresá el código temporal.'}
    </p>

    <div data-host-mfa-setup></div>

    <form data-host-mfa-form>
      <label for="host-mfa-code">
        Código temporal de 6 números
      </label>

      <input
        id="host-mfa-code"
        type="text"
        inputmode="numeric"
        pattern="[0-9]{6}"
        minlength="6"
        maxlength="6"
        autocomplete="one-time-code"
        required
        placeholder="123456"
      >

      <p>
        <button type="submit">
          ${setup
            ? 'Activar y entrar'
            : 'Verificar y entrar'}
        </button>

        <button
          type="button"
          class="secondary"
          data-host-mfa-cancel
        >
          Cancelar
        </button>
      </p>
    </form>

    <p
      data-host-mfa-feedback
      role="status"
      class="muted"
    ></p>
  `;

  login.appendChild(box);

  // MOSTRAR QR PARA CONFIGURAR EL AUTENTICADOR

  if (setup) {
    const target = box.querySelector(
      '[data-host-mfa-setup]'
    );

    const qr = setup.totp?.qr_code || '';

    if (qr) {
      const img = document.createElement('img');

      img.alt = 'QR de seguridad HOST';
      img.style.cssText = `
        display: block;
        max-width: 220px;
        width: 100%;
        margin: 14px 0;
        padding: 8px;
        background: white;
        border-radius: 8px;
      `;

      img.src = qr.startsWith('data:image/svg+xml')
        ? qr
        : 'data:image/svg+xml;charset=UTF-8,' +
          encodeURIComponent(qr);

      target.appendChild(img);
    }

    const info = document.createElement('p');
    info.textContent =
      'Si no podés escanear el QR, ' +
      'ingresá esta clave manualmente:';

    const secret = document.createElement('code');

    secret.style.cssText = `
      display: block;
      word-break: break-all;
      margin: 10px 0;
      font-weight: bold;
    `;

    secret.textContent =
      setup.totp?.secret || '';

    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent =
      'No compartas el QR ni la clave. ' +
      'Ingresá el código de 6 números de tu app.';

    target.append(info, secret, note);
  }

  // VERIFICAR SEGUNDO FACTOR

  return await new Promise(resolve => {
    const form = box.querySelector(
      '[data-host-mfa-form]'
    );

    const feedback = box.querySelector(
      '[data-host-mfa-feedback]'
    );

    const submit = form.querySelector(
      'button[type="submit"]'
    );

    const codeInput = box.querySelector(
      '#host-mfa-code'
    );

    let ended = false;

    function finish(ok) {
      if (ended) return;
      ended = true;

      box.remove();
      loginForm.hidden = formWasHidden;

      resolve(ok);
    }

    form.addEventListener('submit', async event => {
      event.preventDefault();

      if (ended) return;

      const code = codeInput.value.trim();

      if (!/^[0-9]{6}$/.test(code)) {
        feedback.textContent =
          'Ingresá exactamente 6 números.';
        return;
      }

      submit.disabled = true;
      feedback.textContent =
        'Verificando código...';

      try {
        const result = await db.auth.mfa
          .challengeAndVerify({
            factorId: factor.id,
            code
          });

        if (result.error) {
          throw result.error;
        }

        const verified = await db.auth.mfa
          .getAuthenticatorAssuranceLevel();

        if (verified.error) {
          throw verified.error;
        }

        if (
          verified.data?.currentLevel !== 'aal2'
        ) {
          throw Error(
            'No se completó la verificación.'
          );
        }

        finish(true);

      } catch (error) {
        feedback.textContent =
          'Error: ' + (
            error.message ||
            'Código incorrecto'
          );

        codeInput.value = '';
        codeInput.focus();

      } finally {
        submit.disabled = false;
      }
    });

    // CANCELAR Y CERRAR SESIÓN

    box.querySelector(
      '[data-host-mfa-cancel]'
    ).addEventListener('click', async () => {
      if (ended) return;

      try {
        await db.auth.signOut();
      } finally {
        finish(false);
      }
    });

    codeInput.focus();
  });
}
