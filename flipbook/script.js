/***********************
 * Config y “tuning”
 ***********************/
const AUTO_DETECT = true;
const MAX_PAGES   = 300;

const FLIP_MS            = 640;  // click
const FLIP_MS_DRAG_DONE  = 380;  // completar tras drag
const FLIP_MS_RETURN     = 260;  // rebotar atrás
const DRAG_COMPLETE_T    = 0.45; // umbral completar
const WHEEL_THROTTLE_MS  = 320;

const NAME_PATTERNS = n => ([`page-${n}`, `page-${String(n).padStart(2,'0')}`, `page-${String(n).padStart(3,'0')}`]);
const EXT  = ['jpg','jpeg','png','webp'];
const PATH = base => `assets/pdf-images/${base}`;

/***********************
 * Estado / refs
 ***********************/
let pages = [];                 // 1..N (index 0 vacío)
let isAnimating = false;
let wheelLockUntil = 0;
let suppressClick = false;

const viewer = document.getElementById('viewer');
const book   = document.getElementById('book');

const imgL   = document.getElementById('img-left');
const imgR   = document.getElementById('img-right');
const spinL  = document.getElementById('spin-left');
const spinR  = document.getElementById('spin-right');

const slider = document.getElementById('slider');
const fill   = document.getElementById('fill');

const btnPrev  = document.getElementById('btn-prev');
const btnNext  = document.getElementById('btn-next');
const btnFirst = document.getElementById('btn-first');
const btnLast  = document.getElementById('btn-last');
const btnFS    = document.getElementById('btn-fs');

const hintL = document.getElementById('edge-left');
const hintR = document.getElementById('edge-right');

const dragLeft  = document.getElementById('drag-left');
const dragRight = document.getElementById('drag-right');

/* Modo de inicio (portada/pliego) */
const START_MODE = (book.dataset.start || 'cover').toLowerCase();     // 'cover' | 'spread'
const INITIAL_SPREAD = (book.dataset.initialSpread || '2-3').toLowerCase(); // '1-2' | '2-3'

/* Estado de vista */
let view = { mode: 'cover', pairLeft: 2 };
let pageAR = 2/3; // ancho/alto de UNA página (calculado)

/***********************
 * Util
 ***********************/
const easeInOut = t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const TOTAL = ()=> pages.length - 1; // páginas reales

function setPageARFrom(img){
  const w = img.naturalWidth||1000, h = img.naturalHeight||1500;
  pageAR = w/h;
  document.documentElement.style.setProperty('--page-ar', pageAR);
}

function applyBookARClass(){
  // El libro siempre mantiene AR de spread; en portada solo ocultamos izquierda
  if (view.mode==='cover') book.classList.add('single');
  else                     book.classList.remove('single');
}

/* Detectar existencia */
function exists(url){return new Promise(res=>{const i=new Image();i.onload=()=>res({ok:true,i,url});i.onerror=()=>res({ok:false,url});i.src=url})}
async function findOne(n){
  for (const name of NAME_PATTERNS(n))
    for (const ext of EXT){
      const u=PATH(`${name}.${ext}`);
      const r=await exists(u);
      if(r.ok) return r;
    }
  return null;
}

/* ⚡ Preparación avanzada: fetch + createImageBitmap + ObjectURL + decode + LRU */
const preparedURL = new Map();
const preparedLRU = [];
const PREP_LIMIT = 40;

async function prepareImage(url){
  if (!url || preparedURL.has(url)) return;
  try{
    const res = await fetch(url, {cache:'force-cache'});
    const blob = await res.blob();
    if (self.createImageBitmap) { try{ await createImageBitmap(blob); }catch{} }
    const obj = URL.createObjectURL(blob);
    preparedURL.set(url, obj);
    preparedLRU.push(url);
    if (preparedLRU.length>PREP_LIMIT){
      const old = preparedLRU.shift();
      const u = preparedURL.get(old);
      preparedURL.delete(old);
      URL.revokeObjectURL(u);
    }
    const img = new Image(); img.src = obj; if (img.decode){ try{ await img.decode(); }catch{} }
  }catch(e){}
}
const getPreparedURL = url => preparedURL.get(url) || url;

/***********************
 * Mapeo de vista -> índices
 ***********************/
