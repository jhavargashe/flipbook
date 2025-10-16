/********* Config *********/
const AUTO_DETECT = true;
const MAX_PAGES   = 300;

const FLIP_MS            = 640;
const FLIP_MS_DRAG_DONE  = 380;
const FLIP_MS_RETURN     = 260;
const DRAG_COMPLETE_T    = 0.45;
const WHEEL_THROTTLE_MS  = 320;

const NAME_PATTERNS = n => ([`page-${n}`, `page-${String(n).padStart(2,'0')}`, `page-${String(n).padStart(3,'0')}`]);
const EXT  = ['jpg','jpeg','png','webp'];
const PATH = base => `assets/pdf-images/${base}`;

/********* Estado / refs *********/
let pages = [];                 // 1..N (index 0 vacío)
let isAnimating = false;
let wheelLockUntil = 0;
let suppressClick = false;

const viewer = document.getElementById('viewer');
const book   = document.getElementById('book');

const pageLeft  = document.getElementById('page-left');
const pageRight = document.getElementById('page-right');

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

const START_MODE     = (book.dataset.start || 'cover').toLowerCase();       // 'cover' | 'spread'
const INITIAL_SPREAD = (book.dataset.initialSpread || '2-3').toLowerCase(); // '1-2' | '2-3'

let view = { mode: 'cover', pairLeft: 2 };
let pageAR = 2/3;

/********* Util *********/
const easeInOut = t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const clamp01 = x => Math.max(0, Math.min(1, x));
const TOTAL = ()=> pages.length - 1;

function setPageARFrom(img){
  const w = img.naturalWidth||1000, h = img.naturalHeight||1500;
  pageAR = w/h;
  document.documentElement.style.setProperty('--page-ar', pageAR);
}

function applyBookARClass(){
  if (view.mode==='cover') book.classList.add('single');
  else                     book.classList.remove('single');
}

function exists(url){return new Promise(res=>{const i=new Image();i.onload=()=>res({ok:true,i,url});i.onerror=()=>res({ok:false,url});i.src=url})}
async function findOne(n){
  for (const name of NAME_PATTERNS(n))
    for (const ext of EXT){
      const u=PATH(`${name}.${ext}`); const r=await exists(u);
      if(r.ok) return r;
    }
  return null;
}

/* Precarga avanzada (ObjectURL + decode + LRU) */
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

/********* Mapeo de vista *********/
function indicesFromView(v){
  if (v.mode==='cover') return { left:null, right:1 };
  const L=v.pairLeft, R=L+1, N=TOTAL();
  return { left:(L<=N?L:null), right:(R<=N?R:null) };
}
function nextViewFrom(v){
  const N=TOTAL();
  if (v.mode==='cover') return { mode:'spread', pairLeft:2 };
  const maxLeft = (N % 2 === 0) ? N-1 : N;
  return { mode:'spread', pairLeft: Math.min(v.pairLeft+2, maxLeft) };
}
function prevViewFrom(v){
  if (v.mode==='cover') return v;
  if (v.pairLeft<=2) return { mode:'cover' };
  return { mode:'spread', pairLeft:v.pairLeft-2 };
}
function canNext(){
  const N=TOTAL();
  if (N<=0) return false;
  if (view.mode==='cover') return N>=2;
  const maxLeft = (N % 2 === 0) ? N-1 : N;
  return view.pairLeft < maxLeft;
}
function canPrev(){ return !(view.mode==='cover'); }

/********* Render helpers *********/
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

