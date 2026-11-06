/*
 * HOST | Orden real de pestañas del administrador
 * Mueve los botones existentes (no los clona), de modo que conserva los
 * eventos asociados por admin.js, puntos.js, orden-todos.js y admin-canjes.js.
 */
(() => {
  'use strict';

  const HOST_ADMIN_CSS = `
/*
 * HOST | Administrador — apariencia oscura 2026
 * Solo estilos. No modifica autenticación, productos, pedidos ni puntos.
 * Se activa al cargar host-admin-look.js (clase body.host-admin-look).
 */
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Barlow:wght@400;500;600;700;800;900&display=swap');

body.host-admin-look {
  --host-red: #ef1821;
  --host-red-dark: #bd0d18;
  --host-yellow: #ffc329;
  --host-orange: #ff7b16;
  --host-surface: #180e0b;
  --host-surface-2: #22130e;
  --host-line: rgba(255, 159, 59, .25);
  --host-muted: #c5b5ae;
  color-scheme: dark;
  color: #fff5ef !important;
  background: #090606 !important;
  background-image:
    radial-gradient(ellipse 62% 42% at 2% 100%, rgba(208, 28, 8, .23), transparent 78%),
    radial-gradient(ellipse 55% 47% at 97% 100%, rgba(255, 110, 0, .16), transparent 74%),
    radial-gradient(ellipse 55% 37% at 55% -15%, rgba(166, 21, 12, .13), transparent 83%) !important;
  font-family: 'Barlow', Arial, sans-serif !important;
  min-height: 100vh;
  overflow-x: hidden;
}

body.host-admin-look *,
body.host-admin-look *::before,
body.host-admin-look *::after { box-sizing: border-box; }

body.host-admin-look::before {
  content: '';
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: min(35vh, 310px);
  background:
    radial-gradient(ellipse 15% 100% at 10% 110%, rgba(238, 48, 13, .18), transparent 84%),
    radial-gradient(ellipse 12% 110% at 40% 112%, rgba(255, 143, 7, .13), transparent 88%),
    radial-gradient(ellipse 18% 90% at 78% 110%, rgba(229, 28, 8, .18), transparent 88%);
  pointer-events: none;
  z-index: 0;
}

body.host-admin-look > header,
body.host-admin-look > main,
body.host-admin-look > footer { position: relative; z-index: 1; }

/* Barra de identidad */
body.host-admin-look > header {
  background: rgba(9, 7, 7, .97) !important;
  border-bottom: 1px solid rgba(255, 195, 41, .20) !important;
  box-shadow: 0 8px 26px rgba(0, 0, 0, .28);
  min-height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px clamp(20px, 5vw, 72px) !important;
}
body.host-admin-look > header .logo {
  font-family: 'Anton', Impact, sans-serif;
  font-size: clamp(29px, 3vw, 36px);
  letter-spacing: 1.2px;
  color: #fff !important;
  line-height: 1;
}
body.host-admin-look > header .logo span { color: var(--host-yellow) !important; }

/* Distribución del administrador */
body.host-admin-look > main {
  width: min(1370px, calc(100% - 40px));
  max-width: 1370px !important;
  margin: 34px auto 70px !important;
  padding: 0 !important;
}
body.host-admin-look #dashboard > .row:first-child {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  background: linear-gradient(115deg, rgba(40, 19, 13, .92), rgba(18, 11, 10, .86));
  border: 1px solid var(--host-line);
  border-radius: 18px;
  padding: clamp(17px, 3vw, 26px) !important;
  margin-bottom: 20px;
  box-shadow: 0 15px 38px rgba(0,0,0,.18);
}
body.host-admin-look #dashboard > .row:first-child h1 {
  color: #fff !important;
  margin: 0 !important;
  font-family: 'Anton', Impact, sans-serif !important;
  font-size: clamp(28px, 3vw, 39px) !important;
  font-weight: 400;
  letter-spacing: .4px;
}

/* Navegación: siete botones en el orden solicitado (el JS también ordena el DOM). */
body.host-admin-look #dashboard .tabs {
  display: grid !important;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  align-items: stretch;
  gap: 9px !important;
  padding: 11px !important;
  margin: 0 0 22px !important;
  background: rgba(22, 12, 10, .90) !important;
  border: 1px solid rgba(255, 145, 48, .23) !important;
  border-radius: 16px;
  box-shadow: 0 10px 34px rgba(0,0,0,.20);
}
body.host-admin-look #dashboard .tabs > button[data-tab] {
  min-width: 0;
  min-height: 62px;
  width: 100%;
  padding: 10px 9px !important;
  margin: 0 !important;
  border: 1px solid rgba(252, 156, 92, .25) !important;
  border-radius: 11px !important;
  background: #251711 !important;
  color: #efe8e3 !important;
  box-shadow: none !important;
  font-family: 'Barlow', Arial, sans-serif !important;
  font-size: clamp(12px, 1vw, 14px) !important;
  font-weight: 800 !important;
  line-height: 1.18;
  text-align: center;
  text-transform: none;
  transition: background .16s, border-color .16s, transform .16s;
  cursor: pointer;
}
body.host-admin-look #dashboard .tabs > button[data-tab]:hover {
  background: #3e2016 !important;
  border-color: rgba(255, 195, 41, .72) !important;
  transform: translateY(-1px);
}
body.host-admin-look #dashboard .tabs > button[data-tab].active {
  color: #fff !important;
  background: linear-gradient(130deg, var(--host-red), #c30916) !important;
  border-color: #ff6940 !important;
  box-shadow: 0 4px 15px rgba(239, 24, 33, .30) !important;
}

/* Tarjetas y títulos */
body.host-admin-look #dashboard > .panel,
body.host-admin-look #login.panel,
body.host-admin-look .panel {
  color: #fff0e9 !important;
  background: linear-gradient(145deg, rgba(32, 16, 12, .98), rgba(16, 11, 10, .98)) !important;
  border: 1px solid rgba(255, 126, 28, .34) !important;
  border-radius: 20px !important;
  box-shadow: 0 18px 50px rgba(0, 0, 0, .26);
}
body.host-admin-look #dashboard > .panel { padding: clamp(16px, 2.6vw, 28px) !important; }
body.host-admin-look h1,
body.host-admin-look h2,
body.host-admin-look h3 { color: #fff4ec !important; }
body.host-admin-look #dashboard .panel > h2,
body.host-admin-look #login h1 {
  font-family: 'Anton', Impact, sans-serif !important;
  font-size: clamp(22px, 2.4vw, 30px) !important;
  letter-spacing: .4px;
  font-weight: 400;
  line-height: 1.22;
  margin-top: 0;
  border-bottom: 1px solid rgba(255, 195, 41, .18);
  padding-bottom: 15px;
  margin-bottom: 20px;
}
body.host-admin-look #dashboard h3 {
  font-family: 'Barlow', Arial, sans-serif;
  font-size: 17px;
  font-weight: 800;
  color: #ffc329 !important;
}
body.host-admin-look .muted,
body.host-admin-look small,
body.host-admin-look p.muted { color: var(--host-muted) !important; }
body.host-admin-look label { color: #f5e8df !important; font-weight: 700; }
body.host-admin-look strong { color: #fff6ee; }

/* Campos claros de identificar, con buen contraste */
body.host-admin-look input:not([type='checkbox']):not([type='radio']):not([type='hidden']),
body.host-admin-look textarea,
body.host-admin-look select {
  background: #120f0f !important;
  color: #fff7f2 !important;
  border: 1px solid #674032 !important;
  border-radius: 10px !important;
  box-shadow: inset 0 1px 3px rgba(0,0,0,.16);
  font-family: 'Barlow', Arial, sans-serif;
  font-weight: 600;
  min-height: 43px;
  padding: 10px 12px;
  max-width: 100%;
}
body.host-admin-look input::placeholder,
body.host-admin-look textarea::placeholder { color: #a89b94 !important; opacity: 1; }
body.host-admin-look input[type='checkbox'],
body.host-admin-look input[type='radio'] { accent-color: var(--host-red); }
body.host-admin-look input:focus,
body.host-admin-look textarea:focus,
body.host-admin-look select:focus {
  border-color: var(--host-yellow) !important;
  outline: 2px solid rgba(255,195,41,.27) !important;
  outline-offset: 1px;
}
body.host-admin-look input[type='file'] { width: 100%; }
body.host-admin-look select option { background: #18110e; color: #fff; }

/* Botones de acción, diferenciando primarios, secundarios y destructivos */
body.host-admin-look button,
body.host-admin-look a.button {
  font-family: 'Barlow', Arial, sans-serif;
  font-weight: 800;
  border-radius: 10px;
  transition: filter .18s, transform .18s;
}
body.host-admin-look button:not(.secondary):not(.danger):not([data-tab]),
body.host-admin-look a.button:not(.yellow):not(.secondary) {
  background: var(--host-red) !important;
  color: white !important;
  border: 1px solid #f32930 !important;
}
body.host-admin-look button.secondary,
body.host-admin-look a.button.secondary {
  background: #342620 !important;
  color: #fff2ea !important;
  border: 1px solid #69503f !important;
}
body.host-admin-look button.danger {
  background: #94131b !important;
  color: #fff !important;
  border: 1px solid #c12c35 !important;
}
body.host-admin-look a.button.yellow,
body.host-admin-look > header a.button.yellow,
body.host-admin-look #host-contact-client {
  background: var(--host-yellow) !important;
  color: #19120e !important;
  border: 1px solid var(--host-yellow) !important;
}
body.host-admin-look button:hover:not(:disabled),
body.host-admin-look a.button:hover { filter: brightness(1.13); }
body.host-admin-look button:disabled { opacity: .40; cursor: not-allowed; }
body.host-admin-look button:focus-visible,
body.host-admin-look a:focus-visible {
  outline: 3px solid var(--host-yellow) !important;
  outline-offset: 3px;
}

/* Filas de categorías, productos, pedidos, clientes y recompensas */
body.host-admin-look #dashboard .item-row,
body.host-admin-look #dashboard .host-client,
body.host-admin-look #dashboard .redeem-row,
body.host-admin-look #dashboard .host-history {
  color: #fff0e8;
  border-bottom: 1px solid rgba(255, 169, 80, .20) !important;
}
body.host-admin-look #dashboard .item-row {
  padding: 13px 3px;
  gap: 12px;
}
body.host-admin-look #dashboard .item-row:hover,
body.host-admin-look #dashboard .host-client:hover {
  background: rgba(255, 128, 28, .055);
}
body.host-admin-look #dashboard .item-row .actions,
body.host-admin-look #dashboard .host-client .actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
body.host-admin-look #dashboard .item-row .actions button,
body.host-admin-look #dashboard .host-client .actions button {
  padding: 9px 12px;
  min-height: 37px;
}
body.host-admin-look #dashboard .item-row img {
  border-radius: 10px;
  border: 1px solid var(--host-line);
}
body.host-admin-look #dashboard #host-customer-detail .host-client-info {
  border-color: rgba(255, 179, 72, .34) !important;
  background: rgba(255, 117, 13, .045);
}
body.host-admin-look #dashboard #host-points-summary,
body.host-admin-look #dashboard #host-todos-status { color: var(--host-yellow); }
body.host-admin-look #dashboard #host-customers-list,
body.host-admin-look #dashboard #category-list,
body.host-admin-look #dashboard #product-list,
body.host-admin-look #dashboard #order-list,
body.host-admin-look #dashboard #host-canjes-rewards,
body.host-admin-look #dashboard #host-canjes-orders { margin-top: 14px; }
body.host-admin-look #dashboard .notice,
body.host-admin-look #setup.notice {
  background: rgba(255, 175, 36, .09) !important;
  border-color: rgba(255, 195, 41, .38) !important;
  color: #ffdea1 !important;
}
body.host-admin-look #login {
  width: min(460px, 100%);
  max-width: 460px;
  margin: clamp(25px,8vh,75px) auto;
  padding: clamp(22px, 4vw, 34px) !important;
}
body.host-admin-look #login input { width: 100%; }
body.host-admin-look #login-message { color: #ff8c88 !important; }
body.host-admin-look a { color: #ffd56b; }
body.host-admin-look hr { border-color: var(--host-line); }
body.host-admin-look #host-admin-mfa { background: rgba(30,15,12,.95); }

/* Tabletas: pestañas desplazables horizontalmente, sin romper el diseño */
@media (max-width: 1120px) {
  body.host-admin-look #dashboard .tabs {
    display: flex !important;
    flex-wrap: nowrap !important;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-color: #a43b26 #1d110d;
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;
  }
  body.host-admin-look #dashboard .tabs > button[data-tab] {
    flex: 0 0 160px;
    min-width: 160px;
    scroll-snap-align: start;
  }
}
@media (max-width: 680px) {
  body.host-admin-look > header { min-height: 66px; padding: 12px 18px !important; }
  body.host-admin-look > main { width: calc(100% - 24px); margin: 18px auto 40px !important; }
  body.host-admin-look #dashboard > .row:first-child { padding: 16px !important; }
  body.host-admin-look #dashboard > .row:first-child h1 { font-size: 27px !important; }
  body.host-admin-look #dashboard .tabs { padding: 8px !important; gap: 7px !important; }
  body.host-admin-look #dashboard .tabs > button[data-tab] { flex-basis: 148px; min-width: 148px; min-height: 55px; }
  body.host-admin-look #dashboard > .panel { padding: 16px !important; }
  body.host-admin-look #dashboard .item-row,
  body.host-admin-look #dashboard .host-client { flex-wrap: wrap; }
  body.host-admin-look #dashboard .item-row .actions button { font-size: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  body.host-admin-look *,
  body.host-admin-look *::before,
  body.host-admin-look *::after { transition: none !important; }
}

`;

  const ORDER = [
    'orders',       // Pedidos
    'points',       // Clientes y puntos
    'categories',   // Categorías
    'products',     // Productos
    'options',      // Opcionales
    'canjes',       // Recompensas y canjes
    'orden-todos'   // Orden de Todos
  ];

  function init() {
    // Un solo archivo: instalar la hoja de estilos HOST sin dependencias locales.
    if (!document.getElementById('host-admin-look-style')) {
      const style = document.createElement('style');
      style.id = 'host-admin-look-style';
      style.textContent = HOST_ADMIN_CSS;
      document.head.appendChild(style);
    }
    document.body.classList.add('host-admin-look');

    const tabs = document.querySelector('#dashboard .tabs');
    if (!tabs) return;

    function reorderTabs() {
      const buttons = Array.from(tabs.children).filter(
        el => el.matches('button[data-tab]')
      );

      // También conservamos futuras pestañas que pudieran agregarse.
      const ordered = buttons.slice().sort((a, b) => {
        const ai = ORDER.indexOf(a.dataset.tab);
        const bi = ORDER.indexOf(b.dataset.tab);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });

      if (buttons.every((button, i) => button === ordered[i])) return;

      // appendChild mueve el elemento: mantiene sus onclick y listeners.
      ordered.forEach(button => tabs.appendChild(button));
    }

    // Los módulos de puntos/canjes/orden pueden agregar pestañas después.
    const observer = new MutationObserver(reorderTabs);
    observer.observe(tabs, { childList: true });
    reorderTabs();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
