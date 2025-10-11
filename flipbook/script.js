// ===== Configura aquí tus rutas =====
// Genera automáticamente page-1.jpg ... page-N.jpg
const TOTAL_PAGES = 8; // <<-- CAMBIA esto a tu total real
const PAGES = Array.from({length: TOTAL_PAGES}, (_,i) => `assets/pdf-images/page-${i+1}.jpg`);
// ====================================

const book = document.getElementById('book');
const left = document.getElementById('left');
const right = document.getElementById('right');
const hotL = document.getElementById('hot-left');
const hotR = document.getElementById('hot-right');

// Estado: índice del par visible (0=> páginas 1-2, 2=>3-4, ...)
let idx = 0;

// Utilidades
const clampPairStart = (i) => Math.max(0, Math.min(i - (i % 2), Math.max(0, PAGES.length - 2)));
const bg = (el, url) => { el.style.backgroundImage = `url("${url}")`; };

function render(){
  idx = clampPairStart(idx);
  const L = PAGES[idx]     || "";
  const R = PAGES[idx + 1] || "";

  bg(left,  L);
  bg(right, R);

  // activar / desactivar hotspots
  hotL.disabled = (idx <= 0);
  hotR.disabled = (idx + 2 >= PAGES.length);
}

// Animaciones
function flipNext(){
  if (idx + 2 >= PAGES.length) return;
  right.classList.add('flip');
  right.style.transform = 'rotateY(-180deg)';
  setTimeout(()=>{
    idx += 2;
    right.classList.remove('flip');
    right.style.transform = 'rotateY(0deg)';
    render();
  }, 600);
}

function flipPrev(){
  if (idx <= 0) return;
  left.classList.add('flip');
  left.style.transform = 'rotateY(180deg)';
  setTimeout(()=>{
    idx -= 2;
    left.classList.remove('flip');
    left.style.transform = 'rotateY(0deg)';
    render();
  }, 600);
}

// Eventos
hotR.addEventListener('click', flipNext);
hotL.addEventListener('click', flipPrev);

document.addEventListener('keydown', (e)=>{
  if (e.key === 'ArrowRight') flipNext();
  if (e.key === 'ArrowLeft')  flipPrev();
});

// Swipe táctil
let startX = null;
book.addEventListener('pointerdown', e => { startX = e.clientX; });
book.addEventListener('pointerup',   e => {
  if (startX == null) return;
  const dx = e.clientX - startX;
  if (dx < -40) flipNext();
  if (dx >  40) flipPrev();
  startX = null;
});

// Pre-carga ligera (mejor UX en primeras páginas)
PAGES.slice(0,4).forEach(src => { const i = new Image(); i.src = src; });

render();