function paintStatic(leftIndex, rightIndex){
  if (leftIndex){
    pageLeft.style.display = '';
    applySrc(imgL, pages[leftIndex], spinL);
  } else {
    pageLeft.style.display = 'none';
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
  const spreads = Math.max(0, Math.ceil(Math.max(0, N-1)/2));

  if (view.mode==='cover'){ slider.value = 0; fill.style.width = '0%'; }
  else {
    const step = Math.max(1, Math.floor((view.pairLeft-2)/2)+1);
    slider.value = Math.min(spreads, step);
    const pct = spreads>0 ? (slider.value / spreads) * 100 : 0;
    fill.style.width = (isFinite(pct)?pct:0)+'%';
  }
  slider.max = spreads;

  const atCover = (view.mode==='cover');
  const atEnd   = (view.mode==='spread') && !canNext();

  btnPrev.disabled  = atCover;
  btnFirst.disabled = atCover;
  btnNext.disabled  = atEnd;
  btnLast.disabled  = atEnd;
  hintL.disabled    = atCover;
  hintR.disabled    = atEnd;

  dragLeft.style.pointerEvents = atCover ? 'none' : 'auto';
}

function render(){
  applyBookARClass();
  const {left,right} = indicesFromView(view);
  paintStatic(left, right);
  // reset sombras estáticas cuando no hay giro
  setStaticShadow('left', 0);
  setStaticShadow('right', 0);
  updateUI();
}

/********* Sombras NUEVAS *********/
/* Sombra destino (overlay auxiliar, ya la teníamos) */
function ensureDestShadow(side){
  const host = (side==='left') ? pageLeft : pageRight;
  if (!host) return null;
  let el = host.querySelector('.shadow-dest');
  if (!el){
    el = document.createElement('div');
    el.className = `shadow-dest ${side}`;
    host.appendChild(el);
  }
  return el;
}
function clearDestShadows(){
  const a = pageLeft.querySelector('.shadow-dest');
  const b = pageRight.querySelector('.shadow-dest');
  if (a) a.remove();
  if (b) b.remove();
}

/* Sombras estáticas (capas ya en el HTML) */
const staticLeft  = document.querySelector('#page-left  .shadow-static.left');
const staticRight = document.querySelector('#page-right .shadow-static.right');
function setStaticShadow(side, opacity){
  if (side==='left'  && staticLeft)  staticLeft.style.opacity  = String(opacity);
  if (side==='right' && staticRight) staticRight.style.opacity = String(opacity);
}

/********* Overlay y animación *********/
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

  // Cresta de pliegue
  const ridge = document.createElement('div'); ridge.className='foldRidge';

  // Caras según estado actual
  const cur   = indicesFromView(view);
  const nextV = nextViewFrom(view);
  const prevV = prevViewFrom(view);
  const nextI = indicesFromView(nextV);
  const prevI = indicesFromView(prevV);

  if (direction==='forward'){
    // PF1 = fR (Rcur), PF2 = bL (Lnext)
    fR.src = getPreparedURL(pages[cur.right]  || '');
    bL.src = getPreparedURL(pages[nextI.left] || '');
    fL.style.opacity=0; bR.style.opacity=0;
  } else {
    // PF1 = fL (Lcur), PF2 = bR (Rprev)
    fL.src = getPreparedURL(pages[cur.left]     || '');
    bR.src = getPreparedURL(pages[prevI.right]  || '');
    fR.style.opacity=0; bL.style.opacity=0;
  }

  turn.append(front, back, ridge);
  book.appendChild(turn);

  // Sombra destino (sobre página estática que recibe la hoja)
  const destSide = (direction==='forward') ? 'left' : 'right';
  const destShadow = ensureDestShadow(destSide);

  return {turn, ridge, fL, fR, bL, bR, destShadow, destSide};
}

/* Animación de giro + sombras (overlay + estáticas) */
function setTurnDeg(refs, direction, deg){
  const { turn, ridge, destShadow } = refs;

  // Rotación de la hoja
  turn.style.transform = `rotateY(${deg}deg)`;

  // Progreso relativo al cenit (campana)
  const x = Math.min(180, Math.abs(deg));     // 0..180
  const k = Math.sin((x/180) * Math.PI);      // 0..1..0

  /* Cresta (fold ridge) — pico cerca de CN */
  ridge.style.opacity = (0.50) * Math.pow(k, 1.2);

  /* Sombra destino (overlay auxiliar) — más fuerte en CN */
  if (destShadow){
    destShadow.style.opacity = getComputedStyle(document.documentElement)
      .getPropertyValue('--dest-shadow-max').trim() || 0.50;
    // escalamos por k
    destShadow.style.opacity = (parseFloat(destShadow.style.opacity) * Math.pow(k, 1.0)).toFixed(3);
  }

  /* Sombras estáticas animadas (Fase A / Fase B) */
  // Fase A: 90°→0°  => progA = (90 - x)/90 clamped (solo cuando x<=90)
  // Fase B: 0°→90°  => progB = (x - 90)/90 clamped (solo cuando x>=90)
  const progA = (x <= 90) ? (1 - x/90) : 0;         // 0→1 al acercarse a CN
  const progB = (x >= 90) ? ((x - 90)/90) : 0;      // 0→1 al alejarse de CN

  const staticMax = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--static-shadow-max')) || 0.55;

  if (direction === 'forward'){
    // Antes de CN: anima la izquierda (destino); después de CN: anima la derecha (la que queda atrás)
    setStaticShadow('left',  (staticMax * progA).toFixed(3));
    setStaticShadow('right', (staticMax * progB).toFixed(3));
  } else {
    // Atrás: espejo exacto
    setStaticShadow('right', (staticMax * progA).toFixed(3));
    setStaticShadow('left',  (staticMax * progB).toFixed(3));
  }
}

