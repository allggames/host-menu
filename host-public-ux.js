// HOST - Navegacion simplificada + ventana de ingreso a Puntos.
// No reemplaza loyalty.js, menu.js, host-canjes.js ni sus operaciones de Supabase.
// Reutiliza los formularios existentes para conservar las validaciones y los eventos.

(function () {
  'use strict';

  function init() {
    const points = document.getElementById('puntos');
    const forms = document.getElementById('host-loyalty-forms');
    const account = document.getElementById('host-loyalty-account');
    const card = points?.querySelector('.host-loyalty-card');
    const nav = document.querySelector('.header-nav');

    // Ordenar las pestañas incluso si Puntos todavía se está creando.
    if (nav) {
      const sections = ['#menu', '#carrito', '#puntos', '#informacion'];
      sections.forEach(href => {
        const link = nav.querySelector(`a[href="${href}"]`);
        if (link) nav.appendChild(link);
      });
    }

    // loyalty.js crea Puntos dinámicamente. Esperamos sus elementos.
    if (!points || !forms || !account || !card || !nav) return false;
    if (document.getElementById('host-auth-overlay')) return true;

    // 2. CSS propio (mantiene los colores originales de HOST).
    const style = document.createElement('style');
    style.id = 'host-public-ux-style';
    style.textContent = `
      #host-auth-overlay[hidden], #host-points-access[hidden] { display: none !important; }
      #host-auth-overlay {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: grid;
        place-items: center;
        padding: 16px;
        overflow-y: auto;
        background: rgba(0,0,0,.82);
        backdrop-filter: blur(5px);
      }
      #host-auth-dialog {
        width: min(100%, 455px);
        max-height: calc(100dvh - 32px);
        overflow: auto;
        padding: 22px;
        border: 1px solid #8b4024;
        border-radius: 18px;
        background: linear-gradient(150deg,#25100a,#110b09 70%);
        color: white;
        box-shadow: 0 20px 70px rgba(0,0,0,.65);
      }
      #host-auth-dialog .host-auth-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
      }
      #host-auth-dialog h2 {
        margin: 0;
        color: #ffc329;
        font-size: clamp(20px,4vw,25px);
        line-height: 1.2;
      }
      #host-auth-dialog .host-auth-subtitle { color: #c9bcb6; font-size: 13px; margin: 8px 0; }
      #host-auth-close {
        flex: 0 0 auto;
        border: 1px solid #82503a;
        border-radius: 9px;
        padding: 7px 11px;
        background: #372019;
        color: white;
        font-size: 20px;
        cursor: pointer;
      }
      #host-auth-dialog .host-loyalty-tabs { margin-top: 14px; }
      #host-auth-dialog .host-loyalty-form { margin: 14px auto 0; }
      #host-auth-dialog .host-loyalty-form label { color: white; }
      #host-auth-dialog .host-loyalty-form small { color: #bbb; }
      #host-auth-dialog #host-loyalty-feedback { color: #ffcb49; }
      #host-points-access { margin: 19px auto 8px; }
      #host-points-access p { margin: 6px auto 13px; color: #ddd; }
      #host-points-access .host-points-buttons {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 9px;
      }
      #host-points-access button {
        padding: 10px 17px;
        border-radius: 9px;
        border: 1px solid #ed171f;
        background: #ed171f;
        color: #fff;
        font-weight: 800;
        cursor: pointer;
      }
      #host-points-access button.secondary {
        background: transparent;
        border-color: #ab572e;
        color: #fff;
      }
      /* El resumen principal queda compacto; la tabla permanece visible. */
      #puntos .host-loyalty-card { max-width: 690px; }
      #puntos .host-loyalty-card > .host-loyalty-kicker { display: none; }
      #puntos .host-loyalty-card > h2 { margin-bottom: 14px; }
      #puntos .host-loyalty-card > p.host-loyalty-muted { display: none; }
      #puntos #host-rewards-table { max-width: 100%; }
      #puntos #host-loyalty-account { margin-top: 16px; }
      @media (max-width: 480px) {
        #host-auth-dialog { padding: 18px 14px; }
        #puntos .host-loyalty-card { padding: 22px 15px; }
        #host-auth-dialog .host-loyalty-tabs { gap: 6px; }
      }
    `;
    document.head.appendChild(style);

    // 3. Crear el modal y MOVER los formularios ya conectados a loyalty.js.
    const overlay = document.createElement('div');
    overlay.id = 'host-auth-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div id="host-auth-dialog" role="dialog" aria-modal="true"
           aria-labelledby="host-auth-title" tabindex="-1">
        <div class="host-auth-header">
          <div>
            <h2 id="host-auth-title">⭐ HOST PUNTOS</h2>
            <p class="host-auth-subtitle">Ingresá o registrate sin salir de tu pedido.</p>
          </div>
          <button type="button" id="host-auth-close" aria-label="Cerrar ventana">×</button>
        </div>
        <div id="host-auth-content"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    const content = overlay.querySelector('#host-auth-content');
    const feedback = document.getElementById('host-loyalty-feedback');
    content.appendChild(forms);
    if (feedback) content.appendChild(feedback);

    // 4. Dejar solamente accesos compactos en Puntos.
    const access = document.createElement('div');
    access.id = 'host-points-access';
    access.innerHTML = `
      <p>Consultá tu saldo o registrate para sumar puntos con tus pedidos.</p>
      <div class="host-points-buttons">
        <button type="button" data-open-host-auth="login">Ingresar</button>
        <button type="button" class="secondary" data-open-host-auth="register">Registrarme</button>
      </div>
    `;
    account.before(access);

    let previousFocus = null;
    let previousOverflow = '';

    function openAuth(tab = 'login', source = null) {
      if (!account.hidden) {
        // Si ya inició sesión, mostrar directamente el saldo.
        points.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      previousFocus = source instanceof HTMLElement ? source : document.activeElement;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      forms.hidden = false;
      overlay.hidden = false;
      if (tab === 'register') {
        document.getElementById('host-tab-register')?.click();
      } else {
        document.getElementById('host-tab-login')?.click();
      }
      const first = tab === 'register'
        ? document.querySelector('#host-register-form [name="name"]')
        : document.querySelector('#host-login-form [name="phone"]');
      (first || document.getElementById('host-auth-close'))?.focus();
    }

    function closeAuth() {
      if (overlay.hidden) return;
      overlay.hidden = true;
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && !previousFocus.closest('#host-auth-overlay')) {
        previousFocus.focus();
      }
    }

    document.getElementById('host-auth-close').addEventListener('click', closeAuth);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeAuth();
    });
    document.addEventListener('keydown', event => {
      if (overlay.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); closeAuth(); }
      if (event.key === 'Tab') {
        // Mantener la navegación con teclado dentro del modal.
        const targets = [...overlay.querySelectorAll('button,input,textarea,select,a[href]')]
          .filter(el => !el.disabled && !el.closest('[hidden]') && el.getClientRects().length);
        if (!targets.length) return;
        const first = targets[0], last = targets[targets.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    });

    // 5. El botón del carrito se vuelve a dibujar en cada cambio de canje.
    // Interceptarlo en CAPTURE evita el listener antiguo que hacía scroll a Puntos.
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target.closest('button,a') : null;
      if (!target) return;

      const explicitMode = target.getAttribute('data-open-host-auth');
      const cartLogin = target.id === 'host-go-points' ||
        (target.closest('#carrito, #host-canje-cart') &&
          /^(ingresar\s*\/\s*registrarme|iniciar\s*sesi[oó]n\s*\/\s*registrarme)$/i
            .test(target.textContent.trim()));

      if (!explicitMode && !cartLogin) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openAuth(explicitMode === 'register' ? 'register' : 'login', target);
    }, true);

    // 6. Una vez que loyalty.js confirma el acceso, cerrar la ventana.
    function syncAccess() {
      const logged = !account.hidden;
      access.hidden = logged;
      if (logged) closeAuth();
    }
    new MutationObserver(syncAccess).observe(account, {
      attributes: true,
      attributeFilter: ['hidden', 'class']
    });
    syncAccess();
    document.documentElement.dataset.hostUx = '2';
    return true;
  }

  // Reintenta cuando aparecen las secciones generadas por los módulos.
  // Así funciona aunque el orden de carga de scripts cambie.
  let installed = false;
  const observer = new MutationObserver(() => {
    if (installed) return;
    installed = init() === true;
    if (installed) observer.disconnect();
  });

  function start() {
    if (installed) return;
    installed = init() === true;
    if (!installed) {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
