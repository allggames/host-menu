import {db,money,escapeHTML,uid,alertError} from './shared.js';
import {configured,WHATSAPP_NUMBER} from './config.js';
const $=s=>document.querySelector(s);let categories=[],products=[],active='all';const cart=new Map();let optionGroups=[],optionValues=[],productLinks=[];
if(!configured)$('#setup').classList.remove('hidden');else load().catch(alertError);
async function load(){const [c,p,g,v,l]=await Promise.all([db.from('categories').select('*').order('position'),db.from('products').select('*').eq('available',true).order('position'),db.from('option_groups').select('*').order('position'),db.from('option_values').select('*').order('position'),db.from('product_option_groups').select('*').order('position')]);if(c.error)throw c.error;if(p.error)throw p.error;for(const x of [g,v,l])if(x.error)throw x.error;optionGroups=g.data;optionValues=v.data;productLinks=l.data;categories=c.data;products=p.data;render();}
function render(){const cat=$('#categories');cat.replaceChildren();[['all','Todos'],...categories.map(c=>[c.id,c.name])].forEach(([id,name])=>{let b=document.createElement('button');b.textContent=name;b.className=active===id?'active':'';b.onclick=()=>{active=id;render()};cat.append(b)});$('#products').innerHTML=products.filter(p=>active==='all'||p.category_id===active).map(p=>`<article class="product">${p.image_url?`<img src="${escapeHTML(p.image_url)}" alt="${escapeHTML(p.name)}" loading="lazy">`:'<div class="placeholder">🍗</div>'}<h3>${escapeHTML(p.name)}</h3><p class="muted">${escapeHTML(p.description)}</p><div class="price">${money(p.price)}</div><button data-add="${p.id}">Agregar +</button></article>`).join('')||'<p>No hay productos en esta categoría.</p>';document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{const id=b.dataset.add;chooseOptions(id)});renderCart();}

