import { db, escapeHTML, money } from '../shared.js';
const $ = s => document.querySelector(s);
const h = v => escapeHTML(String(v ?? ''));
const dashboard = $('#dashboard');
const tabs = dashboard?.querySelector('.tabs');
if (dashboard && tabs && !$('#canjes-panel')) {
  const tab = document.createElement('button');
  tab.type='button'; tab.dataset.tab='canjes'; tab.textContent='🎁 Recompensas y canjes';
  tabs.append(tab);
  const panel = document.createElement('section');
  panel.id='canjes-panel';panel.className='panel hidden';
  panel.innerHTML=`<h2>🎁 Recompensas y canjes</h2>
    <p class="muted">Editá los puntos de cada premio. Los descuentos se aplican en el carrito. Los canjes se reservan al iniciar el pedido.</p>
    <p id="host-canjes-feedback" role="status"></p>
    <div id="host-canjes-rewards"></div>
    <h3 style="margin-top:26px">Crear recompensa</h3>
    <form id="host-canjes-new" style="display:flex;flex-wrap:wrap;gap:8px;align-items:end">
      <label>Nombre <input name="name" required placeholder="Premio nuevo"></label>
      <label>Tipo <select name="kind"><option value="product">Producto</option><option value="discount">Descuento</option></select></label>
      <label>Puntos <input name="points" type="number" min="1" required></label>
      <label>Descuento % <input name="percent" type="number" min="0" max="100" value="0"></label>
      <button type="submit">Crear</button>
    </form>
    <h3 style="margin-top:30px">Solicitudes de canje</h3>
    <p class="muted">Al confirmar el pedido en Pedidos, el canje pasa a completado. Al cancelarlo, los puntos vuelven al cliente.</p>
    <div id="host-canjes-orders"></div>`;
  dashboard.append(panel);
  const style = document.createElement('style');
  style.textContent=`
    #host-canjes-rewards .redeem-row,#host-canjes-orders .redeem-row{
      display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:12px 0;border-bottom:1px solid #555}
    #host-canjes-rewards .redeem-row .grow,#host-canjes-orders .redeem-row .grow{flex:1;min-width:160px}
    #host-canjes-rewards .redeem-row input[type=number]{width:85px}
    #host-canjes-rewards .redeem-row label{display:flex;gap:4px;align-items:center}
    #host-canjes-feedback{color:#ffbb29}
  `;
  document.head.append(style);
  let rewards=[],redemptions=[],customers=[],orders=[];
  let shown=false;
  const message = value => {$('#host-canjes-feedback').textContent=String(value||'');};
  async function authorize(){
    const {data:{user},error}=await db.auth.getUser();
    if(error || !user) throw Error('Iniciá sesión en el administrador.');
    const {data, error:e}=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
    if(e||!data)throw Error('No tenés permisos de administrador.');
  }
  function render(){
    $('#host-canjes-rewards').innerHTML=rewards.map(r=>`
      <div class="redeem-row" data-reward="${h(r.id)}">
        <div class="grow"><strong>${h(r.name)}</strong><br><small>${r.kind==='discount'?'Descuento '+r.discount_percent+'%':'Producto gratis'}</small></div>
        <label>Pts <input type="number" class="r-points" min="1" value="${r.points_cost}"></label>
        <label>Activo <input type="checkbox" class="r-active" ${r.active?'checked':''} style="width:auto"></label>
        <button type="button" class="secondary r-save">Guardar</button>
      </div>`).join('')||'<p>No hay recompensas.</p>';
    $('#host-canjes-rewards').querySelectorAll('[data-reward]').forEach(row=>{
      row.querySelector('.r-save').onclick=async()=>{
        const id=row.dataset.reward;
        const points=Number(row.querySelector('.r-points').value);
        if(!Number.isInteger(points)||points<1)return alert('Ingresá puntos válidos.');
        try{
          const {error}=await db.from('host_rewards_catalog')
            .update({points_cost:points,active:row.querySelector('.r-active').checked}).eq('id',id);
          if(error)throw error; await reload();message('Recompensa guardada.');
        }catch(e){message(e.message);}
      };
    });
    const byCustomer=new Map(customers.map(c=>[c.id,c]));
    const byOrder=new Map(orders.map(o=>[o.id,o]));
    $('#host-canjes-orders').innerHTML=redemptions.map(r=>{
      const c=byCustomer.get(r.customer_id);
      const o=byOrder.get(r.order_id);
      return `<div class="redeem-row">
        <div class="grow"><strong>${h(r.reward_name)}</strong><br>
          <small>${h(c?.name || 'Cliente')} · ${h(c?.phone||'')} · ${new Date(r.created_at).toLocaleString('es-AR')}</small><br>
          <small>Pedido ${h(r.order_id.slice(0,8).toUpperCase())} · ${h(o?.status||r.status)} · ${money(o?.total||0)}</small></div>
        <strong>${r.points_cost} pts · ${r.status==='reserved'?'Pendiente':r.status==='completed'?'Confirmado':'Cancelado'}</strong>
        ${r.status==='reserved'?`<button type="button" class="secondary" data-cancel="${h(r.order_id)}">Cancelar pedido y devolver puntos</button>`:''}
      </div>`;
    }).join('')||'<p class="muted">Todavía no hay canjes.</p>';
    $('#host-canjes-orders').querySelectorAll('[data-cancel]').forEach(b=>{
      b.onclick=async()=>{
        if(!confirm('¿Cancelar este pedido completo? Se devolverán los puntos y no se enviará el pedido.'))return;
        try{
          const {error}=await db.from('orders').update({status:'cancelado'}).eq('id',b.dataset.cancel);
          if(error)throw error;await reload();message('Pedido cancelado. Puntos liberados.');
        }catch(e){message(e.message);}
      };
    });
  }
  async function reload(){
    message('Cargando recompensas...');
    try{
      await authorize();
      const [r,x,c,o]=await Promise.all([
        db.from('host_rewards_catalog').select('*').order('points_cost', { ascending: true }),

        db.from('host_redemptions').select('*').order('created_at',{ascending:false}).limit(500),
        db.from('host_customers').select('id,name,phone').limit(1000),
        db.from('orders').select('id,status,total').order('created_at',{ascending:false}).limit(1000)
      ]);
      for(const result of [r,x,c,o])if(result.error)throw result.error;
      rewards=r.data||[];redemptions=x.data||[];customers=c.data||[];orders=o.data||[];
      message('');render();
    }catch(e){message('Error: '+e.message);}
  }
  $('#host-canjes-new').onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.target);
    const kind=String(f.get('kind'));
    const points=Number(f.get('points'));
    const discount_percent=Number(f.get('percent'));
    const name=String(f.get('name')||'').trim();
    if(!Number.isInteger(points)||points<1||name.length<2){message('Revisá nombre y puntos.');return;}
    if(kind==='discount' && (!Number.isInteger(discount_percent)||discount_percent<1||discount_percent>100)){
      message('Los descuentos deben tener porcentaje entre 1 y 100.');return;
    }
    try{
      const code='custom_'+Date.now()+'_'+Math.floor(Math.random()*100000);
      const {error}=await db.from('host_rewards_catalog').insert({
        code,name,kind,points_cost:points,
        discount_percent:kind==='discount'?discount_percent:0,
        position:rewards.length+1,active:true
      });
      if(error)throw error;e.target.reset();await reload();message('Recompensa creada.');
    }catch(err){message(err.message);}
  };
  tabs.querySelectorAll('[data-tab]').forEach(b=>{
    if(b!==tab)b.addEventListener('click',()=>panel.classList.add('hidden'));
  });
  tab.onclick=()=>{
    tabs.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===tab));
    for(const x of ['categories','products','options','orders','points'])$('#'+x+'-panel')?.classList.add('hidden');
    panel.classList.remove('hidden');reload();
  };
}
