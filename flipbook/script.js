/***********************
 * Config
 ***********************/
const AUTO_DETECT = true;
const MAX_PAGES   = 300;
const TOTAL_PAGES = 10;

/* Tuning rápido */
const FLIP_MS            = 640;  // click
const FLIP_MS_DRAG_DONE  = 380;  // completar tras drag
const FLIP_MS_RETURN     = 260;  // rebotar atrás si no alcanza
const DRAG_COMPLETE_T    = 0.45; // umbral completar
const LEFT_QUARTER_EDGE  = 0.25; // click sostenido izq
const RIGHT_QUARTER_EDGE = 0.75; // click sostenido der
const WHEEL_THROTTLE_MS  = 320;

const NAME_PATTERNS = n => ([`page-${n}`, `page-${String(n).padStart(2,'0')}`, `page-${String(n).padStart(3,'0')}`]);
const EXT  = ['jpg','jpeg','png','webp'];
const PATH = base => `assets/pdf-images/${base}`;

/***********************
 * Estado / refs
 ***********************/
let pages = [];                 // urls por página real
let idx   = 0;                  // 0 -> (1,2), 2 -> (3,4)...
let isAnimating = false;

let drag = null;                // { dir, overlay, shade, rect, startX, t, deg }
let wheelLockUntil = 0;
let suppressClick = false;

const viewer = document.getElementById('viewer');
const book   = document.getElementById('book');

const imgL   = document.getElementById('img-left');
const imgR   = document.getElementById('img-right');
const spinL  = document.getElementById('spin-left');
const spinR  = document.getElementById('spin-right');

const cornerL= document.getElementById('corner-L');
const cornerR= document.getElementById('corner-R');

const slider = document.getElementById('slider');
const fill   = document.getElementById('fill');

const btnPrev  = document.getElementById('btn-prev');
const btnNext  = document.getElementById('btn-next');
const btnFirst = document.getElementById('btn-first');
const btnLast  = document.getElementById('btn-last');
const btnFS    = document.getElementById('btn-fs');

const hintL = document.getElementById('edge-left');
const hintR = document.getElementById('edge-right');

/***********************
 * Util
 ***********************/
const clampPair = (i,L)=>Math.max(0,Math.min(i-(i%2),Math.max(0,L-2)));
const easeInOut = t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;

function setARfrom(img){
  const w=img.naturalWidth||1000, h=img.naturalHeight||1500;
  const ar=(2*w)/h;
  book.style.setProperty('--book-ar', ar);
  const resize=()=>book.style.height=(book.clientWidth/ar)+'px';
  resize(); addEventListener('resize', resize);
}

function preload(arr){arr.forEach(s=>{const i=new Image(); i.src=s;});}
function exists(url){return new Promise(res=>{const i=new Image();i.onload=()=>res({ok:true,i,url});i.onerror=()=>res({ok:false,url});i.src=url+`?v=${Date.now()}`})}
async function findOne(n){
  for (const name of NAME_PATTERNS(n))
    for (const ext of EXT){
      const u=PATH(`${name}.${ext}`);
      const r=await exists(u);
      if(r.ok) return r.url;
    }
  return null;
}

/* ⚡ Preparación avanzada: fetch + createImageBitmap + ObjectURL + decode + LRU */
const preparedURL = new Map();
const preparedLRU = [];
const PREP_LIMIT = 30;

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

function ensureNextPairReady(dir){
  const urls = (dir==='forward')
    ? [pages[idx+2], pages[idx+3]]
    : [pages[idx-2], pages[idx-1]];
  return Promise.all(urls.filter(Boolean).map(u=>prepareImage(u)));
}

