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
let pages = [];                 // urls por página real: 1..N
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

/* Estado de vista: portada o pliego */
let view = { mode: 'cover', pairLeft: 2 }; // pairLeft: izquierda del pliego cuando mode='spread'
let pageAR = 2/3; // ancho/alto de UNA página (se calcula)

/***********************
 * Util
 ***********************/
const easeInOut = t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

function setPageARFrom(img){
  const w = img.naturalWidth||1000, h = img.naturalHeight||1500;
  pageAR = w/h;
  document.documentElement.style.setProperty('--page-ar', pageAR);
  applyBookAR();
}
function applyBookAR(){
  if (view.mode === 'cover'){
    book.classList.add('single');
  } else {
    book.classList.remove('single');
  }
}

/* Buscar si existe una imagen page-X con varias variantes */
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

function ensureNextPairReadyForward(){
  // Desde portada: necesitamos 2 y 3; desde pliego: pairLeft+2 y +3
  if (view.mode==='cover'){
    return Promise.all([ prepareImage(pages[2]), prepareImage(pages[3]) ]);
  } else {
    const L = view.pairLeft + 2, R = view.pairLeft + 3;
    return Promise.all([ prepareImage(pages[L]), prepareImage(pages[R]) ]);
  }
}
function ensureNextPairReadyBackward(){
  // Hacia portada: necesitamos 1; desde pliego: pairLeft-2 y -1
  if (view.mode==='cover'){
    return Promise.resolve();
  } else if (view.pairLeft<=2){
    return Promise.all([ prepareImage(pages[1]) ]);
  } else {
    const L = view.pairLeft - 2, R = view.pairLeft - 1;
    return Promise.all([ prepareImage(pages[L]), prepareImage(pages[R]) ]);
  }
}

/***********************
 * Mapeo de vista -> índices
 ***********************/
function getCurrentIndices(){
  if (view.mode === 'cover'){
    return { left: null, right: 1 };
  }
  const L = view.pairLeft;
  const R = L + 1;
  return { left: (L<=pages.length?L:null), right: (R<=pages.length?R:null) };
}

/***********************
 * Render estático
 ***********************/
function applySrc(img, url, spinner){
  if (!url){
    img.removeAttribute('src'); img.style.opacity=0; spinner.classList.add('hidden'); return;
  }
  spinner.classList.remove('hidden'); img.style.opacity=0;
  const finalURL = getPreparedURL(url);
  img.onload  = ()=>{ spinner.classList.add('hidden'); img.style.opacity = 1; };
  img.onerror = ()=>{ spinner.classList.add('hidden'); img.style.opacity = 0; };
  img.decoding = 'async';
  img.loading  = 'eager';
  img.src = finalURL;
  if (img.complete && img.naturalWidth>0){ spinner.classList.add('hidden'); img.style.opacity=1; }
}

function updateUI(){
  // Slider: en portada lo ponemos en 0; spreads cuentan desde (2,3) => paso 1
  const spreads = Math.max(0, Math.ceil(Math.max(0, pages.length-1)/2)); // sin portada
  slider.max = spreads;
  if (view.mode==='cover'){ slider.value = 0; fill.style.width = '0%'; }
  else {
    const step = Math.max(1, Math.floor((view.pairLeft-2)/2)+1);
    slider.value = step;
    const pct = spreads>0 ? (step / spreads) * 100 : 0;
    fill.style.width = (isFinite(pct)?pct:0)+'%';
  }

  // Botones/hints
  const atCover = (view.mode==='cover');
  const atEnd   = (view.mode==='spread') && (view.pairLeft >= (pages.length%2===0 ? pages.length-1 : pages.length));

  btnPrev.disabled  = atCover;
  btnFirst.disabled = atCover;
  btnNext.disabled  = atEnd;
  btnLast.disabled  = atEnd;

  hintL.disabled = atCover;
  hintR.disabled = atEnd;

  // Drag zones: en portada desactivo izquierda
  dragLeft.style.pointerEvents = atCover ? 'none' : 'auto';
}

