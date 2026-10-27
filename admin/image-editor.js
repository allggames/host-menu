
const input = document.querySelector(
  '#product-form input[name="image"]'
);
const form = document.querySelector('#product-form');

if (input && form) {
  const panel = document.createElement('section');

  panel.style.cssText =
    'margin:16px 0;padding:16px;border:1px solid #ddd;' +
    'border-radius:14px;background:#fff;color:#222';

  panel.hidden = true;

  panel.innerHTML = `
    <h3>Acomodar imagen</h3>
    <p class="muted">
      Arrastrá la foto para centrarla.
      Ajustá el zoom y presioná Aplicar recorte.
    </p>

    <canvas
      width="800"
      height="800"
      style="
        display:block;
        width:min(100%,360px);
        aspect-ratio:1;
        touch-action:none;
        cursor:grab;
        border-radius:10px;
        background:#f1f1f1;
      "
    ></canvas>

    <label for="host-image-zoom">Zoom</label>
    <input
      id="host-image-zoom"
      type="range"
      min="100"
      max="300"
      value="100"
      step="1"
    >

    <div class="row">
      <button type="button" id="host-image-apply">
        Aplicar recorte
      </button>

      <button
        type="button"
        class="secondary"
        id="host-image-reset"
      >
        Restablecer
      </button>
    </div>

    <p
      id="host-image-status"
      class="muted"
      aria-live="polite"
    ></p>
  `;

  input.insertAdjacentElement('afterend', panel);

  const canvas = panel.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const zoom = panel.querySelector('#host-image-zoom');
  const status = panel.querySelector('#host-image-status');
  const apply = panel.querySelector('#host-image-apply');

  let image = null;
  let original = null;
  let x = 0;
  let y = 0;
  let scale = 1;
  let drag = null;
  let previewUrl = null;

  const size = 800;

  function draw() {
    if (!image) return;

    const base = Math.max(
      size / image.naturalWidth,
      size / image.naturalHeight
    );

    const w = image.naturalWidth * base * scale;
    const h = image.naturalHeight * base * scale;

    const limitX = Math.max(0, (w - size) / 2);
    const limitY = Math.max(0, (h - size) / 2);

    x = Math.max(-limitX, Math.min(limitX, x));
    y = Math.max(-limitY, Math.min(limitY, y));

    ctx.clearRect(0, 0, size, size);

    ctx.drawImage(
      image,
      (size - w) / 2 + x,
      (size - h) / 2 + y,
      w,
      h
    );
  }

  function resetPosition() {
    x = 0;
    y = 0;
    scale = 1;
    zoom.value = '100';
    draw();
  }

  function clearEditor() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    previewUrl = null;
    image = null;
    original = null;
    drag = null;

    panel.hidden = true;
    status.textContent = '';

    ctx.clearRect(0, 0, size, size);
  }

  input.addEventListener('change', () => {
    const file = input.files?.[0];

    clearEditor();

    if (!file) return;

    if (
      ![
        'image/jpeg',
        'image/png',
        'image/webp'
      ].includes(file.type) ||
      file.size > 5e6
    ) {
      alert('Elegí JPG, PNG o WebP de hasta 5 MB');
      input.value = '';
      return;
    }

    original = file;
    previewUrl = URL.createObjectURL(file);

    const img = new Image();

    img.onload = () => {
      image = img;
      panel.hidden = false;
      resetPosition();

      status.textContent =
        'Ajustá la foto y aplicá el recorte antes de guardar.';
    };

    img.onerror = () => {
      clearEditor();
      input.value = '';
      alert('No se pudo leer la imagen.');
    };

    img.src = previewUrl;
  });

  zoom.addEventListener('input', () => {
    scale = Number(zoom.value) / 100;
    draw();

    status.textContent =
      'Cambios pendientes de aplicar.';
  });

  canvas.addEventListener('pointerdown', e => {
    if (!image) return;

    drag = {
      px: e.clientX,
      py: e.clientY,
      x,
      y
    };

    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', e => {
    if (!drag) return;

    const factor =
      size / canvas.getBoundingClientRect().width;

    x = drag.x + (e.clientX - drag.px) * factor;
    y = drag.y + (e.clientY - drag.py) * factor;

    draw();

    status.textContent =
      'Cambios pendientes de aplicar.';
  });

  canvas.addEventListener('pointerup', () => {
    drag = null;
  });

  canvas.addEventListener('pointercancel', () => {
    drag = null;
  });

  panel.querySelector('#host-image-reset')
    .addEventListener('click', () => {
      resetPosition();

      status.textContent =
        'Cambios pendientes de aplicar.';
    });

  apply.addEventListener('click', async () => {
    if (!image) return;

    draw();
    apply.disabled = true;

    try {
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          b => b
            ? resolve(b)
            : reject(new Error('No se pudo recortar')),
          'image/jpeg',
          0.88
        );
      });

      if (blob.size > 5e6) {
        throw new Error('El recorte supera los 5 MB');
      }

      const file = new File(
        [blob],
        (original?.name || 'producto')
          .replace(/\.[^.]+$/, '') + '-host.jpg',
        { type: 'image/jpeg' }
      );

      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;

      status.textContent =
        '✓ Recorte aplicado. Ahora presioná Guardar producto.';

    } catch (err) {
      status.textContent = err.message;
    } finally {
      apply.disabled = false;
    }
  });

  // Impedir guardar una foto sin aplicar el recorte.
  form.addEventListener('submit', e => {
    if (
      image &&
      !status.textContent.startsWith('✓')
    ) {
      e.preventDefault();
      e.stopImmediatePropagation();

      alert('Primero presioná Aplicar recorte.');
    }
  }, true);

  form.addEventListener('reset', () => {
    setTimeout(clearEditor, 0);
  });

  document.querySelector('#cancel-edit')
    ?.addEventListener('click', clearEditor);

  // Descartar la foto pendiente al editar otro producto.
  document.querySelector('#product-list')
    ?.addEventListener('click', e => {
      if (e.target.closest('[data-p-edit]')) {
        input.value = '';
        clearEditor();
      }
    }, true);
}
