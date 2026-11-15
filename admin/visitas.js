// HOST | Visitas diarias al menú. Solo administradores con MFA AAL2.
import { db, escapeHTML } from '../shared.js';

const dashboard = document.getElementById('dashboard');
const tabs = dashboard?.querySelector('.tabs');
const h = value => escapeHTML(String(value ?? ''));
const number = n => (Number(n) || 0).toLocaleString('es-AR');
const displayDay = day => new Date(day + 'T12:00:00Z').toLocaleDateString(
  'es-AR', { timeZone:'UTC', weekday:'short', day:'numeric', month:'short' }
);
let days = 30;
let rows = [];
let busy = false;

if (dashboard && tabs && !document.getElementById('host-visitas-panel')) {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.dataset.tab = 'visitas';
  tab.textContent = '📊 Visitas';
  tabs.append(tab);

  const panel = document.createElement('section');
  panel.id = 'host-visitas-panel';
  panel.className = 'panel hidden';
  panel.innerHTML = `
    <h2>📊 Visitas al menú de HOST</h2>
    <p class="muted">
      Consultá cuántas veces se abrió el menú cada día y cuántos
      navegadores diferentes ingresaron. Horario de Argentina.
    </p>
    <div class="host-visitas-controls">
      <label>Período
        <select id="host-visitas-days">
          <option value="7">Últimos 7 días</option>
          <option value="30" selected>Últimos 30 días</option>
          <option value="90">Últimos 90 días</option>
        </select>
      </label>
      <button id="host-visitas-refresh" type="button" class="secondary">Actualizar</button>
    </div>
    <p id="host-visitas-status" role="status" aria-live="polite"></p>
    <div id="host-visitas-summary" class="host-visitas-summary"></div>
    <h3>Visitas por día</h3>
    <div id="host-visitas-bars" class="host-visitas-bars"></div>
    <p class="muted host-visitas-note">
      «Visitas» cuenta las aperturas del menú, incluso repetidas.
      «Visitantes estimados» cuenta navegadores distintos por día,
      no personas identificadas. Una persona con dos dispositivos
      puede contarse dos veces; el bloqueo de scripts puede reducir el registro.
      Solo contamos desde que se instaló esta función.
    </p>
  `;
  dashboard.append(panel);

  const css = document.createElement('style');
  css.textContent = `
    #host-visitas-panel .host-visitas-controls{display:flex;flex-wrap:wrap;align-items:end;gap:12px;margin:15px 0}
    #host-visitas-panel .host-visitas-controls label{display:flex;flex-direction:column;gap:6px;max-width:230px}
    #host-visitas-status{min-height:20px;color:#ffbf2b}
    #host-visitas-panel .host-visitas-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px;margin:16px 0}
    #host-visitas-panel .host-visitas-stat{background:#291813;border:1px solid #694333;border-radius:12px;padding:16px}
    #host-visitas-panel .host-visitas-stat small{display:block;color:#cec1b5;margin-bottom:8px}
    #host-visitas-panel .host-visitas-stat strong{display:block;color:#ffc329;font-size:clamp(22px,3vw,30px);font-weight:900;line-height:1.1}
    #host-visitas-panel .host-visitas-bars{max-height:590px;overflow:auto;border:1px solid #674532;border-radius:12px;padding:8px 14px;background:rgba(255,255,255,.025)}
    #host-visitas-panel .host-visitas-bar-row{display:grid;grid-template-columns:116px minmax(110px,1fr) 100px;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.09)}
    #host-visitas-panel .host-visitas-bar-row:last-child{border:0}
    #host-visitas-panel .host-visitas-day{color:#eee;font-size:13px}
    #host-visitas-panel .host-visitas-track{height:12px;background:#372521;border-radius:9px;overflow:hidden}
    #host-visitas-panel .host-visitas-fill{height:100%;min-width:0;background:linear-gradient(90deg,#ed171f,#ffc329);border-radius:9px}
    #host-visitas-panel .host-visitas-count{text-align:right;color:#ffc329;font-size:13px;font-weight:800}
    #host-visitas-panel .host-visitas-count small{display:block;color:#bfb4ae;font-size:10px;font-weight:500}
    #host-visitas-panel .host-visitas-note{font-size:12px;line-height:1.5;margin-top:15px}
    @media(max-width:560px){
      #host-visitas-panel .host-visitas-bar-row{grid-template-columns:83px minmax(50px,1fr) 77px;gap:7px}
      #host-visitas-panel .host-visitas-day{font-size:11px}
      #host-visitas-panel .host-visitas-count{font-size:11px}
    }
  `;
  document.head.append(css);

  const status = text => {
    const target = document.getElementById('host-visitas-status');
    if (target) target.textContent = text || '';
  };
  const stat = (name,value) => `<div class="host-visitas-stat">
    <small>${h(name)}</small><strong>${number(value)}</strong>
  </div>`;

  function render() {
    const first = rows[0] || {visits:0,visitors:0};
    const second = rows[1] || {visits:0,visitors:0};
    const totalViews = rows.reduce((sum,r)=>sum+Number(r.visits || 0),0);
    document.getElementById('host-visitas-summary').innerHTML = [
      stat('Visitas hoy',first.visits),
      stat('Visitantes estimados hoy',first.visitors),
      stat('Visitantes estimados ayer',second.visitors),
      stat(`Visitas últimos ${days} días`,totalViews)
    ].join('');

    const maximum = Math.max(1,...rows.map(row=>Number(row.visits)||0));
    const area = document.getElementById('host-visitas-bars');
    area.innerHTML = rows.map(row=>{
      const views=Number(row.visits)||0;
      const visitors=Number(row.visitors)||0;
      const percent=Math.max(0,Math.min(100,views/maximum*100));
      return `<div class="host-visitas-bar-row">
        <div class="host-visitas-day">${h(displayDay(row.date))}</div>
        <div class="host-visitas-track" aria-hidden="true">
          <div class="host-visitas-fill" style="width:${percent.toFixed(1)}%"></div>
        </div>
        <div class="host-visitas-count">${number(views)} visitas
          <small>${number(visitors)} diferentes</small>
        </div>
      </div>`;
    }).join('') || '<p class="muted">Todavía no hay registros.</p>';
  }

  async function load() {
    if (busy) return;
    busy=true;
    status('Cargando estadísticas...');
    try {
      const {data,error}=await db.rpc('host_admin_menu_visits',{p_days:days});
      if (error) throw error;
      if (!Array.isArray(data)) throw Error('No se recibieron las estadísticas.');
      rows=data;
      render();
      status('');
    } catch(error) {
      status('No se pudieron cargar las visitas. Iniciá sesión y verificá la doble autenticación. ' + (error?.message||''));
    } finally {
      busy=false;
    }
  }

  document.getElementById('host-visitas-days').addEventListener('change', e=>{
    days=Number(e.target.value)||30;
    load();
  });
  document.getElementById('host-visitas-refresh').addEventListener('click',load);

  tabs.querySelectorAll('[data-tab]').forEach(other=>{
    if(other!==tab)other.addEventListener('click',()=>panel.classList.add('hidden'));
  });
  tab.addEventListener('click',()=>{
    tabs.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===tab));
    [...dashboard.children].filter(el=>el.classList.contains('panel')).forEach(el=>el.classList.add('hidden'));
    panel.classList.remove('hidden');
    load();
  });
}
