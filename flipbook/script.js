/***********************
 * Configuración
 ***********************/
const AUTO_DETECT = true;   // detectar páginas automáticamente
const MAX_PAGES   = 300;    // tope de búsqueda
const TOTAL_PAGES = 10;     // si no detectas auto

/* Patrones de nombre/ext: page-1 / page-01 / page-001 + jpg/jpeg/png/webp */
const NAME_PATTERNS = n => ([
  `page-${n}`,
  `page-${String(n).padStart(2,'0')}`,
  `page-${String(n).padStart(3,'0')}`,
]);
const EXT  = ['jpg','jpeg','png','webp'];
const PATH = base => `assets/pdf-images/${base}`;

/***********************
 * Estado / elementos
 ***********************/
let pages = [];      // array 0-based con urls o null (una por hoja)
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
const easeInOutCubic = t => t<.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;

function animateFlip(side, dir, onDone){
  if (isAnimating) return;
  isAnimating = true;
  const el = side === 'left' ? left : right;
  const start = performance.now();
  const D = 520;

  function frame(now){
    const t = Math.min(1, (now - start) / D);
    const k = easeInOutCubic(t);
    const ang = (side === 'left' ? 1 : -1) * dir * 15 * k; // giro ~15°
    el.style.transform = `rotateY(${ang}deg)`;
    if (t < 1) requestAnimationFrame(frame);
    else { el.style.transform = 'rotateY(0deg)'; isAnimating = false; onDone && onDone(); }
  }
  requestAnimationFrame(frame);
}

function preload(arr){ arr.forEach(s=>{ const i=new Image(); i.src=s; }); }

function exists(url){
  return new Promise(res=>{
    const i = new Image();
    i.onload  = () => res({ok:true,  i, url});
    i.onerror = () => res({ok:false, i, url});
    i.src = url + `?v=${Date.now()}`;
  });
}

async function findOne(n){
  const cands = [];
  for (const name of NAME_PATTERNS(n))
    for (const ext of EXT)
      cands.push(PATH(`${name}.${ext}`));

  for (const u of cands){
    const r = await exists(u);
    if (r.ok) return r.url;
  }
  return null;
}

/* Fija aspect-ratio del libro a partir de la 1ª imagen válida */
function setBookAspectFrom(img){
  const w = img.naturalWidth || 1000;
  const h = img.naturalHeight || 1500;
  const ar = (2 * w) / h;               // libro abierto
  book.style.setProperty('--book-ar', ar);
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

  const L = pages[idx]     || '';
  const R = pages[idx + 1] || '';

  imgL.src = L;
  imgR.src = R;

  updateUI();
}

/***********************
 * Navegación
 ***********************/
const next = () => { if (!isAnimating && idx + 2 < pages.length) animateFlip('right', -1, () => { idx += 2; render(); }); };
const prev = () => { if (!isAnimating && idx > 0)                animateFlip('left',   1, () => { idx -= 2; render(); }); };
const first= () => { if (idx>0){ idx = 0; render(); } };
const last = () => { const lastPair = clampPair(pages.length-2, pages.length); idx = lastPair; render(); };

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
  if (dx < -40) next(); if (dx >  40) prev(); sx = null;
});

slider.addEventListener('input', () => { idx = parseInt(slider.value,10) * 2; render(); });

btnFS.addEventListener('click', () => {
  const entering = btnFS.dataset.state !== 'exit';
  const target = viewer; // fullscreen de todo (botones + libro + barra)
  if (entering){
    (target.requestFullscreen || document.documentElement.requestFullscreen).call(target);
  }else{
    document.exitFullscreen && document.exitFullscreen();
  }
});
document.addEventListener('fullscreenchange', () => {
  const fs = !!document.fullscreenElement;
  btnFS.dataset.state = fs ? 'exit' : 'enter';
  btnFS.textContent   = fs ? '⤡' : '⤢';
});

/***********************
 * Init (detección con “huecos” preservados)
 ***********************/
(async function init(){
  if (AUTO_DETECT){
    // construye arreglo 1..N con url o null; detiene tras varios huecos seguidos
    const map = [];          // 1-based temporal
    let found = false;
    let missesTail = 0;

    for (let n=1; n<=MAX_PAGES; n++){
      const url = await findOne(n);
      if (url){
        map[n] = url;
        missesTail = 0;
        if (!found){
          const r = await exists(url);
          if (r.ok) setBookAspectFrom(r.i);
          found = true;
        }
      } else {
        if (found){
          map[n] = null;     // mantiene el par (1,2), (3,4) aunque falte
          missesTail++;
          if (missesTail >= 6) break;
        }
      }
    }

    // compacta a 0-based hasta el último índice definido
    let last = 0;
    for (let i=map.length-1; i>=1; i--) if (map[i] !== undefined){ last = i; break; }
    pages = [];
    for (let i=1; i<=last; i++) pages.push(map[i] ?? null);
  } else {
    pages = Array.from({length: TOTAL_PAGES}, (_,i)=>`assets/pdf-images/page-${i+1}.jpg`);
  }

  if (pages.length) preload(pages.slice(0,6));
  render();
})();
