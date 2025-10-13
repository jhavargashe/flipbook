/***********************
 * Config
 ***********************/
const AUTO_DETECT = true;
const MAX_PAGES   = 300;
const TOTAL_PAGES = 10;

const NAME_PATTERNS = n => ([`page-${n}`, `page-${String(n).padStart(2,'0')}`, `page-${String(n).padStart(3,'0')}`]);
const EXT  = ['jpg','jpeg','png','webp'];
const PATH = base => `assets/pdf-images/${base}`;

/***********************
 * Estado / refs
 ***********************/
let pages = [];                 // urls por página
let idx   = 0;                  // 0 -> (1,2), 2 -> (3,4)...
let isAnimating = false;
let drag = null;                // { dir, overlay, shade, rect, startX, t, deg }
let wheelLockUntil = 0;

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

/* 🔮 decode() fiable */
function decodeImage(url){
  if (!url) return Promise.resolve();
  const img = new Image();
  img.src = url;
  if (img.decode) {
    return img.decode().catch(()=>{}); // en errores, resolvemos igual
  }
  return new Promise(res => { img.onload = res; img.onerror = res; });
}
function ensureNextPairReady(dir){
  if (dir==='forward'){
    return Promise.all([ decodeImage(pages[idx+2]), decodeImage(pages[idx+3]) ]);
  } else {
    return Promise.all([ decodeImage(pages[idx-2]), decodeImage(pages[idx-1]) ]);
  }
}

/***********************
 * Base render (páginas estáticas + loader)
 ***********************/
function applySrc(img, url, spinner){
  if (!url){
    img.removeAttribute('src'); img.style.opacity=0; spinner.classList.add('hidden'); return;
  }
  spinner.classList.remove('hidden'); img.style.opacity=0;
  img.onload  = ()=>{ spinner.classList.add('hidden'); img.style.opacity = 1; };
  img.onerror = ()=>{ spinner.classList.add('hidden'); img.style.opacity = 0; };
  img.src = url;
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
  turn.classList.add(dir); // ⭐ 'forward' o 'backward' para limitar la sombra

  const front = document.createElement('div'); front.className='face front';
  const back  = document.createElement('div'); back.className='face back';

  const fL = document.createElement('img'); fL.className='half left';
  const fR = document.createElement('img'); fR.className='half right';
  const bL = document.createElement('img'); bL.className='half left';
  const bR = document.createElement('img'); bR.className='half right';

  front.append(fL,fR); back.append(bL,bR);

  const shade = document.createElement('div'); shade.className='turnShade';

  if (dir==='forward'){      // R → L
    fR.src = pages[idx+1] || '';  fL.style.opacity = 0;   // cara = derecha actual
    bL.src = pages[idx+2] || '';  bR.style.opacity = 0;   // dorso = próxima izquierda
  } else {                   // L → R
    fL.src = pages[idx]   || '';  fR.style.opacity = 0;   // cara = izquierda actual
    bR.src = pages[idx-1] || '';  bL.style.opacity = 0;   // dorso = derecha anterior
  }

  turn.append(front, back, shade);
  book.appendChild(turn);
  return {turn, shade};
}

function setTurnDeg(turnEl, shadeEl, deg){
  turnEl.style.transform = `rotateY(${deg}deg)`;
  const k = Math.sin(Math.min(Math.PI, (Math.abs(deg)/180)*Math.PI)); // 0..1..0
  shadeEl.style.opacity = 0.50 * k;    // sombra del pliegue solo en la hoja activa
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
      // Espera a que las próximas hojas estén decodificadas antes de revelar
      Promise.resolve(gatePromise).then(()=>{
        turn.remove(); isAnimating = false; onDone && onDone();
      });
    }
  }
  requestAnimationFrame(frame);
}

/***********************
 * Navegación (botones/teclado)
 ***********************/
function next(){
  if (isAnimating || idx+2>=pages.length) return;
  const gate = ensureNextPairReady('forward');
  animateTurn('forward', 0, -180, 640, gate, ()=>{ idx+=2; render(); });
}
function prev(){
  if (isAnimating || idx<=0) return;
  const gate = ensureNextPairReady('backward');
  animateTurn('backward', 0, 180, 640, gate, ()=>{ idx-=2; render(); });
}
function first(){ if(!isAnimating && idx>0){ idx=0; render(); } }
function last(){ if(isAnimating) return; const lastPair = clampPair(pages.length-2, pages.length); idx=lastPair; render(); }

/***********************
 * Drag de esquina (interactivo)
 ***********************/
function startDrag(side, e){
  if (isAnimating) return;
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

  if (t>0.45){
    const gate = ensureNextPairReady(dir);
    // completa el giro desde el ángulo actual
    const ms = 380, from = deg, to = (dir==='forward') ? -180 : 180;
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
    // volver a 0°
    const ms = 260, from = deg, to = 0;
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
}

/***********************
 * Click dentro del libro (mitad izq/der)
 ***********************/
book.addEventListener('click', (e)=>{
  if (isAnimating) return;
  // evita que click sobre botones invisibles de esquina dispare navegación
  if (e.target && e.target.closest('.corner')) return;

  const rect = book.getBoundingClientRect();
  const centerX = rect.left + rect.width/2;
  if (e.clientX < centerX) prev(); else next();
});

/***********************
 * Rueda del mouse (sobre el libro)
 ***********************/
book.addEventListener('wheel', (e)=>{
  e.preventDefault();               // para que el scroll no mueva la página del sitio
  if (isAnimating) return;
  const now = performance.now();
  if (now < wheelLockUntil) return; // throttle
  wheelLockUntil = now + 350;
  if (e.deltaY > 0) next();
  else if (e.deltaY < 0) prev();
}, { passive:false });

/***********************
 * Teclado
 ***********************/
document.addEventListener('keydown', e=>{
  if(e.key==='ArrowRight') next();
  if(e.key==='ArrowLeft')  prev();
});

/***********************
 * Esquinas (drag)
 ***********************/
cornerR.addEventListener('pointerdown', e=>{ startDrag('right', e); });
cornerL.addEventListener('pointerdown', e=>{ startDrag('left',  e); });
window.addEventListener('pointermove', moveDrag, {passive:true});
window.addEventListener('pointerup',   endDrag);
window.addEventListener('pointercancel', endDrag);

/***********************
 * Slider
 ***********************/
slider.addEventListener('input', ()=>{ idx=parseInt(slider.value,10)*2; render(); });

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
 * Init (detección de assets)
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
    let last=0; for(let i=map.length-1;i>=1;i--) if(map[i]!==undefined){last=i;break;}
    pages=[]; for(let i=1;i<=last;i++) pages.push(map[i]??null);
  } else {
    pages = Array.from({length:TOTAL_PAGES},(_,i)=>`assets/pdf-images/page-${i+1}.jpg`);
  }

  if(pages.length) preload(pages.slice(0,6));
  render();
})();
