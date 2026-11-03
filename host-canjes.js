import { db, money, escapeHTML } from './shared.js';
import { getHostRewardsCredentials } from './loyalty.js';

const $ = s => document.querySelector(s);
const h = s => escapeHTML(String(s ?? ''));
const format = n => Number(n || 0).toLocaleString('es-AR');
let rewards = [];
let selectedId = null;
let subtotal = 0;

function account() {
  const el = $('#host-loyalty-account');
  return !!el && !el.hidden;
}
function points() {
  if (!account()) return 0;
  return Number(($('#host-loyalty-points')?.textContent || '0').replace(/[^0-9-]/g,'')) || 0;
}
export function getHostCanje() {
  if (!account()) return null;
  const reward = rewards.find(r => r.id === selectedId && r.active);
  return reward && points() >= reward.points_cost ? reward : null;
}
export function setHostCanjeSubtotal(n) {
  subtotal = Math.max(0, Number(n || 0));
  updatePreview();
}
export function getHostCanjeCredentials() {
  return getHostRewardsCredentials();
}

const style = document.createElement('style');
style.textContent = `
  #host-rewards-table{margin:22px auto 8px;max-width:620px;color:#fff;text-align:left}
  #host-rewards-table h3{color:#ffc329;margin:8px 0}
  #host-rewards-table table{width:100%;border-collapse:collapse;font-size:14px}
  #host-rewards-table th,#host-rewards-table td{padding:9px 5px;border-bottom:1px solid #4a3934}
  #host-rewards-table td:last-child{text-align:right;color:#ffc329;font-weight:800;white-space:nowrap}
  #host-canje-cart{margin:20px 0;padding:15px;border:1px solid #ad5b22;border-radius:12px;background:#1c100b;color:#fff}
  #host-canje-cart h3{margin:0 0 8px;color:#ffbd29}
  #host-canje-cart .host-canje-choice{display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #4c352d;cursor:pointer}
  #host-canje-cart input[type=radio]{flex:none;width:auto;accent-color:#ed171f}
  #host-canje-cart .host-canje-choice:has(input:disabled){opacity:.48;cursor:not-allowed}
  #host-canje-cart small{display:block;font-size:12px;color:#c5bcb9;margin-top:4px}
  #host-canje-preview{font-weight:800;color:#ffbd29;margin-top:12px}
  #host-canje-message{font-size:12px;color:#f8c582}
`;
document.head.append(style);

const catalog = document.createElement('div');
catalog.id = 'host-rewards-table';
const loyaltyCard = $('.host-loyalty-card');
if (loyaltyCard) loyaltyCard.append(catalog);

const cartBox = document.createElement('div');
cartBox.id = 'host-canje-cart';
const checkout = $('#checkout');
if (checkout) {
  const send = $('#send') || checkout.querySelector('[type=submit]');
  if (send) send.before(cartBox);
  else checkout.append(cartBox);
}