function chooseOptions(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;

  const gs = productLinks
    .filter(l => l.product_id === id)
    .map(l => optionGroups.find(g => g.id === l.group_id))
    .filter(Boolean);

  if (!gs.length) {
    addConfigured(p, []);
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'option-overlay';

  overlay.innerHTML = `
    <div class="option-dialog" role="dialog" aria-modal="true">
      <div class="row">
        <h2 class="grow">${escapeHTML(p.name)}</h2>
        <button type="button" class="secondary" id="close-options">✕</button>
      </div>

      <p class="muted">Personalizá tu pedido</p>

      <form id="choose-form">
        ${gs.map(g => {
          const min = Number(g.min_select);
          const max = Number(g.max_select);

          return `
            <fieldset
              data-option-group="${g.id}"
              data-min="${min}"
              data-max="${max}"
            >
              <legend>
                <strong>${escapeHTML(g.name)}</strong>
                <small>
                  ${min === max
                    ? `Elegí ${min}`
                    : `Elegí entre ${min} y ${max}`}
                </small>
              </legend>

              ${optionValues
                .filter(v => v.group_id === g.id)
                .map(v => `
                  <label class="option-choice">
                    <input
                      style="width:auto"
                      type="${max === 1 ? 'radio' : 'checkbox'}"
                      name="group_${g.id}"
                      value="${v.id}"
                    >
                    ${escapeHTML(v.name)}
                    ${Number(v.extra_price)
                      ? `(+${money(v.extra_price)})`
                      : '(sin cargo)'}
                  </label>
                `).join('') ||
                '<p>No hay opciones disponibles</p>'}

              <p class="muted selection-status"></p>
            </fieldset>
          `;
        }).join('')}

        <button type="submit" id="confirm-options">
          Agregar al carrito
        </button>
      </form>
    </div>
  `;

  document.body.append(overlay);

  const form = overlay.querySelector('#choose-form');
  const submitButton = overlay.querySelector('#confirm-options');

  // Controlar mínimos y máximos de cada grupo.
  function updateSelections() {
    let allValid = true;

    for (const g of gs) {
      const fieldset = [...form.querySelectorAll(
        '[data-option-group]'
      )].find(el => el.dataset.optionGroup === String(g.id));

      if (!fieldset) continue;

      const min = Number(g.min_select);
      const max = Number(g.max_select);

      const inputs = [
        ...fieldset.querySelectorAll('input')
      ];

      const checked = inputs.filter(input => input.checked);
      const count = checked.length;

      // Al alcanzar el máximo, bloquear las
      // opciones que todavía no estén marcadas.
      inputs.forEach(input => {
        input.disabled = !input.checked && count >= max;
      });

      const status = fieldset.querySelector(
        '.selection-status'
      );

      status.textContent =
        `${count} de ${max} seleccionadas` +
        (count < min
          ? ` · Elegí al menos ${min}`
          : '');

      if (count < min || count > max) {
        allValid = false;
      }
    }

    // No permitir agregar al carrito si falta
    // completar algún grupo obligatorio.
    submitButton.disabled = !allValid;

    return allValid;
  }

  // Actualizar los límites cada vez que el
  // cliente marca o desmarca una opción.
  form.addEventListener('change', e => {
    if (e.target.matches('input[type="checkbox"], input[type="radio"]')) {
      updateSelections();
    }
  });

  // Estado inicial.
  updateSelections();

  // Cerrar ventana.
  overlay.querySelector('#close-options').onclick = () => {
    overlay.remove();
  };

  overlay.onclick = e => {
    if (e.target === overlay) overlay.remove();
  };

  // Confirmar selección.
  form.onsubmit = e => {
    e.preventDefault();

    if (!updateSelections()) {
      alert('Completá las opciones obligatorias.');
      return;
    }

    const selected = [];

    for (const g of gs) {
      const picked = [
        ...form.querySelectorAll(
          `[name="group_${g.id}"]:checked`
        )
      ];

      if (
        picked.length < Number(g.min_select) ||
        picked.length > Number(g.max_select)
      ) {
        alert(
          `En ${g.name} elegí entre ` +
          `${g.min_select} y ${g.max_select} opciones`
        );
        return;
      }

      selected.push(...picked.map(input => {
        const v = optionValues.find(
          o => o.id === input.value
        );

        return {
          id: v.id,
          group: g.name,
          name: v.name,
          extra_price: Number(v.extra_price)
        };
      }));
    }

    addConfigured(p, selected);
    overlay.remove();
  };
}

function addConfigured(p,selected){let key=p.id+'|'+selected.map(o=>o.id).sort().join(','),existing=cart.get(key);cart.set(key,{id:p.id,quantity:(existing?.quantity||0)+1,selected});renderCart()}
function renderCart(){let entries=[...cart];$('#cart').innerHTML=entries.map(([key,item])=>{let p=products.find(x=>x.id===item.id);if(!p)return '';let unit=Number(p.price)+item.selected.reduce((s,x)=>s+x.extra_price,0);return `<div class="item-row"><div><strong>${escapeHTML(p.name)}</strong><br>${item.selected.map(o=>`${escapeHTML(o.group)}: ${escapeHTML(o.name)}`).join('<br>')}${item.selected.length?'<br>':''}${item.quantity} × ${money(unit)} = ${money(item.quantity*unit)}</div><div class="actions"><button class="secondary" data-minus="${key}">−</button><button data-plus="${key}">+</button></div></div>`}).join('')||'<p class="muted">Tu carrito está vacío.</p>';$('#total').textContent=money(entries.reduce((s,[,item])=>{let p=products.find(x=>x.id===item.id);return s+item.quantity*(Number(p?.price||0)+item.selected.reduce((n,x)=>n+x.extra_price,0))},0));document.querySelectorAll('[data-minus]').forEach(b=>b.onclick=()=>{let k=b.dataset.minus,item=cart.get(k);item.quantity--;if(!item.quantity)cart.delete(k);renderCart()});document.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>{cart.get(b.dataset.plus).quantity++;renderCart()})}
$('#payment').onchange=()=>{$('#cash-wrap').classList.toggle('hidden',$('#payment').value!=='Efectivo');if($('#payment').value!=='Efectivo')$('#cash_amount').value=''};
$('#delivery').onchange=()=>{$('#address-wrap').classList.toggle('hidden',$('#delivery').value!=='Delivery');$('#address').required=$('#delivery').value==='Delivery'};
$('#checkout').onsubmit=async e=>{e.preventDefault();if(!configured)return alert('Falta configurar Supabase');if(!cart.size)return alert('Agregá al menos un producto');if(!/^\d{10,15}$/.test(WHATSAPP_NUMBER))return alert('HOST todavía no configuró su número de WhatsApp');const btn=$('#send');btn.disabled=true;const f=new FormData(e.target),items=[...cart].map(([,item])=>{let p=products.find(x=>x.id===item.id),price=Number(p.price)+item.selected.reduce((n,x)=>n+x.extra_price,0);return {product_id:item.id,name:p.name,price,quantity:item.quantity,options:item.selected}}),total=items.reduce((s,p)=>s+p.price*p.quantity,0),orderId=uid(),name=String(f.get('name')).trim(),delivery=f.get('delivery'),address=String(f.get('address')||'').trim(),notes=String(f.get('notes')||'').trim(),payment=String(f.get('payment')||''),cashAmount=payment==='Efectivo'&&f.get('cash_amount')!==''?Number(f.get('cash_amount')):null;if(!['Efectivo','Transferencia / Mercado Pago'].includes(payment)){btn.disabled=false;return alert('Seleccioná una forma de pago')}if(cashAmount!==null&&(!Number.isFinite(cashAmount)||cashAmount<total)){btn.disabled=false;return alert('El efectivo indicado debe alcanzar el total del pedido')}const paymentNotes=`Forma de pago: ${payment}${cashAmount!==null?` | Abona con: ${money(cashAmount)} | Vuelto: ${money(cashAmount-total)}`:''}`;const storedNotes=[paymentNotes,notes].filter(Boolean).join('\n');const message=[`🍗 *PEDIDO HOST*`,`Código: ${orderId.slice(0,8).toUpperCase()}`,`Cliente: ${name}`,`Entrega: ${delivery}`,`Pago: ${payment}`,...(cashAmount!==null?[`Abona con: ${money(cashAmount)}`,`Vuelto: ${money(cashAmount-total)}`]:[]),...(address?[`Dirección: ${address}`]:[]),'',...items.map(p=>`• ${p.quantity} × ${p.name} — ${money(p.quantity*p.price)}`),'',`*TOTAL: ${money(total)}*`,...(notes?[`Observaciones: ${notes}`]:[])].join('\n');const url=`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;const win=window.open('about:blank','_blank');try{const {error}=await db.from('orders').insert({id:orderId,customer_name:name,delivery_type:delivery,address,notes:storedNotes,items,total,status:'iniciado_whatsapp'});if(error)throw error;$('#checkout-status').textContent='Pedido registrado como iniciado. Confirmalo enviando el mensaje en WhatsApp.';cart.clear();renderCart();if(win)win.location.href=url;else window.location.href=url;}catch(err){if(win)win.close();alertError(err)}finally{btn.disabled=false}};