/***********************
 * Base render (páginas estáticas + loader)
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
  const spreads = Math.ceil(pages.length/2);
  slider.max   = Math.max(0, spreads-1);
  slider.value = Math.floor(idx/2);
  const pct = spreads>1 ? (slider.value/(spreads-1))*100 : 0;
  fill.style.width = (isFinite(pct)?pct:0)+'%';

  const atStart = idx<=0;
  const atEnd   = idx+2>=pages.length;
  btnPrev.disabled  = atStart;
  btnFirst.disabled = atStart;
  btnNext.disabled  = atEnd;
  btnLast.disabled  = atEnd;

  hintL.disabled = atStart;
  hintR.disabled = atEnd;
}

function render(){
  if(!pages.length){
    imgL.removeAttribute('src'); imgR.removeAttribute('src');
    spinL.classList.add('hidden'); spinR.classList.add('hidden');
    updateUI(); return;
  }
  idx = clampPair(idx, pages.length);
  applySrc(imgL, pages[idx]   || '', spinL);
  applySrc(imgR, pages[idx+1] || '', spinR);
  updateUI();
}

/***********************
 * Hoja overlay (flip único)
 ***********************/
function makeTurnOverlay(dir) {
  const turn = document.createElement('div');
  turn.className = 'turn';
  turn.classList.add(dir); // 'forward'|'backward' → ubica sombra

  const front = document.createElement('div'); front.className='face front';
  const back  = document.createElement('div'); back.className='face back';

  const fL = document.createElement('img'); fL.className='half left';
  const fR = document.createElement('img'); fR.className='half right';
  const bL = document.createElement('img'); bL.className='half left';
  const bR = document.createElement('img'); bR.className='half right';

  front.append(fL,fR); back.append(bL,bR);

  const shade = document.createElement('div'); shade.className='turnShade';

  if (dir==='forward'){ // R → L
    fR.src = getPreparedURL(pages[idx+1] || '');  fL.style.opacity = 0;
    bL.src = getPreparedURL(pages[idx+2] || '');  bR.style.opacity = 0;
  } else {              // L → R
    fL.src = getPreparedURL(pages[idx]   || '');  fR.style.opacity = 0;
    bR.src = getPreparedURL(pages[idx-1] || '');  bL.style.opacity = 0;
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

function animateTurn(dir, fromDeg, toDeg, ms, gatePromise, onDone){
  if (isAnimating) return;
  isAnimating = true;

  const {turn, shade} = makeTurnOverlay(dir);
  let from = fromDeg, to = toDeg;
  const t0 = performance.now();

  function frame(now){
    const t = Math.min(1,(now-t0)/ms);
    const d = from + (to-from)*easeInOut(t);
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
 * Navegación (botones / teclado)
 ***********************/
function next(){
  if (isAnimating || idx+2>=pages.length) return;
  const gate = ensureNextPairReady('forward');
  animateTurn('forward', 0, -180, FLIP_MS, gate, ()=>{ idx+=2; render(); });
}
function prev(){
  if (isAnimating || idx<=0) return;
  const gate = ensureNextPairReady('backward');
  animateTurn('backward', 0, 180, FLIP_MS, gate, ()=>{ idx-=2; render(); });
}
function first(){ if(!isAnimating && idx>0){ idx=0; render(); } }
function last(){ if(isAnimating) return; const lastPair = clampPair(pages.length-2, pages.length); idx=lastPair; render(); }

/* 🔗 Conectar botones (esto faltaba en tu versión) */
btnNext.addEventListener('click', next);
btnPrev.addEventListener('click', prev);
btnFirst.addEventListener('click', first);
btnLast.addEventListener('click', last);

/***********************
 * Drag de esquina + “click sostenido por cuartos”
 ***********************/
function startDrag(side, e){
  if (isAnimating) return;
  suppressClick = true;
  const dir = (side==='right') ? 'forward' : 'backward';
  const {turn, shade} = makeTurnOverlay(dir);

  const rect = book.getBoundingClientRect();
  const startX = (e.touches?e.touches[0].clientX:e.clientX) ?? rect.right;
  drag = { dir, overlay:turn, shade, rect, startX, t:0, deg:0 };

  setTurnDeg(turn, shade, dir==='forward' ? -8 : 8);
}
function moveDrag(e){
  if (!drag) return;
  const x = (e.touches?e.touches[0].clientX:e.clientX) ?? drag.startX;
  const {rect, dir} = drag;
  const half = rect.width/2;
  const center = rect.left + half;

  let t;
  if (dir==='forward'){ t = Math.min(1, Math.max(0, (center - x)/half)); }
  else                { t = Math.min(1, Math.max(0, (x - center)/half)); }
  drag.t = t;

  const deg = (dir==='forward') ? -180*t : 180*t;
  drag.deg = deg;
  setTurnDeg(drag.overlay, drag.shade, deg);
}
function endDrag(){
  if (!drag) return;
  const {dir, t, overlay, shade, deg} = drag;
  drag = null;

  if (t>DRAG_COMPLETE_T){
    const gate = ensureNextPairReady(dir);
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
          if (dir==='forward'){ idx+=2; } else { idx-=2; }
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
      else { overlay.remove(); isAnimating=false; }
    }
    requestAnimationFrame(frame);
  }
  setTimeout(()=>{ suppressClick=false; }, 80);
}

/* Esquinas (opcional) */
cornerR.addEventListener('pointerdown', e=>{ startDrag('right', e); });
cornerL.addEventListener('pointerdown', e=>{ startDrag('left',  e); });

/* “Click sostenido” por cuartos dentro del libro */
book.addEventListener('pointerdown', (e)=>{
  if (isAnimating) return;
  if (e.target.closest('.corner')) return;

  const r = book.getBoundingClientRect();
  const x = (e.touches?e.touches[0].clientX:e.clientX);
  const rel = (x - r.left) / r.width; // 0..1

  if (rel <= LEFT_QUARTER_EDGE){ startDrag('left', e); }
  else if (rel >= RIGHT_QUARTER_EDGE){ startDrag('right', e); }
});

/* mover/soltar */
window.addEventListener('pointermove', moveDrag, {passive:true});
window.addEventListener('pointerup',   endDrag);
window.addEventListener('pointercancel', endDrag);

/***********************
 * Click simple (mitades)
 ***********************/
book.addEventListener('click', (e)=>{
  if (isAnimating || suppressClick) return;
  if (e.target && e.target.closest('.corner')) return;
  const rect = book.getBoundingClientRect();
  const centerX = rect.left + rect.width/2;
  if (e.clientX < centerX) prev(); else next();
});

/***********************
 * Rueda del mouse
 ***********************/
book.addEventListener('wheel', (e)=>{
  e.preventDefault();
  if (isAnimating) return;
  const now = performance.now();
  if (now < wheelLockUntil) return;
  wheelLockUntil = now + WHEEL_THROTTLE_MS;
  if (e.deltaY > 0) next();
  else if (e.deltaY < 0) prev();
}, { passive:false });

/***********************
 * Flechas de guía
 ***********************/
hintL.addEventListener('click', prev);
hintR.addEventListener('click', next);

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
 * Slider
 ***********************/
slider.addEventListener('input', ()=>{ idx=parseInt(slider.value,10)*2; render(); });

/***********************
 * Init (detección de assets corregida)
 ***********************/
(async function init(){
  if (AUTO_DETECT){
    const map=[]; let found=false, misses=0;
    for(let n=1;n<=MAX_PAGES;n++){
      const url = await findOne(n);
      if(url){
        map[n]=url; misses=0;
        if(!found){ const r=await exists(url); r.ok && setARfrom(r.i); found=true; }
      } else if(found){
        map[n]=null; misses++;
        if(misses>=6) break;
      }
    }
    /* ⭐ Solo consideramos las que existen (truthy) */
    let last=0; for(let i=map.length-1;i>=1;i--) if(map[i]){ last=i; break; }
    pages=[]; for(let i=1;i<=last;i++) pages.push(map[i]||null);
  } else {
    pages = Array.from({length:TOTAL_PAGES},(_,i)=>`assets/pdf-images/page-${i+1}.jpg`);
  }

  /* Prepara primeras imágenes para mejor sensación */
  if(pages.length){
    const seed = pages.slice(0, Math.min(6, pages.length)).filter(Boolean);
    await Promise.all(seed.map(u=>prepareImage(u)));
    preload(seed);
  }
  render();
})();
