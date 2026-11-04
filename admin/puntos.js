import { db, escapeHTML } from '../shared.js';

const panelHost = document.querySelector('#dashboard');
const tabs = panelHost?.querySelector('.tabs');
const h = v => escapeHTML(String(v ?? ''));
const $ = id => document.getElementById(id);
let clients = [], purchases = [], adjustments = [], redemptions = [], selectedId = null;
const fmt = n => Number(n||0).toLocaleString('es-AR');
const date = v => v ? new Date(v).toLocaleDateString('es-AR') : '-';

if (panelHost && tabs && !$('points-panel')) {
  const tab = document.createElement('button');
  tab.dataset.tab='points'; tab.type='button'; tab.textContent='⭐ Clientes y puntos';
  tabs.append(tab);
  const panel=document.createElement('div');
  panel.className='panel hidden';panel.id='points-panel';
  panel.innerHTML=`<h2>⭐ Clientes y puntos</h2>
    <p class="muted">Buscá clientes, consultá o cambiá sus códigos y registrá ajustes de puntos.</p>
    <div id="host-points-summary" style="margin:12px 0;font-weight:bold"></div>
    <div class="row" style="gap:10px;margin:16px 0;flex-wrap:wrap">
      <input id="host-search" class="grow" type="search" placeholder="Nombre o celular">
      <button type="button" class="secondary" id="host-refresh">Actualizar</button>
    </div>
    <p id="host-admin-feedback" role="status"></p>
    <div id="host-customers-list"></div>
    <div id="host-customer-detail"></div>`;
  panelHost.append(panel);
  const style=document.createElement('style');
  style.textContent=`
    #host-customers-list .host-client{display:flex;align-items:center;justify-content:space-between;
      flex-wrap:wrap;gap:10px;border-bottom:1px solid #666;padding:12px 0}
    #host-customer-detail{margin-top:18px}
    #host-customer-detail .host-client-info{border:1px solid #777;border-radius:10px;padding:18px}
    #host-customer-detail .host-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
    #host-customer-detail .host-history{display:flex;gap:12px;justify-content:space-between;
      padding:10px 0;border-bottom:1px solid #555}
    #host-admin-feedback{color:#d99800;min-height:18px}
  `;
  document.head.append(style);
  const message = x => { $('host-admin-feedback').textContent = String(x||''); };

  async function authorize() {
    const { data:{user}, error } = await db.auth.getUser();
    if(error || !user) throw Error('Ingresá al administrador primero.');
    const result=await db.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
    if(result.error || !result.data) throw Error('Tu cuenta no tiene permiso de administrador.');
  }
  const call = async (method, params) => {
    const {data,error} = await db.rpc(method,params);
    if(error) throw error;
    if(data?.error) throw Error(data.error);
    return data;
  };
  const pointTotal = id => purchases.filter(x=>x.customer_id===id).reduce((s,x)=>s+Number(x.points),0)
    +adjustments.filter(x=>x.customer_id===id).reduce((s,x)=>s+Number(x.delta),0)
    -redemptions.filter(x=>x.customer_id===id && x.status!=='canceled')
      .reduce((s,x)=>s+Number(x.points_cost),0);
  function render() {
    $('host-points-summary').textContent = `${clients.length} clientes · ${fmt(clients.reduce((s,c)=>s+pointTotal(c.id),0))} puntos`;
    const q=$('host-search').value.trim().toLowerCase();
    const found=clients.filter(c=>(c.name+' '+c.phone).toLowerCase().includes(q));
    $('host-customers-list').innerHTML=found.map(c=>`
      <div class="host-client"><div><strong>${h(c.name)}</strong><br><small>${h(c.phone)} ${!c.access_code_encrypted?'· Sin registro':c.access_approved?'· Cuenta activa':'· Pendiente de aprobación'}</small></div>
      <div class="actions"><strong>${fmt(pointTotal(c.id))} pts</strong>
      <button type="button" class="secondary" data-client="${h(c.id)}">Administrar</button></div></div>
    `).join('')||'<p class="muted">No se encontraron clientes.</p>';
    $('host-customers-list').querySelectorAll('[data-client]').forEach(b=>{
      b.onclick=()=>{selectedId=b.dataset.client;renderDetail();};
    });
    renderDetail();
  }
  function renderDetail() {
    const c=clients.find(x=>x.id===selectedId);
    const target=$('host-customer-detail');
    if(!c) {target.innerHTML='';return;}
    const history=[
      ...purchases.filter(x=>x.customer_id===c.id).map(x=>({created_at:x.credited_at,reason:'Compra confirmada',delta:x.points})),
      ...adjustments.filter(x=>x.customer_id===c.id).map(x=>({created_at:x.created_at,reason:x.reason,delta:x.delta})),
      ...redemptions.filter(x=>x.customer_id===c.id && x.status!=='canceled')
        .map(x=>({created_at:x.created_at,reason:'Canje: '+x.reward_name+(x.status==='reserved'?' (pendiente)':''),delta:-x.points_cost}))
    ].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    target.innerHTML=`<div class="host-client-info">
      <div class="row"><div class="grow"><h3>${h(c.name)}</h3><p>${h(c.phone)}</p>
      <h3>${fmt(pointTotal(c.id))} puntos</h3></div>
      <button type="button" id="host-close-detail" class="secondary">Cerrar</button></div>
      <div class="host-actions">
        ${!c.access_approved && c.access_code_encrypted ? '<button type="button" id="host-approve">✅ Aprobar registro</button>' : ''}
        <button type="button" id="host-see-code" class="secondary">👁 Ver código</button>
        <button type="button" id="host-reset-code" class="secondary">🔑 Cambiar código</button>
        <button type="button" id="host-adjust-points">+ / − Puntos</button>
        <a id="host-contact-client" class="button yellow" target="_blank" rel="noopener"
          href="https://wa.me/${encodeURIComponent(c.phone.replace(/\D/g,''))}">WhatsApp</a>
      </div>
      <p id="host-private-code" style="font-weight:bold"></p>
      <h3>Historial</h3>
      ${history.map(x=>`<div class="host-history"><span>${h(x.reason)} · ${date(x.created_at)}</span>
        <strong>${Number(x.delta)>0?'+':''}${fmt(x.delta)} pts</strong></div>`).join('')||'<p class="muted">Sin movimientos.</p>'}
      </div>`;
    $('host-close-detail').onclick=()=>{selectedId=null;renderDetail();};
    if ($('host-approve')) $('host-approve').onclick=async()=>{
      if(!confirm('Antes de aprobar, verificá por WhatsApp que el número realmente pertenece a '+c.name+'. ¿Confirmás?'))return;
      try {await call('host_rewards_admin_approve',{p_customer_id:c.id});await reload();message('Cuenta aprobada.');}
      catch(e){message(e.message);}
    };
    $('host-see-code').onclick=async()=>{
      if(!confirm('¿Querés consultar el código privado de este cliente? La consulta queda registrada.')) return;
      try {
        const code=await call('host_rewards_admin_view_code',{p_customer_id:c.id});
        $('host-private-code').textContent=code===null?'El cliente todavía no creó su código.':`Código actual: ${code}`;
      }catch(e){message(e.message);}
    };
    $('host-reset-code').onclick=async()=>{
      // Código generado por el admin si el cliente olvidó el suyo.
      const a=new Uint32Array(1);crypto.getRandomValues(a);
      const suggested=String(a[0]%100000000).padStart(8,'0');
      const code=prompt('Nuevo código de 8 dígitos para '+c.name,suggested);
      if(code===null) return;
      if(!/^\d{8}$/.test(code)) return alert('Ingresá exactamente 8 dígitos.');
      if(!confirm('El código anterior dejará de funcionar. ¿Confirmás?')) return;
      try {
        await call('host_rewards_admin_reset_code',{p_customer_id:c.id,p_new_code:code});
        $('host-private-code').textContent=`Nuevo código: ${code} (enviáselo al cliente en privado)`;
        message('Código cambiado. La persona podrá cambiarlo desde su cuenta.');
      }catch(e){message(e.message);}
    };
    $('host-adjust-points').onclick=async()=>{
      const raw=prompt('¿Cuántos puntos querés sumar o descontar? Ej.: 10 o -5');
      if(raw===null) return;
      const delta=Number(raw);
      if(!Number.isInteger(delta)||delta===0||Math.abs(delta)>10000) return alert('Cantidad inválida.');
      const reason=prompt('Motivo del ajuste (queda registrado en el historial):');
      if(reason===null) return;
      if(reason.trim().length<5) return alert('Explicá el motivo (mínimo 5 caracteres).');
      if(!confirm(`¿Confirmás ${delta>0?'+':''}${delta} puntos para ${c.name}?`)) return;
      try {
        await call('host_rewards_admin_adjust',{p_customer_id:c.id,p_delta:delta,p_reason:reason.trim()});
        await reload();message('Puntos actualizados y movimiento guardado.');
      }catch(e){message(e.message);}
    };
  }
  async function fetchAll(table,cols,dateColumn){
    let out=[];
    for(let i=0;;i+=500){
      const {data,error}=await db.from(table).select(cols).order(dateColumn,{ascending:false}).range(i,i+499);
      if(error)throw error;
      out.push(...(data||[]));
      if(!data||data.length<500)break;
    }
    return out;
  }
  async function reload(){
    message('Cargando...');
    try{
      await authorize();
      [clients,purchases,adjustments,redemptions]=await Promise.all([
        fetchAll('host_customers','id,name,phone,created_at,access_approved,access_code_encrypted','created_at'),
        fetchAll('host_points','order_id,customer_id,points,credited_at','credited_at'),
        fetchAll('host_point_adjustments','id,customer_id,delta,reason,created_at','created_at'),
        fetchAll('host_redemptions','id,customer_id,points_cost,reward_name,status,created_at','created_at')
      ]);
      render();message('');
    }catch(e){message('Error: '+e.message);}
  }
  tabs.querySelectorAll('[data-tab]').forEach(b=>{
    if(b!==tab)b.addEventListener('click',()=>panel.classList.add('hidden'));
  });
  tab.onclick=()=>{
    tabs.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===tab));
    for(const x of ['categories','products','options','orders','canjes']) $(x+'-panel')?.classList.add('hidden');
    panel.classList.remove('hidden');reload();
  };
  $('host-search').oninput=render;
  $('host-refresh').onclick=reload;
}
