/***********************
 * Configuración
 ***********************/
const AUTO_DETECT = true;   // detectar cuántas páginas hay
const MAX_PAGES   = 150;    // límite de detección
const TOTAL_PAGES = 10;     // si desactivas AUTO_DETECT
const IMG = n => `assets/pdf-images/page-${n}.jpg`;

/***********************
 * Estado y elementos
 ***********************/
let pages = [];     // rutas válidas
let idx   = 0;      // índice del PAR visible (0->1-2, 2->3-4,...)

const book   = document.getElementById('book');
const left   = document.getElementById('page-left');
const right  = document.getElementById('page-right');
const imgL   = document.getElementById('img-left');
const imgR   = document.getElementById('img-right');

const hotL   = document.getElementById('hot-left');
const hotR   = document.getElementById('hot-right');

const slider = document.getElementById('slider');
const btnPrev= document.getElementById('btn-prev');
const btnNext= document.getElementById('btn-next');
const btnFS  = document.getElementById('btn-fs');
const btnZoom= document.getElementById('btn-zoom');

/***********************
 * Utilidades
 ***********************/
const clampPair = (i, L) => Math.max(0, Math.min(i - (i % 2), Math.max(0, L - 2)));

function preload(srcs){ srcs.forEach(s => { const i = new Image(); i.src = s; }); }

function exists(url){
  return new Promise(res=>{
    const i = new Image();
    i.onload  = () => res({ok:true,  i});
    i.onerror = () => res({ok:false, i});
    i.src = url + `?v=${Date.now()}`;
  });
}

function setBookAspectFrom(img){
  const w = img.naturalWidth || 1000;
  const h = img.naturalHeight || 1500;
  const bookAR = (2 * w) / h;              // libro abierto
  book.style.setProperty('--book-ar', bookAR);
  // fallback para navegadores sin aspect-ratio
  const size = () => { book.style.height = (book.clientWidth / bookAR) + 'px'; };
  size(); addEventListener('resize', size);
}

/***********************
 * Render & navegación
 ***********************/
function render(){
  if (!pages.length){
    btnPrev.disabled = btnNext.disabled = true;
    slider.max = slider.value = 0;
    imgL.removeAttribute('src'); imgR.removeAttribute('src');
    return;
  }

  idx = clampPair(idx, pages.length);
  imgL.src = pages[idx]     || '';
  imgR.src = pages[idx + 1] || '';

  const spreads = Math.ceil(pages.length / 2);
  slider.max = Math.max(0, spreads - 1);
  slider.value = Math.floor(idx / 2);

  const atStart = (idx <= 0);
  const atEnd   = (idx + 2 >= pages.length);
  btnPrev.disabled = hotL.disabled = atStart;
  btnNext.disabled = hotR.disabled = atEnd;
}

function next(){ if (idx + 2 < pages.length){
  right.classList.add('turn'); right.style.transform = 'rotateY(-14deg)';
  setTimeout(()=>{ idx += 2; right.classList.remove('turn'); right.style.transform='rotateY(0)'; render(); }, 520);
}}
function prev(){ if (idx > 0){
  left.classList.add('turn'); left.style.transform  = 'rotateY(14deg)';
  setTimeout(()=>{ idx -= 2; left.classList.remove('turn'); left.style.transform='rotateY(0)'; render(); }, 520);
}}

/***********************
 * Eventos
 ***********************/
hotR.addEventListener('click', next);
hotL.addEventListener('click', prev);
btnNext.addEventListener('click', next);
btnPrev.addEventListener('click', prev);

document.addEventListener('keydown', (e)=>{
  if (e.key === 'ArrowRight') next();
  if (e.key === 'ArrowLeft')  prev();
});

let sx = null;
book.addEventListener('pointerdown', e => sx = e.clientX);
book.addEventListener('pointerup',   e => {
  if (sx == null) return;
  const dx = e.clientX - sx;
  if (dx < -40) next();
  if (dx >  40) prev();
  sx = null;
});

slider.addEventListener('input', () => { idx = parseInt(slider.value,10) * 2; render(); });

btnFS.addEventListener('click', () => {
  const el = book; // pantalla completa solo del libro
  if (!document.fullscreenElement) (el.requestFullscreen || document.documentElement.requestFullscreen).call(el);
  else document.exitFullscreen && document.exitFullscreen();
});

let zoomOn = false;
btnZoom.addEventListener('click', () => {
  zoomOn = !zoomOn;
  book.classList.toggle('zoom', zoomOn);
});

/***********************
 * Inicio
 ***********************/
(async function init(){
  // Detectar páginas o usar TOTAL_PAGES
  pages = (AUTO_DETECT)
    ? await (async () => {
        const found = [];
        for (let n=1; n<=MAX_PAGES; n++){
          const r = await exists(IMG(n));
          if (!r.ok){ if (found.length) break; else continue; }
          found.push(IMG(n));
          if (found.length === 1) setBookAspectFrom(r.i); // fija ratio al detectar la primera
        }
        return found;
      })()
    : Array.from({length: TOTAL_PAGES}, (_,i)=>IMG(i+1));

  if (pages.length === 0){
    console.warn('No se detectaron imágenes. Revisa rutas: assets/pdf-images/page-1.jpg, etc.');
    return render();
  }

  // Precarga ligera
  preload(pages.slice(0,6));
  render();
})();
