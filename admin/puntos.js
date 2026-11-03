
import { db, escapeHTML, alertError } from '../shared.js';

// HOST: pestaña privada de clientes y puntos.
// Reutiliza los permisos del administrador existente.

const dashboard = document.querySelector('#dashboard');
const tabs = dashboard?.querySelector('.tabs');

if (dashboard && tabs && !document.querySelector('#points-panel')) {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.dataset.tab = 'points';
  tab.textContent = '⭐ Clientes y puntos';
  tabs.append(tab);

  const panel = document.createElement('div');
  panel.id = 'points-panel';
  panel.className = 'panel hidden';

  panel.innerHTML = `
    <h2>⭐ Clientes y puntos</h2>

    <p class="muted">
      Los puntos se acreditan al confirmar el pedido
      y se revierten si se cancela.
    </p>

    <div class="host-stats" id="host-stats"></div>

    <div class="row" style="
      margin:18px 0;
      align-items:center;
      gap:10px;
      flex-wrap:wrap
    ">
      <input
        id="host-client-search"
        class="grow"
        type="search"
        placeholder="Buscar por nombre o celular"
        aria-label="Buscar cliente"
      >

      <button
        class="secondary"
        type="button"
        id="host-reload-points"
      >
        Actualizar
      </button>
    </div>

    <p
      id="host-points-admin-error"
      class="error"
      role="status"
    ></p>

    <div id="host-client-list"></div>
    <div id="host-client-detail"></div>
  `;

  dashboard.append(panel);

  // ESTILOS

  const style = document.createElement('style');

  style.textContent = `
    .host-stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0,1fr));
      gap: 10px;
      margin-top: 15px;
    }

    .host-stat {
      border: 1px solid #454040;
      border-radius: 12px;
      padding: 14px;
      background: rgba(255,180,0,.07);
    }

    .host-stat strong {
      display: block;
      color: #ffbd29;
      font-size: clamp(20px,3vw,29px);
    }

    .host-stat small {
      color: #bcbcbc;
    }

    .host-client-row {
      padding: 13px 0;
      border-bottom: 1px solid #444;
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
    }

    .host-client-row small {
      display: block;
      opacity: .75;
      margin-top: 3px;
    }

    .host-points-balance {
      font-weight: 800;
      color: #ffbd29;
    }

    .host-point-detail {
      margin-top: 20px;
      border: 1px solid #555;
      border-radius: 12px;
      padding: 16px;
    }

    .host-point-movement {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 0;
      border-bottom: 1px solid #444;
      flex-wrap: wrap;
    }

    @media(max-width:520px) {
      .host-stats {
        grid-template-columns: 1fr 1fr;
      }

      .host-stats .host-stat:last-child {
        grid-column: span 2;
      }
    }
  `;

  document.head.append(style);

  let customers = [];
  let points = [];
  let selectedCustomer = null;

  const $ = id => document.getElementById(id);

  const clean = value =>
    escapeHTML(String(value ?? ''));

  const number = n =>
    Number(n || 0).toLocaleString('es-AR');

  const date = value =>
    value
      ? new Date(value).toLocaleDateString('es-AR')
      : '-';

  // CARGAR TODOS LOS REGISTROS

  async function fetchAll(table, columns, dateColumn) {
    const result = [];

    for (let from = 0; ; from += 500) {
      const { data, error } = await db
        .from(table)
        .select(columns)
        .order(dateColumn, { ascending: false })
        .range(from, from + 499);

      if (error) throw error;

      result.push(...(data || []));

      if (!data || data.length < 500) break;
    }

    return result;
  }

  // CALCULAR PUNTOS POR CLIENTE

  function totalFor(id) {
    const entries = points.filter(
      p => p.customer_id === id
    );

    return {
      points: entries.reduce(
        (sum, p) => sum + Number(p.points || 0),
        0
      ),
      orders: entries.length
    };
  }

  // MOSTRAR CLIENTES

  function render() {
    const sum = points.reduce(
      (n, p) => n + Number(p.points || 0),
      0
    );

    $('host-stats').innerHTML = [
      [customers.length, 'Clientes registrados'],
      [sum, 'Puntos entregados'],
      [points.length, 'Compras acreditadas']
    ].map(([value, label]) => `
      <div class="host-stat">
        <strong>${number(value)}</strong>
        <small>${label}</small>
      </div>
    `).join('');

    const q = $('host-client-search')
      .value.trim()
      .toLocaleLowerCase('es-AR');

    const found = customers.filter(c =>
      String(c.name || '')
        .toLocaleLowerCase('es-AR')
        .includes(q) ||
      String(c.phone || '')
        .includes(q.replace(/\s/g, ''))
    );

    $('host-client-list').innerHTML = found.length
      ? found.map(c => {
          const balance = totalFor(c.id);

          return `
            <div class="host-client-row">
              <div>
                <strong>${clean(c.name)}</strong>
                <small>${clean(c.phone)}</small>
              </div>

              <div class="actions">
                <span class="host-points-balance">
                  ${number(balance.points)} pts
                </span>

                <button
                  type="button"
                  class="secondary"
                  data-host-client="${clean(c.id)}"
                >
                  Ver compras (${balance.orders})
                </button>
              </div>
            </div>
          `;
        }).join('')
      : '<p class="muted">No se encontraron clientes.</p>';

    $('host-client-list')
      .querySelectorAll('[data-host-client]')
      .forEach(button => {
        button.onclick = () => {
          selectedCustomer = button.dataset.hostClient;
          renderDetail();
        };
      });

    renderDetail();
  }

  // DETALLE DEL CLIENTE

  function renderDetail() {
    const target = $('host-client-detail');

    const customer = customers.find(
      c => c.id === selectedCustomer
    );

    if (!customer) {
      target.innerHTML = '';
      return;
    }

    const movements = points.filter(
      p => p.customer_id === customer.id
    );

    const balance = totalFor(customer.id);

    target.innerHTML = `
      <div class="host-point-detail">

        <div class="row" style="
          justify-content:space-between;
          gap:10px
        ">
          <div>
            <h3>${clean(customer.name)}</h3>
            <p class="muted">${clean(customer.phone)}</p>
          </div>

          <button
            type="button"
            class="secondary"
            id="host-close-client"
          >
            Cerrar
          </button>
        </div>

        <p>
          <strong>${number(balance.points)} puntos</strong>
          acumulados en ${balance.orders} compras.
        </p>

        <h3>Historial de puntos</h3>

        ${
          movements.length
            ? movements.map(m => `
                <div class="host-point-movement">
                  <span>
                    Pedido #${clean(
                      String(m.order_id)
                        .slice(0, 8)
                        .toUpperCase()
                    )}
                    · ${date(m.credited_at)}
                  </span>

                  <strong>
                    +${number(m.points)} pts
                  </strong>
                </div>
              `).join('')
            : `
              <p class="muted">
                Todavía no hay compras confirmadas.
              </p>
            `
        }

      </div>
    `;

    $('host-close-client').onclick = () => {
      selectedCustomer = null;
      renderDetail();
    };
  }

  // ACTUALIZAR DATOS DESDE SUPABASE

  async function reload() {
    $('host-points-admin-error').textContent =
      'Cargando clientes y puntos...';

    try {
      [customers, points] = await Promise.all([
        fetchAll(
          'host_customers',
          'id,name,phone,created_at',
          'created_at'
        ),
        fetchAll(
          'host_points',
          'order_id,customer_id,points,credited_at',
          'credited_at'
        )
      ]);

      $('host-points-admin-error').textContent = '';

      render();

    } catch (error) {
      $('host-points-admin-error').textContent =
        error.message || String(error);

      alertError(error);
    }
  }

  // CAMBIAR ENTRE PESTAÑAS

  tabs.querySelectorAll('[data-tab]')
    .forEach(button => {
      if (button === tab) return;

      button.addEventListener('click', () => {
        panel.classList.add('hidden');
      });
    });

  tab.onclick = async () => {
    tabs.querySelectorAll('[data-tab]')
      .forEach(b => {
        b.classList.toggle('active', b === tab);
      });

    for (const id of [
      'categories',
      'products',
      'options',
      'orders'
    ]) {
      document.getElementById(`${id}-panel`)
        ?.classList.add('hidden');
    }

    panel.classList.remove('hidden');

    await reload();
  };

  $('host-client-search').oninput = render;
  $('host-reload-points').onclick = reload;
}

