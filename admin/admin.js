
import {
  db,
  money,
  escapeHTML,
  uid,
  alertError
} from '../shared.js';

import { configured } from '../config.js';

const $ = s => document.querySelector(s);

let cats = [];
let products = [];
let orders = [];
let groups = [];
let values = [];
let links = [];
let selectedGroup = null;
let editingProductId = null;

// INICIO Y AUTENTICACIÓN

if (!configured) {
  $('#setup').classList.remove('hidden');
} else {
  init();
}

async function init() {
  const { data: { session } } = await db.auth.getSession();

  if (session) await enter();

  db.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      $('#dashboard').classList.add('hidden');
      $('#login').classList.remove('hidden');
    }
  });
}

$('#login-form').onsubmit = async e => {
  e.preventDefault();

  const f = new FormData(e.target);

  const { error } = await db.auth.signInWithPassword({
    email: f.get('email'),
    password: f.get('password')
  });

  if (error) {
    $('#login-message').textContent = error.message;
    return;
  }

  await enter();
};

async function enter() {
  const { data: { user } } = await db.auth.getUser();

  if (!user) return;

  const { data, error } = await db
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) {
    $('#login-message').textContent =
      'Esta cuenta no tiene permisos de administración.';

    await db.auth.signOut();
    return;
  }

  $('#login').classList.add('hidden');
  $('#dashboard').classList.remove('hidden');

  await reload();
}

$('#logout').onclick = () => db.auth.signOut();

// PESTAÑAS

document.querySelectorAll('[data-tab]').forEach(b => {
  b.onclick = () => {
    document.querySelectorAll('[data-tab]').forEach(x => {
      x.classList.toggle('active', x === b);
    });

    for (const id of [
      'categories',
      'products',
      'options',
      'orders'
    ]) {
      $('#' + id + '-panel').classList.toggle(
        'hidden',
        id !== b.dataset.tab
      );
    }
  };
});

// CARGAR DATOS

async function reload() {
  const [c, p] = await Promise.all([
    db.from('categories').select('*').order('position'),
    db.from('products').select('*').order('position')
  ]);

  if (c.error) throw c.error;
  if (p.error) throw p.error;

  cats = c.data || [];
  products = p.data || [];

  renderCats();
  await loadOptions();
  renderProducts();
  renderProductGroups(editingProductId);
  await loadOrders();
}

async function save(table, record) {
  const { error } = await db.from(table).upsert(record);

  if (error) throw error;

  await reload();
}

async function remove(table, id) {
  if (!confirm('¿Eliminar este elemento?')) return;

  const { error } = await db
    .from(table)
    .delete()
    .eq('id', id);

  if (error) throw error;

  await reload();
}

// CATEGORÍAS

$('#category-form').onsubmit = async e => {
  e.preventDefault();

  const name = new FormData(e.target).get('name').trim();

  if (!name) return;

  try {
    await save('categories', {
      id: uid(),
      name,
      position: cats.length
    });

    e.target.reset();
  } catch (err) {
    alertError(err);
  }
};

function renderCats() {
  $('#category-list').innerHTML = cats.map((c, i) => `
    <div class="item-row">
      <strong>${escapeHTML(c.name)}</strong>

      <div class="actions">
        <button class="secondary"
          data-cat-up="${c.id}"
          ${i === 0 ? 'disabled' : ''}>↑</button>

        <button class="secondary"
          data-cat-down="${c.id}"
          ${i === cats.length - 1 ? 'disabled' : ''}>↓</button>

        <button class="secondary"
          data-cat-edit="${c.id}">Renombrar</button>

        <button class="danger"
          data-cat-del="${c.id}">Eliminar</button>
      </div>
    </div>
  `).join('');

  $('#product-category').innerHTML = cats.map(c => `
    <option value="${c.id}">
      ${escapeHTML(c.name)}
    </option>
  `).join('');

  document.querySelectorAll(
    '[data-cat-up],[data-cat-down]'
  ).forEach(b => {
    b.onclick = () => reorder(
      cats,
      b.dataset.catUp || b.dataset.catDown,
      b.hasAttribute('data-cat-up') ? -1 : 1,
      'categories'
    );
  });

  document.querySelectorAll('[data-cat-edit]').forEach(b => {
    b.onclick = async () => {
      const c = cats.find(x => x.id === b.dataset.catEdit);
      const name = prompt('Nombre de categoría', c.name);

      if (name?.trim()) {
        try {
          await save('categories', {
            ...c,
            name: name.trim()
          });
        } catch (e) {
          alertError(e);
        }
      }
    };
  });

  document.querySelectorAll('[data-cat-del]').forEach(b => {
    b.onclick = () =>
      remove('categories', b.dataset.catDel).catch(alertError);
  });
}

