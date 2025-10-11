/*******************************
 * Configuración
 *******************************/
const AUTO_DETECT = true;     // intenta detectar cuántas páginas hay
const MAX_PAGES   = 80;       // límite de detección
const TOTAL_PAGES = 10;       // si desactivas AUTO_DETECT, usa este número
const IMG = (n) => `assets/pdf-images/page-${n}.jpg`;

/*******************************
 * Estado
 *******************************/
let pages = [];        // rutas válidas detectadas
let idx   = 0;         // índice del spread (par): 0->(1,2), 2->(3,4)...
const left  = document.getElementById('page-left');
const right = document.getElementById('page-right');
const hotL  = document.getElementById('hot-left');
const hotR  = document.getElementById('hot-right');
const book  = document.getElementById('book');
const slider= document.getElementById('slider');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnFS   = document.getElementById('btn-fs');

/*******************************
 * Utilidades
 *******************************/
const clampPair = (i, L) => Math.max(0, Math.min(i - (i % 2), Math.max(0, L - 2)));
const setBG = (el, url) => el.style.backgroundImage = url ? `url("${url}")` : 'none';

function preload(arr){
  arr.forEach(src => { const i = new Image(); i.src = src; });
}

function requestFS(){
  const el = document.documentElement;
  if (!document.fullscreenElement) (book.requestFullscreen || el.requestFullscreen).call(book);
  else document.exitFullscreen && document.exitFullscreen();
}

/*******************************
 * Detección de páginas y ratio
 *******************************/
function exists(url){
  return new Promise(res=>{
    const i = new Image();
    i.onload  = () => res({ok:true,  i});
    i.onerror = () => res({ok:false, i});
    i.src = url + `?v=${Date.now()}`; // evita caché
  });
}

async function detectPages(){
  const found = [];
  for (let n=1; n<=MAX_PAGES; n++){
    const r = await exists(IMG(n));
    if (!r.ok){
      // detenemos al primer fallo después de haber encontrado al menos una
      if (found.length > 0) break;
      else continue;
    }
    found.push(IMG(n));
  }
  return found;
}

function setBookAspectFrom(img){
  const w = img.naturalWidth || 1000;
  const h = img.naturalHeight || 1500;
  // libro abierto = 2 páginas
  const bookAR = (2 * w) / h;
  book.style.setProperty('--book-ar', bookAR);
}

/*******************************
 * Render y navegación
 *******************************/
function render(){
  if (pages.length < 1){
    left.style.background = right.style.background = '#fff';
    btnPrev.disabled = btnNext.disabled = true;
    slider.max = 0; slider.value = 0;
    return;
  }

  idx = clampPair(idx, pages.length);
  setBG(left,  pages[idx]     || '');
  setBG(right, pages[idx + 1] || '');

  hotL.disabled = (idx <= 0);
  hotR.disabled = (idx + 2 >= pages.length);
  btnPrev.disabled = hotL.disabled;
  btnNext.disabled = hotR.disabled;

  const spreads = Math.ceil(pages.length / 2);
  slider.max = Math.max(0, spreads - 1);
  slider.value = Math.floor(idx / 2);
}

function next(){ if (idx + 2 < pages.length){
  right.classList.add('flip');
  right.style.transform = 'rotateY(-12deg)';
  setTimeout(()=>{ idx += 2; right.classList.remove('flip'); right.style.transform = 'rotateY(0)'; render(); }, 520);
}}

function prev(){ if (idx > 0){
  left.classList.add('flip');
  left.style.transform = 'rotateY(12deg)';
  setTimeout(()=>{ idx -= 2; left.classList.remove('flip'); left.style.transform = 'rotateY(0)'; render(); }, 520);
}}

/*******************************
 * Eventos
 *******************************/
hotR.addEventListener('click', next);
hotL.addEventListener('click', prev);
btnNext.addEventListener('click', next);
btnPrev.addEventListener('click', prev);

document.addEventListener('keydown', (e)=>{
  if (e.key === 'ArrowRight') next();
  if (e.key === 'ArrowLeft')  prev();
});

let startX = null;
book.addEventListener('pointerdown', e => startX = e.clientX);
book.addEventListener('pointerup',   e => {
  if (startX == null) return;
  const dx = e.clientX - startX;
  if (dx < -40) next();
  if (dx >  40) prev();
  startX = null;
});

slider.addEventListener('input', () => { idx = parseInt(slider.value,10) * 2; render(); });
btnFS.addEventListener('click', requestFS);

/*******************************
 * Init
 *******************************/
(async function init(){
  // 1) detectar páginas o usar TOTAL_PAGES
  pages = AUTO_DETECT
    ? await detectPages()
    : Array.from({length: TOTAL_PAGES}, (_,i)=>IMG(i+1));

  if (pages.length === 0){
    console.warn('No se detectaron imágenes. Verifica assets/pdf-images/page-1.jpg, etc.');
    render();
    return;
  }

  // 2) fijar aspecto según la primera imagen
  const first = await exists(pages[0]);
  if (first.ok) setBookAspectFrom(first.i);

  // 3) precarga ligera y render
  preload(pages.slice(0,6));
  render();
})();