function indicesFromView(v){
  if (v.mode==='cover') return { left:null, right:1 };
  const L=v.pairLeft, R=L+1, N=TOTAL();
  return { left: (L<=N?L:null), right: (R<=N?R:null) };
}
function nextViewFrom(v){
  const N=TOTAL();
  if (v.mode==='cover'){
    return { mode:'spread', pairLeft:2 };
  } else {
    const maxLeft = (N % 2 === 0) ? N-1 : N;
    const newL = Math.min(v.pairLeft+2, maxLeft);
    return { mode:'spread', pairLeft:newL };
  }
}
function prevViewFrom(v){
  if (v.mode==='cover'){ return v; }
  if (v.pairLeft<=2){ return { mode:'cover' }; }
  return { mode:'spread', pairLeft:v.pairLeft-2 };
}
function canNext(){
  const N=TOTAL();
  if (N<=0) return false;
  if (view.mode==='cover') return N>=2; // abrir a (2,3)
  const maxLeft = (N % 2 === 0) ? N-1 : N;
  return view.pairLeft < maxLeft;
}
function canPrev(){
  return !(view.mode==='cover'); // siempre puedes volver a portada
}

/***********************
 * Render helpers
 ***********************/
function applySrc(img, url, spinner){
  if (!url){
    img.removeAttribute('src'); img.style.opacity=0; spinner.classList.add('hidden'); return;
  }
  spinner.classList.remove('hidden'); img.style.opacity=0;
  const finalURL = getPreparedURL(url);
  img.onload  = ()=>{ spinner.classList.add('hidden'); img.style.opacity = 1; };
  img.onerror = ()=>{ spinner.classList.add('hidden'); img.style.opacity = 0; };
  img.decoding = 'async'; img.loading='eager';
  img.src = finalURL;
  if (img.complete && img.naturalWidth>0){ spinner.classList.add('hidden'); img.style.opacity=1; }
}

function paintStaticByIndices(leftIndex, rightIndex){
  // Portada preview: oculta izquierda
  if (leftIndex){
    document.getElementById('page-left').style.display = '';
    applySrc(imgL, pages[leftIndex], spinL);
  } else {
    document.getElementById('page-left').style.display = 'none';
    spinL.classList.add('hidden'); imgL.removeAttribute('src');
  }
  if (rightIndex){
    applySrc(imgR, pages[rightIndex], spinR);
  } else {
    applySrc(imgR, null, spinR);
  }
}

function updateUI(){
  const N = TOTAL();
  const spreads = Math.max(0, Math.ceil(Math.max(0, N-1)/2)); // pliegos desde (2,3)

  slider.max = spreads;
  if (view.mode==='cover'){ slider.value = 0; fill.style.width = '0%'; }
  else {
    const step = Math.max(1, Math.floor((view.pairLeft-2)/2)+1);
    slider.value = Math.min(spreads, step);
    const pct = spreads>0 ? (slider.value / spreads) * 100 : 0;
    fill.style.width = (isFinite(pct)?pct:0)+'%';
  }

  const atCover = (view.mode==='cover');
  const atEnd   = (view.mode==='spread') && !canNext();

  btnPrev.disabled  = atCover;
  btnFirst.disabled = atCover;
  btnNext.disabled  = atEnd;
  btnLast.disabled  = atEnd;

  hintL.disabled = atCover;
  hintR.disabled = atEnd;

  // En portada, desactiva arrastre izquierdo
  dragLeft.style.pointerEvents = atCover ? 'none' : 'auto';
}

function render(){
  applyBookARClass();
  const {left,right} = indicesFromView(view);
  paintStaticByIndices(left, right);
  updateUI();
}

/***********************
 * Overlay y animación
 ***********************/