// ORDENAR

async function reorder(arr, id, step, table) {
  const i = arr.findIndex(x => x.id === id);
  const other = arr[i + step];

  if (!other) return;

  const a = arr[i];

  try {
    let { error } = await db
      .from(table)
      .update({ position: other.position })
      .eq('id', a.id);

    if (error) throw error;

    ({ error } = await db
      .from(table)
      .update({ position: a.position })
      .eq('id', other.id));

    if (error) throw error;

    await reload();
  } catch (e) {
    alertError(e);
  }
}

// GRUPOS ASIGNADOS A PRODUCTOS

function renderProductGroups(productId) {
  $('#product-groups').innerHTML = groups.map(g => `
    <label style="display:block;padding:5px">
      <input
        type="checkbox"
        style="width:auto"
        name="group_${g.id}"
        value="${g.id}"
        ${
          links.some(l =>
            l.product_id === productId &&
            l.group_id === g.id
          ) ? 'checked' : ''
        }
      >
      ${escapeHTML(g.name)}
      (${g.min_select} a ${g.max_select})
    </label>
  `).join('') ||
  '<p class="muted">Primero creá grupos en la pestaña Opcionales.</p>';
}

// LISTADO DE PRODUCTOS

function renderProducts() {
  $('#product-list').innerHTML = cats.map(c => `
    <h3>${escapeHTML(c.name)}</h3>

    ${
      products
        .filter(p => p.category_id === c.id)
        .map((p, i, arr) => `
          <div class="item-row">
            <div class="row">
              ${
                p.image_url
                  ? `<img src="${escapeHTML(p.image_url)}" alt="">`
                  : '🍗'
              }

              <div>
                <strong>${escapeHTML(p.name)}</strong>
                <br>
                ${money(p.price)}
                ${p.available ? '' : '· Oculto'}
              </div>
            </div>

            <div class="actions">
              <button class="secondary"
                data-p-up="${p.id}"
                ${i === 0 ? 'disabled' : ''}>↑</button>

              <button class="secondary"
                data-p-down="${p.id}"
                ${i === arr.length - 1 ? 'disabled' : ''}>↓</button>

              <button class="secondary"
                data-p-edit="${p.id}">Editar</button>

              <button class="danger"
                data-p-del="${p.id}">Eliminar</button>
            </div>
          </div>
        `).join('') ||
      '<p class="muted">Sin productos</p>'
    }
  `).join('');

  document.querySelectorAll(
    '[data-p-up],[data-p-down]'
  ).forEach(b => {
    b.onclick = () => {
      const id = b.dataset.pUp || b.dataset.pDown;
      const p = products.find(x => x.id === id);

      reorder(
        products.filter(x => x.category_id === p.category_id),
        id,
        b.hasAttribute('data-p-up') ? -1 : 1,
        'products'
      );
    };
  });

  document.querySelectorAll('[data-p-edit]').forEach(b => {
    b.onclick = () => {
      const p = products.find(x => x.id === b.dataset.pEdit);
      const f = $('#product-form');

      editingProductId = p.id;

      for (const k of [
        'id',
        'name',
        'price',
        'description',
        'category_id'
      ]) {
        f.elements[k].value = p[k] ?? '';
      }

      f.elements.available.checked = p.available;

      renderProductGroups(p.id);

      f.scrollIntoView({ behavior: 'smooth' });
    };
  });

  document.querySelectorAll('[data-p-del]').forEach(b => {
    b.onclick = () =>
      remove('products', b.dataset.pDel).catch(alertError);
  });
}