function render(){
  applyBookAR();

  const {left, right} = getCurrentIndices();

  // izquierda
  if (left){
    document.getElementById('page-left').style.display = '';
    applySrc(imgL, pages[left], spinL);
  } else {
    document.getElementById('page-left').style.display = 'none';
    spinL.classList.add('hidden'); imgL.removeAttribute('src');
  }

  // derecha (puede quedar vacía si impar al final)
  if (right){
    applySrc(imgR, pages[right], spinR);
  } else {
    applySrc(imgR, null, spinR);
  }

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

  // Relleno según estado
  if (direction==='forward'){
    if (view.mode==='cover'){
      // Cara: derecha (1). Dorso: nueva izquierda (2).
      fR.src = getPreparedURL(pages[1] || '');
      bL.src = getPreparedURL(pages[2] || '');
      // ocultamos las otras medias
      fL.style.opacity=0; bR.style.opacity=0;
    } else {
      // Cara: derecha actual (pairLeft+1). Dorso: nueva izquierda (pairLeft+2).
      const curR = view.pairLeft + 1;
      const nextL= view.pairLeft + 2;
      fR.src = getPreparedURL(pages[curR] || '');
      bL.src = getPreparedURL(pages[nextL] || '');
      fL.style.opacity=0; bR.style.opacity=0;
    }
  } else { // backward
    if (view.mode==='cover'){
      // no deberíamos entrar aquí, pero por seguridad:
      fL.style.opacity=0; fR.style.opacity=0; bL.style.opacity=0; bR.style.opacity=0;
    } else if (view.pairLeft<=2){
      // Volviendo a portada: Cara = izquierda actual (2), Dorso = portada (1 en derecha)
      fL.src = getPreparedURL(pages[2] || '');
      bR.src = getPreparedURL(pages[1] || '');
      fR.style.opacity=0; bL.style.opacity=0;
    } else {
      // Cara: izquierda actual (pairLeft). Dorso: nueva derecha (pairLeft-1)
      const curL = view.pairLeft;
      const prevR= view.pairLeft - 1;
      fL.src = getPreparedURL(pages[curL] || '');
      bR.src = getPreparedURL(pages[prevR] || '');
      fR.style.opacity=0; bL.style.opacity=0;
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
 * Navegación “lógica”
 ***********************/
function canNext(){
  if (view.mode==='cover') return pages.length >= 2; // al menos hay 2 y 3? abrimos igual, si no, intentamos lo que haya
  const maxLeft = (pages.length % 2 === 0) ? pages.length - 1 : pages.length;
  return view.pairLeft < maxLeft;
}
function canPrev(){
  // siempre se puede volver a portada
  return !(view.mode==='cover');
}

function goNext(){
  if (!canNext() || isAnimating) return;

  const gate = ensureNextPairReadyForward();

  animateTurn('forward', 0, -180, FLIP_MS, gate, ()=>{
    if (view.mode==='cover'){
      view.mode='spread'; view.pairLeft = 2;
    } else {
      view.pairLeft += 2;
    }
    render();
  });
}

function goPrev(){
  if (!canPrev() || isAnimating) return;

  const gate = ensureNextPairReadyBackward();

  animateTurn('backward', 0, 180, FLIP_MS, gate, ()=>{
    if (view.mode==='spread' && view.pairLeft<=2){
      view.mode='cover';
    } else if (view.mode==='spread'){
      view.pairLeft -= 2;
    }
    render();
  });
}

function goFirst(){
  if (isAnimating) return;
  view.mode = (START_MODE==='cover') ? 'cover' : 'spread';
  if (view.mode==='spread'){
    view.pairLeft = (INITIAL_SPREAD==='1-2') ? 1 : 2;
  }
  render();
}
function goLast(){
  if (isAnimating) return;
  if (pages.length===0) return;

  // si impar -> último pliego tiene izquierda = n y derecha vacía
  if (pages.length % 2 === 1){
    view.mode='spread';
    view.pairLeft = pages.length; // mostrará (n, null)
  } else {
    view.mode='spread';
    view.pairLeft = pages.length - 1; // (n-1, n)
  }
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

/* Rueda del mouse */
book.addEventListener('wheel', (e)=>{
  e.preventDefault();
  if (isAnimating) return;
  const now = performance.now();
  if (now < wheelLockUntil) return;
  wheelLockUntil = now + WHEEL_THROTTLE_MS;
  if (e.deltaY > 0) goNext();
  else if (e.deltaY < 0) goPrev();
}, { passive:false });

/***********************
 * Drag por BORDE vertical
 ***********************/
let drag = null; // {dir, overlay, shade, rect, startX, t, deg, pointerId}

function startDrag(side, e){
  if (isAnimating) return;
  // Portada: no hay drag izq
  if (side==='left' && view.mode==='cover') return;

  suppressClick = true;
  book.classList.add('dragging');

  const pointerId = e.pointerId;
  const dir = (side==='right') ? 'forward' : 'backward';

  const {turn, shade} = makeTurnOverlay(dir);

  const rect = book.getBoundingClientRect();
  let startX = e.clientX;

  // Captura puntero para no perder el drag
  e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(pointerId);

  // Iniciar con ligera inclinación
  setTurnDeg(turn, shade, dir==='forward' ? -8 : 8);

  drag = { dir, overlay:turn, shade, rect, startX, t:0, deg:0, pointerId };
}

function moveDrag(e){
  if (!drag) return;
  const x = e.clientX;
  const {rect, dir} = drag;
  const center = rect.left + rect.width/2;

  // Progreso solo en X desde el borde hacia el centro
  let t;
  if (dir==='forward'){ // borde derecho hacia centro
    const from = rect.right; const to = center;
    t = Math.min(1, Math.max(0, (from - x) / (from - to)));
  } else {              // borde izquierdo hacia centro
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
  const {dir, t, overlay, shade, deg, pointerId} = drag;
  drag = null;

  // Liberar captura y overflow
  try{ e.currentTarget.releasePointerCapture && e.currentTarget.releasePointerCapture(pointerId); }catch{}
  // completamos o regresamos
  if (t>DRAG_COMPLETE_T){
    const gate = (dir==='forward') ? ensureNextPairReadyForward() : ensureNextPairReadyBackward();
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
          if (dir==='forward'){
            if (view.mode==='cover'){ view.mode='spread'; view.pairLeft=2; }
            else { view.pairLeft += 2; }
          } else {
            if (view.mode==='spread' && view.pairLeft<=2){ view.mode='cover'; }
            else if (view.mode==='spread'){ view.pairLeft -= 2; }
          }
          book.classList.remove('dragging');
          render();
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
      setTurnDeg(overlay, shade, d);
      if (k<1) requestAnimationFrame(frame);
      else { overlay.remove(); isAnimating=false; book.classList.remove('dragging'); }
    }
    requestAnimationFrame(frame);
  }

  setTimeout(()=>{ suppressClick=false; }, 80);
}

/* Listeners de drag (borde vertical) */
for (const el of [dragLeft, dragRight]){
  el.addEventListener('pointerdown', e=>{
    // define lado según elemento
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
 * Slider → navega spreads
 ***********************/
slider.addEventListener('input', ()=>{
  const target = parseInt(slider.value,10);
  if (target === 0){
    // portada si estamos en modo cover, o saltar a primer spread
    if (START_MODE==='cover'){
      view.mode='cover';
    } else {
      view.mode='spread';
      view.pairLeft = (INITIAL_SPREAD==='1-2') ? 1 : 2;
    }
  } else {
    view.mode='spread';
    view.pairLeft = 2 + (target-1)*2;
  }
  render();
});

/***********************
 * Init (detección de assets)
 ***********************/
(async function init(){
  // Descubrir páginas reales
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
  pages = Array.from({length:last+1},(_,i)=>map[i]||null); // indexamos por número real (1..last)

  if (firstImg){ setPageARFrom(firstImg); }

  // Estado inicial según flags
  if (START_MODE==='cover'){
    view.mode='cover'; // portada
  } else {
    view.mode='spread';
    view.pairLeft = (INITIAL_SPREAD==='1-2') ? 1 : 2;
  }

  // Preparar primeras imágenes
  const seed = [];
  const {left,right} = getCurrentIndices();
  if (left)  seed.push(pages[left]);
  if (right) seed.push(pages[right]);
  const ahead = [2,3,4,5].map(n=>pages[n]).filter(Boolean);
  seed.push(...ahead);
  await Promise.all(seed.map(u=>prepareImage(u)));

  // Conectar hints
  hintL.addEventListener('click', goPrev);
  hintR.addEventListener('click', goNext);

  // Conectar next/prev a teclas ya está arriba
  render();
})();