function makeTurnOverlay(direction){
  const turn = document.createElement('div');
  turn.className = 'turn';
  if (direction==='backward') turn.classList.add('backward');

  const front = document.createElement('div'); front.className='face front';
  const back  = document.createElement('div'); back.className='face back';

  const fL = document.createElement('img'); fL.className='half left';
  const fR = document.createElement('img'); fR.className='half right';
  const bL = document.createElement('img'); bL.className='half left';
  const bR = document.createElement('img'); bR.className='half right';

  front.append(fL,fR); back.append(bL,bR);

  const shade = document.createElement('div'); shade.className='turnShade';

  // Caras en función del estado ACTUAL (antes de cambiar view)
  const N=TOTAL();
  if (direction==='forward'){
    if (view.mode==='cover'){
      fR.src = getPreparedURL(pages[1] || '');
      bL.src = getPreparedURL(pages[2] || '');
      fL.style.opacity=0; bR.style.opacity=0;
    } else {
      const curR = view.pairLeft + 1;
      const nextL= view.pairLeft + 2;
      fR.src = getPreparedURL(pages[curR] || '');
      bL.src = getPreparedURL(pages[nextL] || '');
      fL.style.opacity=0; bR.style.opacity=0;
    }
  } else { // backward
    if (view.mode==='spread' && view.pairLeft<=2){
      fL.src = getPreparedURL(pages[2] || '');
      bR.src = getPreparedURL(pages[1] || '');
      fR.style.opacity=0; bL.style.opacity=0;
    } else if (view.mode==='spread'){
      const curL = view.pairLeft;
      const prevR= view.pairLeft - 1;
      fL.src = getPreparedURL(pages[curL] || '');
      bR.src = getPreparedURL(pages[prevR] || '');
      fR.style.opacity=0; bL.style.opacity=0;
    } else {
      // cover hacia atrás no aplica
    }
  }

  turn.append(front, back, shade);
  book.appendChild(turn);
  return {turn, shade};
}

function setTurnDeg(turnEl, shadeEl, deg){
  turnEl.style.transform = `rotateY(${deg}deg)`;
  const k = Math.sin(Math.min(Math.PI, (Math.abs(deg)/180)*Math.PI)); // 0..1..0
  shadeEl.style.opacity = 0.50 * k;
}

function animateTurn(direction, fromDeg, toDeg, ms, gatePromise, onDone){
  if (isAnimating) return;
  isAnimating = true;
  book.classList.remove('dragging');

  const {turn, shade} = makeTurnOverlay(direction);
  const t0 = performance.now();

  function frame(now){
    const t = Math.min(1,(now-t0)/ms);
    const d = fromDeg + (toDeg-fromDeg)*easeInOut(t);
    setTurnDeg(turn, shade, d);
    if(t<1) requestAnimationFrame(frame);
    else{
      Promise.resolve(gatePromise).then(()=>{
        turn.remove(); isAnimating = false; onDone && onDone();
      });
    }
  }
  requestAnimationFrame(frame);
}

/***********************
 * PREVIEW inmediato (fondo cambia al empezar)
 ***********************/
function previewStatic(direction){
  const nextV = direction==='forward' ? nextViewFrom(view) : prevViewFrom(view);
  const idxs  = indicesFromView(nextV);
  // Mostrar ya el fondo del destino (izquierda puede “no existir” en portada)
  if (nextV.mode==='cover') book.classList.add('single'); else book.classList.remove('single');
  paintStaticByIndices(idxs.left, idxs.right);
  return nextV; // para commit si se confirma
}

/***********************
 * Navegación
 ***********************/
function goNext(){
  if (!canNext() || isAnimating) return;

  // Prepara recursos de destino
  const gate = (view.mode==='cover')
    ? Promise.all([ prepareImage(pages[2]), prepareImage(pages[3]) ])
    : Promise.all([ prepareImage(pages[view.pairLeft+2]), prepareImage(pages[view.pairLeft+3]) ]);

  // PREVIEW de fondo inmediato
  const nextV = previewStatic('forward');

  // Anima la hoja actual saliente
  animateTurn('forward', 0, -180, FLIP_MS, gate, ()=>{
    view = nextV; // commit
    render();
  });
}
function goPrev(){
  if (!canPrev() || isAnimating) return;

  const gate = (view.mode==='spread' && view.pairLeft<=2)
    ? Promise.all([ prepareImage(pages[1]) ])
    : (view.mode==='spread'
        ? Promise.all([ prepareImage(pages[view.pairLeft-2]), prepareImage(pages[view.pairLeft-1]) ])
        : Promise.resolve());

  const prevV = previewStatic('backward');

  animateTurn('backward', 0, 180, FLIP_MS, gate, ()=>{
    view = prevV;
    render();
  });
}
function goFirst(){
  if (isAnimating) return;
  if (START_MODE==='cover'){ view={mode:'cover'}; }
  else { view={mode:'spread', pairLeft: (INITIAL_SPREAD==='1-2')?1:2}; }
  render();
}
function goLast(){
  if (isAnimating) return;
  const N = TOTAL(); if (N<=0) return;
  if (N % 2 === 1){ view={mode:'spread', pairLeft:N}; }  // (n, null)
  else            { view={mode:'spread', pairLeft:N-1}; } // (n-1, n)
  render();
}