// LIMPIAR PRODUCTO Y SALIR DE EDICIÓN

function clearProductForm() {
  const form = $('#product-form');

  form.reset();
  form.elements.id.value = '';

  editingProductId = null;

  renderProductGroups(null);
}

$('#cancel-edit').onclick = clearProductForm;

// GUARDAR PRODUCTO - CORREGIDO

$('#product-form').onsubmit = async e => {
  e.preventDefault();

  const form = e.target;
  const f = new FormData(form);

  // Solo editar si se seleccionó expresamente
  // un producto existente.

  const existing = editingProductId
    ? products.find(p => p.id === editingProductId)
    : null;

  if (editingProductId && !existing) {
    alert(
      'No se encontró el producto que estabas editando. ' +
      'Actualizá la página.'
    );
    return;
  }

  // Producto nuevo = ID nuevo.
  // Producto en edición = conservar su ID.

  const id = existing ? existing.id : uid();

  const category_id = f.get('category_id');
  const file = f.get('image');

  // Guardar los opcionales seleccionados antes
  // de actualizar el formulario.

  const selected = [
    ...form.querySelectorAll(
      '#product-groups input:checked'
    )
  ].map(x => x.value);

  let image_url = existing?.image_url || null;

  const btn = form.querySelector(
    'button[type=submit],button:not([type])'
  );

  btn.disabled = true;

  try {
    // SUBIR IMAGEN

    if (file?.size) {
      if (
        file.size > 5e6 ||
        ![
          'image/jpeg',
          'image/png',
          'image/webp'
        ].includes(file.type)
      ) {
        throw Error(
          'Usá JPG, PNG o WebP de hasta 5 MB'
        );
      }

      const ext = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
      }[file.type];

      const path = `${id}/${uid()}.${ext}`;

      const { error } = await db.storage
        .from('product-images')
        .upload(path, file, {
          contentType: file.type
        });

      if (error) throw error;

      image_url = db.storage
        .from('product-images')
        .getPublicUrl(path).data.publicUrl;
    }

    // POSICIÓN DEL PRODUCTO

    const position =
      existing?.category_id === category_id
        ? existing.position
        : products.filter(
            p => p.category_id === category_id
          ).length;

    // DATOS DEL PRODUCTO

    const productRecord = {
      id,
      name: String(f.get('name')).trim(),
      description: String(f.get('description') || ''),
      price: Number(f.get('price')),
      category_id,
      image_url,
      available: f.get('available') === 'on',
      position
    };

    // DIFERENCIAR INSERTAR DE ACTUALIZAR

    const productQuery = db.from('products');

    const {
      data: savedProducts,
      error: productError
    } = existing
      ? await productQuery
          .update(productRecord)
          .eq('id', id)
          .select('id')
      : await productQuery
          .insert(productRecord)
          .select('id');

    if (productError) throw productError;

    if (!savedProducts?.length) {
      throw Error(
        'No se pudo guardar el producto. ' +
        'Revisá los permisos de Supabase.'
      );
    }

    // GRUPOS DE OPCIONALES

    const current = links.filter(
      l => l.product_id === id
    );

    const toAdd = selected.filter(
      group_id => !current.some(
        l => l.group_id === group_id
      )
    );

    const toRemove = current.filter(
      l => !selected.includes(l.group_id)
    );

    // AGREGAR GRUPOS NUEVOS

    if (toAdd.length) {
      const { error } = await db
        .from('product_option_groups')
        .insert(
          toAdd.map(group_id => ({
            product_id: id,
            group_id,
            position: selected.indexOf(group_id)
          }))
        );

      if (error) throw error;
    }

    // QUITAR GRUPOS DESMARCADOS

    for (const relation of toRemove) {
      const { error } = await db
        .from('product_option_groups')
        .delete()
        .eq('product_id', id)
        .eq('group_id', relation.group_id);

      if (error) throw error;
    }

    // RECARGAR DESPUÉS DE GUARDAR

    await reload();

    // LIMPIAR ID Y MODO EDICIÓN

    clearProductForm();

    alert('Producto y grupos guardados correctamente.');

  } catch (err) {
    alertError(err);
  } finally {
    btn.disabled = false;
  }
};

