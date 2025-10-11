/***********************
 * Configuración
 ***********************/
const AUTO_DETECT = true;   // intenta detectar cuántas páginas hay
const MAX_PAGES   = 200;    // tope de búsqueda
const TOTAL_PAGES = 10;     // si desactivas AUTO_DETECT
const IMG = n => `assets/pdf-images/page-${n}.jpg`;

/***********************
 * Estado / elementos
 ***********************/
let pages = [];      // rutas válidas detectadas (una por hoja)
let idx   = 0;       // índice PAR: 0=(1,2), 2=(3,4)...
let isAnimating = false;

const viewer = document.getElementById('viewer');
const book   = document.getElementById('book');
const left   = document.getElementById('page-left');
const right  = document.getElementById('page-right');
const imgL   = document.getElementById('img-left');
const imgR   = document.getElementById('img-right');

const hotL   = document.getElementById('hot-left');
const hotR   = document.getElementById('hot-right');

const slider = document.getElementById('slider');
const fill   = document.getElementById('fill');

const btnPrev  = document.getElementById('btn-prev');
const btnNext  = document.getElementById('btn-next');
const btnFirst = document.getElementById('btn-first');
const btnLast  = document.getElementById('btn-last');
const btnFS    = document.getElementById('btn-fs');

/***********************
 * Utilidades
 ***********************/
const clampPair = (i, L) => Math.max(0, Math.min(i - (i % 2), Math.max(0, L - 2)));
function easeInOutCubic(t){ return t<.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }

function animateFlip(side, dir, onDone){
  if (isAnimating) return;
  isAnimating = true;
  const el = side === 'left' ? left : right;
  const start = performance.now();
  const D = 520;

  function frame(now){
    const t = Math.min(1, (now - start) / D);
    const k = easeInOutCubic(t);
    const ang = (side === 'left' ? 1 : -1) * dir * 15 * k; // ≈15°
    el.style.transform = `rotateY(${ang}deg)`;
    if (t < 1) requestAnimationFrame(frame);
    else {
      el.style.transform = 'rotateY(0deg)';
      isAnimating = false;
      onDone && onDone();
    }
  }
  requestAnimationFrame(frame);
}

function preload(arr){ arr.forEach(s=>{ const i=new Image(); i.src=s; }); }

function exists(url){
  return new Promise(res=>{
    const i = new Image();
    i.onload  = () => res({ok:true,  i});
    i.onerror = () => res({ok:false,i});
    i.src = url + `?v=${Date.now()}`; // evita caché
  });
}

function setBookAspectFrom(img){
  const w = img.naturalWidth || 1000;
  const h = img.naturalHeight || 1500;
  const ar = (2 * w) / h;                        // libro abierto
  book.style.setProperty('--book-ar', ar);
  // fallback si el navegador no soporta aspect-ratio
  const resize = () => { book.style.height = (book.clientWidth / ar) + 'px'; };
  resize(); addEventListener('resize', resize);
}

/***********************
 * Render & UI
 ***********************/
function updateUI(){
  const spreads = Math.ceil(pages.length / 2);
  slider.max = Math.max(0, spreads - 1);
  slider.value = Math.floor(idx / 2);
  const pct = spreads > 1 ? (slider.value / (spreads - 1)) * 100 : 0;
  fill.style.width = (isFinite(pct) ? pct : 0) + '%';

  const atStart = (idx <= 0);
  const atEnd   = (idx + 2 >= pages.length);
  btnPrev.disabled = hotL.disabled = atStart;
  btnNext.disabled = hotR.disabled = atEnd;
  btnFirst.disabled = atStart;
  btnLast.disabled  = atEnd;
}

function render(){
  if (!pages.length){
    imgL.removeAttribute('src'); imgR.removeAttribute('src');
    updateUI(); return;
  }
  idx = clampPair(idx, pages.length);
  imgL.src = pages[idx]     || '';
  imgR.src = pages[idx + 1] || '';  // derecha siempre intenta cargar su hoja
  updateUI();
}

/***********************
 * Navegación
 ***********************/
function next(){ if (!isAnimating && idx + 2 < pages.length) animateFlip('right', -1, () => { idx += 2; render(); }); }
function prev(){ if (!isAnimating && idx > 0)                animateFlip('left',   1, () => { idx -= 2; render(); }); }
function first(){ if (idx>0){ idx = 0; render(); } }
function last(){ const lastPair = clampPair(pages.length-2, pages.length); idx = lastPair; render(); }

/***********************
 * Eventos
 ***********************/
hotR.addEventListener('click', next);
hotL.addEventListener('click', prev);
btnNext.addEventListener('click', next);
btnPrev.addEventListener('click', prev);
btnFirst.addEventListener('click', first);
btnLast.addEventListener('click', last);

document.addEventListener('keydown', (e)=>{
  if (e.key === 'ArrowRight') next();
  if (e.key === 'ArrowLeft')  prev();
});

let sx = null;
book.addEventListener('pointerdown', e => sx = e.clientX);
book.addEventListener('pointerup',   e => {
  if (sx == null) return; const dx = e.clientX - sx;
  if (dx < -40) next(); if (dx > 40) prev(); sx = null;
});

slider.addEventListener('input', () => { idx = parseInt(slider.value,10) * 2; render(); });

btnFS.addEventListener('click', () => {
  const entering = btnFS.dataset.state !== 'exit';
  if (entering){
    (viewer.requestFullscreen || document.documentElement.requestFullscreen).call(viewer);
  }else{
    document.exitFullscreen && document.exitFullscreen();
  }
});

document.addEventListener('fullscreenchange', () => {
  const fs = !!document.fullscreenElement;
  btnFS.dataset.state = fs ? 'exit' : 'enter';
  btnFS.textContent   = fs ? '⤡' : '⤢'; // cambia icono
});

/***********************
 * Init
 ***********************/
(async function init(){
  // Detección: recorre hasta MAX_PAGES, no se corta en el primer hueco.
  if (AUTO_DETECT){
    const list = [];
    let gaps = 0;                 // tolera huecos (por si falta page-2.jpg, etc.)
    const GAP_LIMIT = 8;          // detén cuando encuentre 8 seguidas que no existen
    for (let n=1; n<=MAX_PAGES; n++){
      const r = await exists(IMG(n));
      if (r.ok){
        list.push(IMG(n));
        gaps = 0;
        if (list.length === 1) setBookAspectFrom(r.i); // fija ratio desde la primera
      } else {
        gaps++;
        if (list.length && gaps >= GAP_LIMIT) break;
      }
    }
    pages = list;
  } else {
    pages = Array.from({length: TOTAL_PAGES}, (_,i)=>IMG(i+1));
  }

  if (pages.length === 0){
    console.warn('No se detectaron imágenes. Verifica assets/pdf-images/page-1.jpg, etc.');
  }else{
    preload(pages.slice(0,6));
  }
  render();
})();
