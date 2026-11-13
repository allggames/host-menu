import { db, escapeHTML } from '../shared.js';

const panelHost = document.querySelector('#dashboard');
const tabs = panelHost?.querySelector('.tabs');
const h = v => escapeHTML(String(v ?? ''));
const $ = id => document.getElementById(id);
let clients = [], purchases = [], adjustments = [], redemptions = [], selectedId = null;
let temporaryCodeTimer = null;
let page = 1;
let historyPage = 1;
const PAGE_SIZE = 10;
const HISTORY_PAGE_SIZE = 10;
const fmt = n => Number(n||0).toLocaleString('es-AR');
const date = v => v ? new Date(v).toLocaleDateString('es-AR') : '-';

if (panelHost && tabs && !$('points-panel')) {
  const tab = document.createElement('button');
  tab.dataset.tab='points'; tab.type='button'; tab.textContent='⭐ Clientes y puntos';
  tabs.append(tab);
  const panel=document.createElement('div');
  panel.className='panel hidden';panel.id='points-panel';
  panel.innerHTML=`<h2>⭐ Clientes y puntos</h2>
    <p class="muted">Buscá clientes, restablecé sus códigos y registrá ajustes de puntos.</p>
    <div id="host-points-summary" style="margin:12px 0;font-weight:bold"></div>
    <div id="host-pending-alert" class="host-pending-alert" role="status" aria-live="polite" hidden>
      <span id="host-pending-alert-text"></span>
      <button type="button" id="host-pending-show" class="secondary">Ver pendientes</button>
    </div>
    <div class="row" style="gap:10px;margin:16px 0;flex-wrap:wrap">
      <input id="host-search" class="grow" type="search" placeholder="Buscar por nombre o celular" autocomplete="off">
      <button type="button" class="secondary" id="host-refresh">Actualizar</button>
      <button type="button" id="host-new-customer-open">+ Crear cliente</button>
    </div>
    <form id="host-new-customer-form" class="host-client-create" hidden>
      <div class="row" style="justify-content:space-between;align-items:center;gap:10px">
        <h3>⭐ Crear cliente de HOST PUNTOS</h3>
        <button type="button" class="secondary" id="host-new-customer-cancel">Cerrar</button>
      </div>
      <p class="muted">Este formulario crea una cuenta de cliente, no otro administrador. Comienza con 0 puntos.</p>
      <div class="host-create-grid">
        <label>Nombre y apellido
          <input name="name" maxlength="100" minlength="2" required placeholder="Ej.: María López" autocomplete="off">
        </label>
        <label>Celular de la persona
          <input name="phone" type="tel" required placeholder="Ej.: +5493764123456" autocomplete="off">
        </label>
        <label>Código de 8 caracteres
          <div class="row" style="gap:8px">
            <input name="code" required minlength="8" maxlength="8" pattern="[A-Za-z0-9]{8}" autocomplete="off" autocapitalize="characters">
            <button type="button" class="secondary" id="host-new-customer-code">Generar</button>
          </div>
        </label>
      </div>
      <label class="host-verified-phone">
        <input type="checkbox" name="verified" required>
        Verifiqué por WhatsApp que el número pertenece a esta persona.
      </label>
      <div class="row" style="gap:10px;flex-wrap:wrap">
        <button type="submit" id="host-new-customer-save">Crear cuenta activa</button>
      </div>
    </form>
    <p id="host-admin-feedback" role="status" aria-live="polite"></p>
    <!-- FICHA ARRIBA DEL LISTADO, COMO SE SOLICITÓ -->
    <div id="host-customer-detail"></div>
    <div class="row host-client-list-heading" style="align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <h3>Listado de clientes</h3>
      <label class="host-client-order-label">Ordenar por puntos
        <select id="host-sort-clients" aria-label="Ordenar clientes por puntos">
          <option value="desc">Mayor a menor</option>
          <option value="asc">Menor a mayor</option>
        </select>
      </label>
      <label class="host-pending-only-label">
        <input id="host-only-pending" type="checkbox"> Solo pendientes de aprobación
      </label>
      <span class="muted" id="host-page-info"></span>
    </div>
    <div id="host-customers-list"></div>
    <div id="host-customer-pagination" class="host-customer-pagination" aria-label="Páginas de clientes"></div>`;
  panelHost.append(panel);
  const style=document.createElement('style');
  style.textContent=`
    #host-customers-list .host-client{display:flex;align-items:center;justify-content:space-between;
      flex-wrap:wrap;gap:10px;border-bottom:1px solid #666;padding:12px 0}
    #host-pending-alert[hidden]{display:none!important}
    #host-pending-alert{display:flex;align-items:center;justify-content:space-between;
      gap:12px;flex-wrap:wrap;margin:12px 0;padding:12px 14px;
      background:rgba(255,195,41,.09);border:1px solid rgba(255,195,41,.65);
      border-radius:10px;color:#ffc329;font-weight:800}
    #host-pending-alert button{white-space:nowrap}
    #host-customers-list .host-pending-label,
    #host-customer-detail .host-pending-label{display:inline-flex;align-items:center;
      border-radius:7px;border:1px solid rgba(255,195,41,.7);
      padding:4px 8px;color:#ffc329;background:rgba(255,195,41,.1);
      font-size:12px;font-weight:800;line-height:1.2;margin-top:5px}
    #host-customer-detail .host-pending-detail{padding:10px;margin:12px 0;
      border:1px solid rgba(255,195,41,.55);border-radius:8px;color:#ffc329}
    .host-client-order-label{display:flex;align-items:center;gap:8px;font-size:13px}
    .host-client-order-label select{width:auto;min-width:145px}
    .host-pending-only-label{display:inline-flex;align-items:center;gap:7px;font-size:13px}
    .host-pending-only-label input{width:auto!important;flex:0 0 auto}
    #host-customer-detail{margin:18px 0;scroll-margin-top:100px}
    #host-customer-detail:empty{display:none}
    #host-customer-detail .host-client-info{border:1px solid #af5724;border-radius:12px;padding:18px;background:rgba(255,100,12,.05)}
    #host-new-customer-form[hidden]{display:none!important}
    #host-new-customer-form{border:1px solid #a24b20;border-radius:12px;padding:18px;margin:12px 0;background:rgba(170,60,15,.09)}
    #host-new-customer-form h3{margin:0}
    #host-new-customer-form .host-create-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:12px 0}
    #host-new-customer-form .host-create-grid label{display:block}
    #host-new-customer-form input:not([type=checkbox]){display:block;min-width:0;width:100%;margin-top:6px}
    #host-new-customer-form .host-create-grid .row{align-items:center}
    #host-new-customer-form .host-create-grid .row button{flex-shrink:0}
    #host-new-customer-form .host-verified-phone{display:flex;align-items:flex-start;gap:9px;margin:12px 0}
    #host-new-customer-form .host-verified-phone input{width:auto;flex:0 0 auto;margin-top:4px}
    #host-customer-pagination{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;margin:16px 0}
    #host-customer-pagination button{min-width:40px}
    #host-customer-pagination button[aria-current=page]{background:#ed171f;color:#fff;border-color:#ed171f}
    #host-history-pagination{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;margin:15px 0 4px}
    #host-history-pagination button{min-width:38px}
    #host-history-pagination button[aria-current=page]{background:#ed171f;color:#fff;border-color:#ed171f}
    #host-history-page-info{margin-top:6px;font-size:12px}
    #host-page-info{font-size:13px}
    .host-client-list-heading{margin:20px 0 8px}
    #host-customer-detail .host-actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
    #host-customer-detail .host-history{display:flex;gap:12px;justify-content:space-between;
      padding:10px 0;border-bottom:1px solid #555}
    #host-admin-feedback{color:#d99800;min-height:18px}
  `;
  document.head.append(style);
  const message = x => { $('host-admin-feedback').textContent = String(x||''); };
  function clearTemporaryCode() {
    if (temporaryCodeTimer !== null) {
      clearTimeout(temporaryCodeTimer);
      temporaryCodeTimer = null;
    }
    const field = $('host-private-code');
    if (field) field.textContent = '';
  }
  function showTemporaryCode(code, clientId) {
    if (selectedId !== clientId) return;
    clearTemporaryCode();
    const field = $('host-private-code');
    if (!field) return;
    field.textContent = `Nuevo código: ${code} · Compartilo de forma privada. Se ocultará en 2 minutos.`;
    temporaryCodeTimer = setTimeout(() => {
      if (field.isConnected) field.textContent = '';
      temporaryCodeTimer = null;
    }, 120000);
  }
  function suggestCode() {
    // Alfabeto de 32 caracteres, sin I/O/0/1 para evitar confusiones.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  }

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
    const pendingCustomers = clients.filter(c => c.has_code && !c.access_approved);
    $('host-points-summary').textContent = `${clients.length} clientes · ${fmt(clients.reduce((s,c)=>s+pointTotal(c.id),0))} puntos`;
    const alertBox = $('host-pending-alert');
    alertBox.hidden = pendingCustomers.length === 0;
    $('host-pending-alert-text').textContent = pendingCustomers.length === 1
      ? '⚠️ 1 cliente espera aprobación.'
      : `⚠️ ${pendingCustomers.length} clientes esperan aprobación.`;
    const q=$('host-search').value.trim().toLowerCase();
    const onlyPending = $('host-only-pending').checked;
    const sortDir = $('host-sort-clients').value === 'asc' ? 1 : -1;
    const found=clients
      .filter(c=>(c.name+' '+c.phone).toLowerCase().includes(q))
      .filter(c=>!onlyPending || (c.has_code && !c.access_approved))
      .sort((a,b)=>sortDir*(pointTotal(a.id)-pointTotal(b.id))
        || Number(b.has_code && !b.access_approved)-Number(a.has_code && !a.access_approved)
        || a.name.localeCompare(b.name,'es'));
    const pageCount=Math.max(1,Math.ceil(found.length/PAGE_SIZE));
    page=Math.max(1,Math.min(page,pageCount));
    const start=(page-1)*PAGE_SIZE;
    const visible=found.slice(start,start+PAGE_SIZE);
    const end=Math.min(start+PAGE_SIZE,found.length);
    $('host-page-info').textContent=found.length
      ? `Mostrando ${start+1}–${end} de ${found.length}`
      : '0 clientes';
    $('host-customers-list').innerHTML=visible.map(c=>`
      <div class="host-client"><div>
        <strong>${h(c.name)}</strong><br>
        <small>${h(c.phone)} ${!c.has_code?'· Sin registro':c.access_approved?'· Cuenta activa':''}</small>
        ${c.has_code && !c.access_approved ? '<div class="host-pending-label">⚠️ Pendiente de aprobación</div>' : ''}
      </div>
      <div class="actions"><strong>${fmt(pointTotal(c.id))} pts</strong>
      <button type="button" class="secondary" data-client="${h(c.id)}">Administrar</button></div></div>
    `).join('')||'<p class="muted">No se encontraron clientes.</p>';
    $('host-customers-list').querySelectorAll('[data-client]').forEach(b=>{
      b.onclick=()=>{
        clearTemporaryCode();
        selectedId=b.dataset.client;
        historyPage=1;
        renderDetail();
        $('host-customer-detail').scrollIntoView({behavior:'smooth',block:'start'});
      };
    });
    const pagination=$('host-customer-pagination');
    pagination.innerHTML='';
    if(pageCount>1){
      function addPageButton(label,target,disabled=false,current=false){
        const button=document.createElement('button');
        button.type='button';
        button.className='secondary';
        button.textContent=label;
        button.disabled=disabled;
        if(current)button.setAttribute('aria-current','page');
        button.onclick=()=>{
          if(target===page)return;
          page=target;
          render();
          $('host-customers-list').scrollIntoView({behavior:'smooth',block:'start'});
        };
        pagination.append(button);
      }
      addPageButton('← Anterior',Math.max(1,page-1),page===1);
      for(let p=1;p<=pageCount;p++){
        if(pageCount>10 && Math.abs(p-page)>2 && p!==1 && p!==pageCount)continue;
        addPageButton(String(p),p,false,p===page);
      }
      addPageButton('Siguiente →',Math.min(pageCount,page+1),page===pageCount);
    }
    renderDetail();
  }
  function renderDetail() {
    clearTemporaryCode();
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
      <h3>${fmt(pointTotal(c.id))} puntos</h3>
      ${c.has_code && !c.access_approved ? '<div class="host-pending-detail">⚠️ Cuenta pendiente de aprobación. Verificá el celular antes de aprobar.</div>' : ''}
      </div>
      <button type="button" id="host-close-detail" class="secondary">Cerrar</button></div>
      <div class="host-actions">
        ${!c.access_approved && c.has_code ? '<button type="button" id="host-approve">✅ Aprobar registro</button>' : ''}
        <button type="button" id="host-reset-code" class="secondary">🔑 Cambiar código</button>
        <button type="button" id="host-adjust-points">+ / − Puntos</button>
        <a id="host-contact-client" class="button yellow" target="_blank" rel="noopener"
          href="https://wa.me/${encodeURIComponent(c.phone.replace(/\D/g,''))}">WhatsApp</a>
      </div>
      <p id="host-private-code" style="font-weight:bold"></p>
      <h3>Historial</h3>
      <p id="host-history-page-info" class="muted"></p>
      <div id="host-client-history-list"></div>
      <nav id="host-history-pagination" aria-label="Páginas del historial de movimientos"></nav>
      </div>`;

    // Mostrar los movimientos más recientes primero; 10 por página.
    // Esta paginación es independiente de las páginas del listado de clientes.
    function renderHistoryPage() {
      const pageCount = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
      historyPage = Math.max(1, Math.min(historyPage, pageCount));
      const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
      const current = history.slice(start, start + HISTORY_PAGE_SIZE);
      const list = target.querySelector('#host-client-history-list');
      const pagination = target.querySelector('#host-history-pagination');
      const info = target.querySelector('#host-history-page-info');
      if (!list || !pagination || !info) return;

      list.innerHTML = current.map(x => `<div class="host-history">
        <span>${h(x.reason)} · ${date(x.created_at)}</span>
        <strong>${Number(x.delta)>0?'+':''}${fmt(x.delta)} pts</strong>
      </div>`).join('') || '<p class="muted">Sin movimientos.</p>';
      info.textContent = history.length
        ? `Mostrando ${start + 1}–${Math.min(start + HISTORY_PAGE_SIZE, history.length)} de ${history.length} movimientos · Página ${historyPage} de ${pageCount}`
        : 'Sin movimientos';

      pagination.replaceChildren();
      if (pageCount < 2) return;
      const button = (label, targetPage, disabled = false, currentPage = false) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'secondary';
        el.textContent = label;
        el.disabled = disabled;
        if (currentPage) el.setAttribute('aria-current', 'page');
        el.onclick = () => {
          historyPage = targetPage;
          renderHistoryPage();
          target.querySelector('#host-history-page-info')?.scrollIntoView({
            behavior: 'smooth', block: 'nearest'
          });
        };
        pagination.append(el);
      };
      button('← Anterior', Math.max(1, historyPage - 1), historyPage === 1);
      for (let p = 1; p <= pageCount; p++) {
        if (pageCount > 10 && Math.abs(p - historyPage) > 2 && p !== 1 && p !== pageCount) continue;
        button(String(p), p, false, p === historyPage);
      }
      button('Siguiente →', Math.min(pageCount, historyPage + 1), historyPage === pageCount);
    }
    renderHistoryPage();

    $('host-close-detail').onclick=()=>{clearTemporaryCode();selectedId=null;historyPage=1;renderDetail();};
    if ($('host-approve')) $('host-approve').onclick=async()=>{
      if(!confirm('Antes de aprobar, verificá por WhatsApp que el número realmente pertenece a '+c.name+'. ¿Confirmás?'))return;
      try {await call('host_rewards_admin_approve',{p_customer_id:c.id});await reload();message('Cuenta aprobada.');}
      catch(e){message(e.message);}
    };
    $('host-reset-code').onclick=async()=>{
      // Código generado por el admin si el cliente olvidó el suyo.
      const suggested=suggestCode();
      const code=prompt('Nuevo código de 8 caracteres para '+c.name,suggested);
      if(code===null) return;
      if(!/^[A-Za-z0-9]{8}$/.test(code)) {
        return alert('El código debe tener exactamente 8 caracteres con letras y/o números.');
      }
      if(!confirm('El código anterior dejará de funcionar. ¿Confirmás?')) return;
      try {
        await call('host_rewards_admin_reset_code',{p_customer_id:c.id,p_new_code:code});
        showTemporaryCode(code,c.id);
        message('Código restablecido. Compartilo de forma privada. Se ocultará en 2 minutos.');
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
  // CREACIÓN DE CLIENTES. La RPC comprueba en Supabase admin + MFA (aal2).
  // No se utiliza Supabase Auth ni se crean usuarios administradores.
  function normalizeCustomerPhone(value){
    const digits=String(value||'').replace(/\D/g,'');
    if(/^549\d{10}$/.test(digits)) return '+'+digits;
    if(/^\d{10}$/.test(digits)) return '+549'+digits;
    if(/^0\d{10}$/.test(digits)) return '+549'+digits.slice(1);
    throw Error('Celular inválido. Ingresá los 10 dígitos del número, o +549 seguido de esos 10 dígitos.');
  }

  const createForm=$('host-new-customer-form');
  $('host-new-customer-open').onclick=()=>{
    createForm.reset();
    createForm.elements.code.value=suggestCode();
    createForm.hidden=false;
    createForm.elements.name.focus();
    createForm.scrollIntoView({behavior:'smooth',block:'start'});
  };
  $('host-new-customer-cancel').onclick=()=>{
    createForm.reset();
    createForm.hidden=true;
  };
  $('host-new-customer-code').onclick=()=>{
    createForm.elements.code.value=suggestCode();
  };

  createForm.onsubmit=async event=>{
    event.preventDefault();
    const name=createForm.elements.name.value.trim();
    const code=createForm.elements.code.value.trim();
    let phone;
    try{
      phone=normalizeCustomerPhone(createForm.elements.phone.value);
    }catch(e){message(e.message);return;}
    if(name.length<2||name.length>100){message('Ingresá un nombre válido (2 a 100 caracteres).');return;}
    if(!/^[A-Za-z0-9]{8}$/.test(code)){message('El código debe tener exactamente 8 letras y/o números.');return;}
    if(!createForm.elements.verified.checked){message('Primero verificá por WhatsApp que el celular pertenece al cliente.');return;}
    if(!confirm(`¿Crear cuenta activa de HOST PUNTOS para ${name} (${phone})? Se generará con 0 puntos.`))return;
    const save=$('host-new-customer-save');
    save.disabled=true;
    message('Creando cliente...');
    try{
      const result=await call('host_rewards_admin_create_customer',{
        p_name:name,p_phone:phone,p_code:code
      });
      if(!result?.customer_id)throw Error('No se recibió la confirmación de creación.');
      selectedId=result.customer_id;
      page=1;
      $('host-search').value='';
      await reload();
      createForm.reset();
      createForm.hidden=true;
      showTemporaryCode(code,selectedId);
      message('Cliente creado y activo con 0 puntos. Compartí el código por privado; se ocultará en 2 minutos.');
      $('host-customer-detail').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){
      message('Error al crear cliente: '+e.message);
    }finally{save.disabled=false;}
  };

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
        fetchAll('host_customers_admin_safe','id,name,phone,created_at,access_approved,has_code','created_at'),
        fetchAll('host_points','order_id,customer_id,points,credited_at','credited_at'),
        fetchAll('host_point_adjustments','id,customer_id,delta,reason,created_at','created_at'),
        fetchAll('host_redemptions','id,customer_id,points_cost,reward_name,status,created_at','created_at')
      ]);
      render();message('');
    }catch(e){message('Error: '+e.message);}
  }
  tabs.querySelectorAll('[data-tab]').forEach(b=>{
    if(b!==tab)b.addEventListener('click',()=>{clearTemporaryCode();panel.classList.add('hidden');});
  });
  tab.onclick=()=>{
    clearTemporaryCode();
    tabs.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===tab));
    for(const x of ['categories','products','options','orders','canjes','orden-todos']) $(x+'-panel')?.classList.add('hidden');
    panel.classList.remove('hidden');reload();
  };
  $('host-search').oninput=()=>{page=1;render();};
  $('host-sort-clients').onchange=()=>{page=1;render();};
  $('host-only-pending').onchange=()=>{page=1;render();};
  $('host-pending-show').onclick=()=>{
    $('host-only-pending').checked=true;
    $('host-search').value='';
    page=1;
    render();
    $('host-customers-list').scrollIntoView({behavior:'smooth',block:'start'});
  };
  $('host-refresh').onclick=reload;
}