// PEDIDOS

async function loadOrders() {
  const { data, error } = await db
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;

  orders = data || [];

  $('#order-list').innerHTML = orders.map(o => `
    <div class="item-row">
      <div>
        <strong>${escapeHTML(o.customer_name)}</strong>
        · ${money(o.total)}
        <br>

        <small>
          ${new Date(o.created_at).toLocaleString('es-AR')}
          · ${escapeHTML(o.delivery_type)}
          ${escapeHTML(o.address || '')}
        </small>

        <br>

        ${
          (o.items || []).map(x =>
            `${Number(x.quantity)} × ${escapeHTML(x.name)}`
          ).join(' · ')
        }

        <br>

        <small>${escapeHTML(o.notes || '')}</small>
      </div>

      <select style="width:auto" data-status="${o.id}">
        ${
          [
            ['iniciado_whatsapp', 'WhatsApp iniciado'],
            ['confirmado', 'Confirmado manualmente'],
            ['preparando', 'Preparando'],
            ['entregado', 'Entregado'],
            ['cancelado', 'Cancelado']
          ].map(([v, l]) => `
            <option value="${v}"
              ${o.status === v ? 'selected' : ''}>
              ${l}
            </option>
          `).join('')
        }
      </select>
    </div>
  `).join('') || '<p>No hay pedidos registrados.</p>';

  document.querySelectorAll('[data-status]').forEach(s => {
    s.onchange = async () => {
      const { error } = await db
        .from('orders')
        .update({ status: s.value })
        .eq('id', s.dataset.status);

      if (error) alertError(error);
    };
  });
}

$('#refresh-orders').onclick = () =>
  loadOrders().catch(alertError);

// CARGAR OPCIONALES

async function loadOptions() {
  const [g, v, l] = await Promise.all([
    db.from('option_groups').select('*').order('position'),
    db.from('option_values').select('*').order('position'),
    db.from('product_option_groups').select('*').order('position')
  ]);

  for (const x of [g, v, l]) {
    if (x.error) throw x.error;
  }

  groups = g.data || [];
  values = v.data || [];
  links = l.data || [];

  renderGroups();
  renderValues();
}

// MOSTRAR GRUPOS

