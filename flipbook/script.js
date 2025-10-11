// ======== CONFIGURA AQUÍ EL TOTAL DE PÁGINAS ========
const TOTAL_PAGES = 10; // <-- cámbialo al número real (page-1.jpg ... page-N.jpg)
// =====================================================

function makeBook(total) {
  return {
    numPages: () => total,
    getPage: (pageNum, cb) => {
      const n = pageNum + 1;
      const src = `assets/pdf-images/page-${n}.jpg`;

      const img = new Image();
      img.onload = () => cb(null, img);
      img.onerror = () => {
        console.error(`❌ No se pudo cargar ${src}. Se mostrará una página de respaldo.`);
        // Página de respaldo
        const canvas = document.createElement('canvas');
        canvas.width = 800; canvas.height = 600;
        const c = canvas.getContext('2d');
        c.fillStyle = '#f0f0f0'; c.fillRect(0,0,800,600);
        c.fillStyle = '#333'; c.font = '24px Arial'; c.textAlign = 'center';
        c.fillText(`Página ${n}`, 400, 290);
        c.font = '16px Arial';
        c.fillText('Imagen no disponible', 400, 325);
        const fallback = new Image();
        fallback.onload = () => cb(null, fallback);
        fallback.src = canvas.toDataURL();
      };
      img.src = src;
    }
  };
}

function updateIndicator(viewer) {
  const el = document.getElementById('page-indicator');
  const current = (viewer?.get_page_num?.() ?? 0) + 1;
  const total = viewer?.page_count ?? TOTAL_PAGES;
  el.textContent = `Página ${current} de ${total}`;

  document.getElementById('prev-btn').disabled = current === 1;
  document.getElementById('next-btn').disabled = current === total;
}

function showError() {
  const container = document.getElementById('flipbook-container');
  container.innerHTML = `
    <div class="error-message">
      <h3>⚠️ Error al cargar el flipbook</h3>
      <p>Verifica que existan las imágenes en <code>assets/pdf-images/</code> y que TOTAL_PAGES sea correcto.</p>
    </div>`;
}

function boot() {
  if (typeof init === 'undefined') {
    // la librería aún no está lista, reintenta
    return setTimeout(boot, 100);
  }

  const book = makeBook(TOTAL_PAGES);

  init(book, 'flipbook-container', (err, viewer) => {
    if (err || !viewer) return showError();

    // total de páginas (UI)
    const totalEl = document.getElementById('total-pages');
    if (totalEl) totalEl.textContent = TOTAL_PAGES;

    // Controles
    document.getElementById('prev-btn').addEventListener('click', () => {
      viewer.prev_page();
      updateIndicator(viewer);
    });
    document.getElementById('next-btn').addEventListener('click', () => {
      viewer.next_page();
      updateIndicator(viewer);
    });

    // Teclado
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft')  { viewer.prev_page(); updateIndicator(viewer); }
      if (e.key === 'ArrowRight') { viewer.next_page(); updateIndicator(viewer); }
    });

    // Evento del visor
    viewer.on('seen', () => updateIndicator(viewer));

    updateIndicator(viewer);
  });
}

// arranca cuando el DOM esté listo (los scripts usan defer)
boot();