/********* PREVIEW estáticos hacia destino *********/
function previewStaticsFor(direction){
  const cur = indicesFromView(view);
  if (direction==='forward'){
    const nextV = nextViewFrom(view);
    const nextI = indicesFromView(nextV);
    book.classList.remove('single'); // abrir si venimos de portada
    const leftIdx  = cur.left || cur.right;   // portada: nace a partir de la 1
    const rightIdx = nextI.right;
    paintStatic(leftIdx, rightIdx);
    return nextV;
  } else {
    const prevV = prevViewFrom(view);
    const prevI = indicesFromView(prevV);
    book.classList.remove('single');
    const leftIdx  = prevI.left;
    const rightIdx = cur.right;
    paintStatic(leftIdx, rightIdx);
    return prevV;
  }
}

/********* Animación (click) *********/
function animateTurn(direction, fromDeg, toDeg, ms, gatePromise, onDone){
  if (isAnimating) return;
  isAnimating = true;

  const refs = makeTurnOverlay(direction);
  const t0 = performance.now();

  function frame(now){
    const t = Math.min(1,(now-t0)/ms);
    const d = fromDeg + (toDeg-fromDeg)*easeInOut(t);
    setTurnDeg(refs, direction, d);
    if(t<1) requestAnimationFrame(frame);
    else{
      Promise.resolve(gatePromise).then(()=>{
        refs.turn.remove(); clearDestShadows(); // limpia overlay
        // limpia sombras estáticas
        setStaticShadow('left',  0);
        setStaticShadow('right', 0);
        isAnimating = false;
        onDone && onDone();
      });
    }
  }
  requestAnimationFrame(frame);
}

/********* Navegación *********/
function goNext(){
  if (!canNext() || isAnimating) return;

  const curL = indicesFromView(view).left ?? 1;
  const gate = (view.mode==='cover')
    ? Promise.all([ prepareImage(pages[2]), prepareImage(pages[3]) ])
    : Promise.all([ prepareImage(pages[curL+2]), prepareImage(pages[curL+3]) ]);

  const nextV = previewStaticsFor('forward');
  animateTurn('forward', 0, -180, FLIP_MS, gate, ()=>{ view = nextV; render(); });
}
function goPrev(){
  if (!canPrev() || isAnimating) return;

  const curL = indicesFromView(view).left ?? 2;
  const gate = (view.mode==='spread' && view.pairLeft<=2)
    ? Promise.all([ prepareImage(pages[1]) ])
    : Promise.all([ prepareImage(pages[curL-2]), prepareImage(pages[curL-1]) ]);

  const prevV = previewStaticsFor('backward');
  animateTurn('backward', 0, 180, FLIP_MS, gate, ()=>{ view = prevV; render(); });
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
  if (N % 2 === 1){ view={mode:'spread', pairLeft:N}; }
  else            { view={mode:'spread', pairLeft:N-1}; }
  render();
}

/********* Controles *********/
btnNext.addEventListener('click', goNext);
btnPrev.addEventListener('click', goPrev);
btnFirst.addEventListener('click', goFirst);
btnLast.addEventListener('click', goLast);

document.addEventListener('keydown', e=>{
  if(e.key==='ArrowRight') goNext();
  if(e.key==='ArrowLeft')  goPrev();
});

/* Click simple dentro del libro: mitad izq/der */
book.addEventListener('click', (e)=>{
  if (isAnimating || suppressClick) return;
  const rect = book.getBoundingClientRect();
  const centerX = rect.left + rect.width/2;
  if (e.clientX < centerX) goPrev(); else goNext();
});

/* Rueda del mouse */
book.addEventListener('wheel', (e)=>{
  e.preventDefault();
  if (isAnimating) return;
  const now = performance.now();
  if (now < wheelLockUntil) return;
  if (e.deltaY > 0){ if (canNext()) goNext(); }
  else if (e.deltaY < 0){ if (canPrev()) goPrev(); }
  wheelLockUntil = now + WHEEL_THROTTLE_MS;
}, { passive:false });

/********* Drag por borde *********/
let drag = null; // {dir, refs, rect, startX, t, deg, pointerId, preview}