function tableRender() {
  if (!catalog.isConnected) return;
  catalog.innerHTML = `<h3>🎁 TABLA DE RECOMPENSAS</h3>
    <p style="font-size:13px;color:#bbb">Por cada $10.000 de compra confirmada ganás 10 puntos.</p>
    <table><thead><tr><th>Premio</th><th>Puntos</th></tr></thead><tbody>
    ${rewards.map(r => `<tr><td>${h(r.name)}</td><td>${format(r.points_cost)} pts</td></tr>`).join('')}
    </tbody></table>
    <small>Un canje por compra. Los canjes se acreditan al confirmar y se devuelven si se cancela.</small>`;
}
function cartRender() {
  if (!cartBox.isConnected) return;
  const activePoints = points();
  const isLogged = account();
  if (selectedId && !getHostCanje()) selectedId = null;
  cartBox.innerHTML = `<h3>🔥 UTILIZAR MIS PUNTOS</h3>
    <p style="font-size:13px">${isLogged
      ? `Tu saldo: <strong>${format(activePoints)} puntos</strong>`
      : 'Iniciá sesión en HOST PUNTOS para canjear premios. También podés continuar sin canjear.'}</p>
    ${!isLogged ? `<button type="button" class="secondary" id="host-go-points">Ingresar / registrarme</button>` : ''}
    <label class="host-canje-choice"><input type="radio" name="host_reward" value="" ${selectedId === null ? 'checked' : ''}>
      <span>No usar puntos en este pedido</span></label>
    ${rewards.map(r => `<label class="host-canje-choice">
      <input type="radio" name="host_reward" value="${h(r.id)}"
        ${selectedId === r.id ? 'checked' : ''}
        ${(!isLogged || activePoints < r.points_cost) ? 'disabled' : ''}>
      <span>${h(r.name)} <small>${format(r.points_cost)} pts · ${activePoints < r.points_cost ? 'Te faltan ' + format(r.points_cost-activePoints) + ' puntos' : 'Disponible'}</small></span>
      </label>`).join('')}
    <div id="host-canje-preview"></div>
    <p id="host-canje-message">Los puntos se reservan al registrar el pedido y se devuelven si HOST lo cancela. En premios con sabores o piezas a elección, aclaralos en Observaciones.</p>`;
  $('#host-go-points')?.addEventListener('click', () => {
    $('#host-tab-login')?.click();
    $('#puntos')?.scrollIntoView({behavior:'smooth',block:'start'});
  });
  cartBox.querySelectorAll('input[name=host_reward]').forEach(r => {
    r.addEventListener('change', () => {
      selectedId = r.value || null;
      updatePreview();
    });
  });
  updatePreview();
}
function updatePreview() {
  const target = $('#host-canje-preview');
  if (!target) return;
  const reward = getHostCanje();
  if (!reward) {
    target.textContent = `Total sin canje: ${money(subtotal)}`;
    return;
  }
  const discount = reward.kind === 'discount'
    ? Math.round(subtotal * Number(reward.discount_percent) / 100 * 100) / 100
    : 0;
  target.textContent = reward.kind === 'discount'
    ? `Descuento: −${money(discount)} · Total estimado: ${money(subtotal - discount)}`
    : `Premio gratis: ${reward.name} · Pedido: ${money(subtotal)}`;
}

async function load() {
  const {data,error} = await db.from('host_rewards_catalog')
    .select('id,name,kind,points_cost,discount_percent,active,position')
    .eq('active',true).order('position');
  if (error) {
    if (catalog.isConnected) catalog.textContent = 'No se pudieron cargar las recompensas: ' + error.message;
    return;
  }
  rewards = data || [];
  tableRender(); cartRender();
}
const accountEl = $('#host-loyalty-account');
if (accountEl) {
  new MutationObserver(cartRender).observe(accountEl, {attributes:true,attributeFilter:['hidden']});
}
const balanceEl = $('#host-loyalty-points');
if (balanceEl) new MutationObserver(cartRender).observe(balanceEl,{childList:true,characterData:true,subtree:true});
load().catch(error => { console.error('HOST recompensas:',error); });

export async function registerHostRedeemedOrder({reward, phone, code, name, delivery, address, notes, payment, cashAmount, items}) {
  if (!reward || !phone || !code) throw Error('Iniciá sesión para canjear puntos.');
  const {data,error} = await db.rpc('host_rewards_checkout', {
    p_phone: phone, p_code: code, p_reward_id: reward.id,
    p_customer_name: name, p_delivery_type: delivery,
    p_address: address, p_notes: notes, p_payment: payment,
    p_cash_amount: cashAmount, p_items: items
  });
  if (error) throw error;
  if (data?.error) throw Error(data.error);
  if (data?.points_remaining !== undefined && $('#host-loyalty-points')) {
    $('#host-loyalty-points').textContent = String(data.points_remaining);
  }
  selectedId = null;
  cartRender();
  return data;
}