/***********************
 * Controles / entrada
 ***********************/
btnNext.addEventListener('click', goNext);
btnPrev.addEventListener('click', goPrev);
btnFirst.addEventListener('click', goFirst);
btnLast.addEventListener('click', goLast);

document.addEventListener('keydown', e=>{
  if(e.key==='ArrowRight') goNext();
  if(e.key==='ArrowLeft')  goPrev();
});

/* Click simple: mitad izq/der */
book.addEventListener('click', (e)=>{
  if (isAnimating || suppressClick) return;
  const rect = book.getBoundingClientRect();
  const centerX = rect.left + rect.width/2;
  if (e.clientX < centerX) goPrev(); else goNext();
});

/* Rueda del mouse con throttle y sin salirse de límites */
book.addEventListener('wheel', (e)=>{
  e.preventDefault();
  if (isAnimating) return;
  const now = performance.now();
  if (now < wheelLockUntil) return;
  if (e.deltaY > 0){ if (canNext()) goNext(); }
  else if (e.deltaY < 0){ if (canPrev()) goPrev(); }
  wheelLockUntil = now + WHEEL_THROTTLE_MS;
}, { passive:false });

/***********************
 * Drag por BORDE (vertical completo, estrecho)
 ***********************/
let drag = null; // {dir, overlay, shade, rect, startX, t, deg, pointerId, preview}

function startDrag(side, e){
  if (isAnimating) return;
  if (side==='left' && !canPrev()) return;
  if (side==='right' && !canNext()) return;

  suppressClick = true;
  book.classList.add('dragging');

  const pointerId = e.pointerId;
  const dir = (side==='right') ? 'forward' : 'backward';

  // PREVIEW inmediato del fondo
  const targetV = previewStatic(dir);

  const {turn, shade} = makeTurnOverlay(dir);
  const rect = book.getBoundingClientRect();
  const startX = e.clientX;

  e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(pointerId);

  setTurnDeg(turn, shade, dir==='forward' ? -8 : 8);

  drag = { dir, overlay:turn, shade, rect, startX, t:0, deg:0, pointerId, preview:targetV };
}
function moveDrag(e){
  if (!drag) return;
  const x = e.clientX;
  const {rect, dir} = drag;
  const center = rect.left + rect.width/2;

  let t;
  if (dir==='forward'){ // borde derecho -> centro
    const from = rect.right; const to = center;
    t = Math.min(1, Math.max(0, (from - x) / (from - to)));
  } else {              // borde izquierdo -> centro
    const from = rect.left; const to = center;
    t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  }
  drag.t = t;

  const deg = (dir==='forward') ? -180*t : 180*t;
  drag.deg = deg;
  setTurnDeg(drag.overlay, drag.shade, deg);
}
function endDrag(e){
  if (!drag) return;
  const {dir, t, overlay, shade, deg, pointerId, preview} = drag;
  drag = null;

  try{ e.currentTarget.releasePointerCapture && e.currentTarget.releasePointerCapture(pointerId); }catch{}

  if (t>DRAG_COMPLETE_T){
    const gate = (dir==='forward')
      ? (view.mode==='cover'
          ? Promise.all([ prepareImage(pages[2]), prepareImage(pages[3]) ])
          : Promise.all([ prepareImage(pages[view.pairLeft+2]), prepareImage(pages[view.pairLeft+3]) ]))
      : (view.mode==='spread' && view.pairLeft<=2
          ? Promise.all([ prepareImage(pages[1]) ])
          : Promise.all([ prepareImage(pages[view.pairLeft-2]), prepareImage(pages[view.pairLeft-1]) ]));

    const ms = FLIP_MS_DRAG_DONE, from = deg, to = (dir==='forward') ? -180 : 180;
    isAnimating = true;
    const t0 = performance.now();
    function frame(now){
      const k = Math.min(1,(now-t0)/ms);
      const d = from + (to-from)*easeInOut(k);
      setTurnDeg(overlay, shade, d);
      if (k<1) requestAnimationFrame(frame);
      else {
        Promise.resolve(gate).then(()=>{
          overlay.remove(); isAnimating=false;
          view = preview; // commit definitivo del destino
          book.classList.remove('dragging');
          render();
        });
      }
    }
    requestAnimationFrame(frame);
  } else {
    // Cancelar → volver a la vista original
    const ms = FLIP_MS_RETURN, from = deg, to = 0;
    isAnimating = true;
    const t0 = performance.now();
    function frame(now){
      const k = Math.min(1,(now-t0)/ms);
      const d = from + (to-from)*easeInOut(k);
      setTurnDeg(overlay, shade, d);
      if (k<1) requestAnimationFrame(frame);
      else {
        overlay.remove(); isAnimating=false; book.classList.remove('dragging');
        // volver a vista original
        render();
      }
    }
    requestAnimationFrame(frame);
  }

  setTimeout(()=>{ suppressClick=false; }, 80);
}