function startDrag(side, e){
  if (isAnimating) return;
  if (side==='left' && !canPrev()) return;
  if (side==='right' && !canNext()) return;

  suppressClick = true;

  const pointerId = e.pointerId;
  const dir = (side==='right') ? 'forward' : 'backward';

  // preview estáticos hacia destino
  const targetV = previewStaticsFor(dir);

  const rect = book.getBoundingClientRect();
  const startX = e.clientX;
  e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(pointerId);

  // crea overlay
  const refs = makeTurnOverlay(dir);
  setTurnDeg(refs, dir, dir==='forward' ? -8 : 8);

  drag = { dir, refs, rect, startX, t:0, deg:0, pointerId, preview:targetV };
}
function moveDrag(e){
  if (!drag) return;
  const x = e.clientX;
  const {rect, dir} = drag;
  const center = rect.left + rect.width/2;

  let t;
  if (dir==='forward'){ t = Math.min(1, Math.max(0, (rect.right - x) / (rect.right - center))); }
  else               { t = Math.min(1, Math.max(0, (x - rect.left) / (center - rect.left))); }
  drag.t = t;

  const deg = (dir==='forward') ? -180*t : 180*t;
  drag.deg = deg;
  setTurnDeg(drag.refs, dir, deg);
}
function endDrag(e){
  if (!drag) return;
  const {dir, t, refs, deg, pointerId, preview} = drag;
  drag = null;

  try{ e.currentTarget.releasePointerCapture && e.currentTarget.releasePointerCapture(pointerId); }catch{}

  if (t>DRAG_COMPLETE_T){
    const curL = indicesFromView(view).left ?? (dir==='forward'?1:2);
    const gate = (dir==='forward')
      ? Promise.all([ prepareImage(pages[curL+2]), prepareImage(pages[curL+3]) ])
      : (view.mode==='spread' && view.pairLeft<=2
          ? Promise.all([ prepareImage(pages[1]) ])
          : Promise.all([ prepareImage(pages[curL-2]), prepareImage(pages[curL-1]) ]));

    const ms = FLIP_MS_DRAG_DONE, from = deg, to = (dir==='forward') ? -180 : 180;
    isAnimating = true;
    const t0 = performance.now();
    function frame(now){
      const k = Math.min(1,(now-t0)/ms);
      const d = from + (to-from)*easeInOut(k);
      setTurnDeg(refs, dir, d);
      if (k<1) requestAnimationFrame(frame);
      else {
        Promise.resolve(gate).then(()=>{
          refs.turn.remove(); clearDestShadows();
          setStaticShadow('left',  0);
          setStaticShadow('right', 0);
          isAnimating=false; view = preview; render();
        });
      }
    }
    requestAnimationFrame(frame);
  } else {
    const ms = FLIP_MS_RETURN, from = deg, to = 0;
    isAnimating = true;
    const t0 = performance.now();
    function frame(now){
      const k = Math.min(1,(now-t0)/ms);
      const d = from + (to-from)*easeInOut(k);
      setTurnDeg(refs, dir, d);
      if (k<1) requestAnimationFrame(frame);
      else {
        refs.turn.remove(); clearDestShadows();
        setStaticShadow('left',  0);
        setStaticShadow('right', 0);
        isAnimating=false; render();
      }
    }
    requestAnimationFrame(frame);
  }

  setTimeout(()=>{ suppressClick=false; }, 80);
}

for (const el of [dragLeft, dragRight]){
  el.addEventListener('pointerdown', e=>{
    const side = (e.currentTarget===dragRight) ? 'right' : 'left';
    startDrag(side, e);
  });
  el.addEventListener('pointermove', moveDrag);
  el.addEventListener('pointerup',   endDrag);
  el.addEventListener('pointercancel', endDrag);
}

/********* Fullscreen *********/
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

/********* Slider *********/
slider.addEventListener('input', ()=>{
  const N = TOTAL();
  const spreads = Math.max(0, Math.ceil(Math.max(0, N-1)/2));
  let target = Math.min(spreads, Math.max(0, parseInt(slider.value,10)));

  if (target===0){
    if (START_MODE==='cover') view={mode:'cover'};
    else view={mode:'spread', pairLeft:(INITIAL_SPREAD==='1-2')?1:2};
  } else {
    view={mode:'spread', pairLeft: 2 + (target-1)*2};
    const maxLeft = (N % 2 === 0) ? N-1 : N;
    if (view.pairLeft>maxLeft) view.pairLeft=maxLeft;
  }
  render();
});

/********* Init *********/
(async function init(){
  const map=[]; let firstImg=null, found=false, misses=0;
  for(let n=1;n<=MAX_PAGES;n++){
    const r = await findOne(n);
    if(r){ map[n]=r.url; misses=0; if(!firstImg){ firstImg=r.i; } found=true; }
    else if(found){ map[n]=null; if(++misses>=6) break; }
  }
  let last=0; for(let i=map.length-1;i>=1;i--) if(map[i]){ last=i; break; }
  pages = Array.from({length:last+1},(_,i)=>map[i]||null);

  if (firstImg){ setPageARFrom(firstImg); }

  if (START_MODE==='cover'){ view={mode:'cover'}; }
  else { view={mode:'spread', pairLeft: (INITIAL_SPREAD==='1-2') ? 1 : 2}; }

  const seedIdx = [1,2,3,4,5].filter(i => i<=TOTAL());
  await Promise.all(seedIdx.map(i=>prepareImage(pages[i])));

  hintL.addEventListener('click', ()=>{ if (canPrev()) goPrev(); });
  hintR.addEventListener('click', ()=>{ if (canNext()) goNext(); });

  render();
})();