function renderGroups() {
  $('#group-list').innerHTML = groups.map(g => `
    <div class="item-row">
      <div>
        <strong>${escapeHTML(g.name)}</strong>
        <br>
        <small>
          Mín ${g.min_select}
          · Máx ${g.max_select}
          · ${
            links.filter(x => x.group_id === g.id).length
          } productos
        </small>
      </div>

      <div class="actions">
        <button class="secondary"
          data-g-select="${g.id}">Opciones</button>

        <button class="secondary"
          data-g-edit="${g.id}">Editar</button>

        <button class="danger"
          data-g-delete="${g.id}">Eliminar</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-g-select]').forEach(b => {
    b.onclick = () => {
      selectedGroup = b.dataset.gSelect;
      renderValues();
    };
  });

  document.querySelectorAll('[data-g-edit]').forEach(b => {
    b.onclick = () => {
      const g = groups.find(
        x => x.id === b.dataset.gEdit
      );

      const f = $('#group-form');

      for (const k of [
        'id',
        'name',
        'min_select',
        'max_select'
      ]) {
        f.elements[k].value = g[k];
      }

      selectedGroup = g.id;
      renderValues();

      f.scrollIntoView({ behavior: 'smooth' });
    };
  });

  document.querySelectorAll('[data-g-delete]').forEach(b => {
    b.onclick = async () => {
      if (!confirm(
        'Eliminar este grupo también lo quitará ' +
        'de todos los productos. ¿Continuar?'
      )) return;

      try {
        const { error } = await db
          .from('option_groups')
          .delete()
          .eq('id', b.dataset.gDelete);

        if (error) throw error;

        if (selectedGroup === b.dataset.gDelete) {
          selectedGroup = null;
        }

        await loadOptions();

        renderProductGroups(editingProductId);
      } catch (e) {
        alertError(e);
      }
    };
  });
}

// OPCIONES DE CADA GRUPO

function renderValues() {
  const g = groups.find(x => x.id === selectedGroup);

  $('#selected-group').textContent = g
    ? `Editando: ${g.name}`
    : 'Seleccioná un grupo para editar sus opciones.';

  $('#value-form').querySelector('button').disabled = !g;

  $('#value-list').innerHTML = g
    ? values.filter(v => v.group_id === g.id).map(v => `
        <div class="item-row">
          <span>
            ${escapeHTML(v.name)}
            · +${money(v.extra_price)}
          </span>

          <div class="actions">
            <button class="secondary"
              data-v-edit="${v.id}">Editar</button>

            <button class="danger"
              data-v-del="${v.id}">Eliminar</button>
          </div>
        </div>
      `).join('')
    : '';

  document.querySelectorAll('[data-v-edit]').forEach(b => {
    b.onclick = () => {
      const v = values.find(x => x.id === b.dataset.vEdit);
      const f = $('#value-form');

      for (const k of ['id', 'name', 'extra_price']) {
        f.elements[k].value = v[k];
      }
    };
  });

  document.querySelectorAll('[data-v-del]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('¿Eliminar esta opción?')) return;

      try {
        const { error } = await db
          .from('option_values')
          .delete()
          .eq('id', b.dataset.vDel);

        if (error) throw error;

        await loadOptions();
      } catch (e) {
        alertError(e);
      }
    };
  });
}

// LIMPIAR FORMULARIOS DE OPCIONALES

$('#clear-group').onclick = () =>
  $('#group-form').reset();

$('#clear-value').onclick = () =>
  $('#value-form').reset();

// GUARDAR GRUPO

$('#group-form').onsubmit = async e => {
  e.preventDefault();

  const f = e.target;
  const r = new FormData(f);

  const min_select = Number(r.get('min_select'));
  const max_select = Number(r.get('max_select'));

  if (min_select > max_select) {
    alert('El mínimo no puede superar el máximo');
    return;
  }

  try {
    const { error } = await db
      .from('option_groups')
      .upsert({
        id: r.get('id') || uid(),
        name: String(r.get('name')).trim(),
        min_select,
        max_select,
        position:
          groups.find(x => x.id === r.get('id'))?.position ??
          groups.length
      });

    if (error) throw error;

    f.reset();

    await loadOptions();
    renderProductGroups(editingProductId);
  } catch (err) {
    alertError(err);
  }
};

// GUARDAR OPCIÓN

$('#value-form').onsubmit = async e => {
  e.preventDefault();

  if (!selectedGroup) {
    alert('Seleccioná un grupo');
    return;
  }

  const f = e.target;
  const r = new FormData(f);

  const existing = values
    .filter(v => v.group_id === selectedGroup)
    .find(v => v.id === r.get('id'));

  try {
    const { error } = await db
      .from('option_values')
      .upsert({
        id: r.get('id') || uid(),
        group_id: selectedGroup,
        name: String(r.get('name')).trim(),
        extra_price: Number(r.get('extra_price')),
        position: existing?.position ??
          values.filter(
            v => v.group_id === selectedGroup
          ).length
      });

    if (error) throw error;

    f.reset();

    await loadOptions();
  } catch (err) {
    alertError(err);
  }
};