/* Listeners drag (borde) */
for (const el of [dragLeft, dragRight]){
  el.addEventListener('pointerdown', e=>{
    const side = (e.currentTarget===dragRight) ? 'right' : 'left';
    startDrag(side, e);
  });
  el.addEventListener('pointermove', moveDrag);
  el.addEventListener('pointerup',   endDrag);
  el.addEventListener('pointercancel', endDrag);
}

/***********************
 * Fullscreen
 ***********************/
btnFS.addEventListener('click', ()=>{
  const entering = btnFS.dataset.state!=='exit';
  const t = viewer;
  if (entering){ (t.requestFullscreen||document.documentElement.requestFullscreen).call(t); }
  else { document.exitFullscreen && document.exitFullscreen(); }
});
document.addEventListener('fullscreenchange', ()=>{
  const fs = !!document.fullscreenElement;
  btnFS.dataset.state = fs ? 'exit':'enter';
  btnFS.textContent   = fs ? '⤡'  : '⤢';
});

/***********************
 * Slider → navega por pliegos (sin salirse)
 ***********************/
slider.addEventListener('input', ()=>{
  const N = TOTAL();
  const spreads = Math.max(0, Math.ceil(Math.max(0, N-1)/2));
  let target = Math.min(spreads, Math.max(0, parseInt(slider.value,10)));

  if (target===0){
    // portada o primer spread según flags
    if (START_MODE==='cover') view={mode:'cover'};
    else view={mode:'spread', pairLeft:(INITIAL_SPREAD==='1-2')?1:2};
  } else {
    view={mode:'spread', pairLeft: 2 + (target-1)*2};
    const maxLeft = (N % 2 === 0) ? N-1 : N;
    if (view.pairLeft>maxLeft) view.pairLeft=maxLeft;
  }
  render();
});

/***********************
 * Init (detección de assets)
 ***********************/
(async function init(){
  const map=[]; let firstImg=null, found=false, misses=0;
  for(let n=1;n<=MAX_PAGES;n++){
    const r = await findOne(n);
    if(r){
      map[n]=r.url; misses=0;
      if(!firstImg){ firstImg=r.i; }
      found=true;
    } else if(found){
      map[n]=null; misses++;
      if(misses>=6) break;
    }
  }
  // última existente (truthy)
  let last=0; for(let i=map.length-1;i>=1;i--) if(map[i]){ last=i; break; }
  pages = Array.from({length:last+1},(_,i)=>map[i]||null); // 0..last; páginas reales 1..last

  if (firstImg){ setPageARFrom(firstImg); }

  // Estado inicial según flags
  if (START_MODE==='cover'){
    view={mode:'cover'};
  } else {
    view={mode:'spread', pairLeft: (INITIAL_SPREAD==='1-2') ? 1 : 2};
  }

  // Semilla de preparación
  const seedIdx = [1,2,3,4,5].filter(i => i<=TOTAL());
  await Promise.all(seedIdx.map(i=>prepareImage(pages[i])));

  // Flechas guía
  hintL.addEventListener('click', ()=>{ if (canPrev()) goPrev(); });
  hintR.addEventListener('click', ()=>{ if (canNext()) goNext(); });

  render();
})();
