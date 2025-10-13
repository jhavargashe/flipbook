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
let pages = [];            // urls o null por hoja
let idx   = 0;             // par visible (0->1-2, 2->3-4, ...)
let isAnimating = false;
let drag = null;           // {side:'right'|'left', startX, t}

const viewer = document.getElementById('viewer');
const book   = document.getElementById('book');

const left   = document.getElementById('page-left');
const right  = document.getElementById('page-right');

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
 * Utilidades
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

/***********************
 * Render base (páginas estáticas + loaders)
 ***********************/
function applySrc(img, url, spinner){
  if (!url){
    img.removeAttribute('src');
    img.style.opacity = 0;
    spinner.classList.add('hidden');
    return;
  }
  spinner.classList.remove('hidden');
  img.style.opacity = 0;
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
 * Hoja overlay (flip único que cruza el libro)
 ***********************/
function makeTurnOverlay({dir}) {
  // dir = 'forward' o 'backward'
  // Estructura:
  // <div class="turn">
  //   <div class="face front">  <img class="half left"> <img class="half right"> </div>
  //   <div class="face back">   <img class="half left"> <img class="half right"> </div>
  //   <div class="turnShade"></div>
  // </div>
  const turn = document.createElement('div');
  turn.className = 'turn';
  turn.style.transformOrigin = '50% 50%'; // lomo

  const front = document.createElement('div'); front.className='face front';
  const back  = document.createElement('div'); back.className='face back';
  const fL = document.createElement('img'); fL.className='half left';
  const fR = document.createElement('img'); fR.className='half right';
  const bL = document.createElement('img'); bL.className='half left';
  const bR = document.createElement('img'); bR.className='half right';
  front.append(fL,fR); back.append(bL,bR);

  const shade = document.createElement('div'); shade.className='turnShade';

  // Asignamos imágenes
  if (dir==='forward'){
    // Cara (0°): derecha actual; dorso (180°): próxima izquierda
    fR.src = pages[idx+1] || '';
    fL.style.opacity = 0; // transparente (no tapa la izquierda base)
    bL.src = pages[idx+2] || '';
    bR.style.opacity = 0;
  } else {
    // Cara (0°): izquierda actual; dorso (180°): derecha anterior
    fL.src = pages[idx]   || '';
    fR.style.opacity = 0;
    bR.src = pages[idx-1] || '';
    bL.style.opacity = 0;
  }

  turn.append(front, back, shade);
  book.appendChild(turn);
  return { turn, shade };
}

function setTurnDeg(turnEl, shadeEl, deg){
  // deg: 0 → ±180
  turnEl.style.transform = `rotateY(${deg}deg)`;
  const k = Math.sin(Math.min(Math.PI, (Math.abs(deg)/180)*Math.PI)); // 0..1..0
  shadeEl.style.opacity = 0.50 * k;
}

function animateTurn({dir, onDone}){
  if (isAnimating) return;
  isAnimating = true;

  const {turn, shade} = makeTurnOverlay({dir});

  // Inicia desde 0°: cara visible
  let from=0, to=(dir==='forward' ? -180 : 180), ms=620;
  const t0 = performance.now();

  function frame(now){
    const t = Math.min(1,(now-t0)/ms);
    const d = from + (to-from)*easeInOut(t);
    setTurnDeg(turn, shade, d);
    if(t<1) requestAnimationFrame(frame);
    else{
      turn.remove();
      isAnimating = false;
      onDone && onDone();
    }
  }
  requestAnimationFrame(frame);
}

/***********************
 * Navegación (usa el flip único)
 ***********************/
function next(){
  if (isAnimating || idx+2>=pages.length) return;
  // Preload por si acaso
  if (pages[idx+2]) { const i=new Image(); i.src=pages[idx+2]; }
  animateTurn({dir:'forward', onDone:()=>{ idx+=2; render(); }});
}
function prev(){
  if (isAnimating || idx<=0) return;
  if (pages[idx-1]) { const i=new Image(); i.src=pages[idx-1]; }
  animateTurn({dir:'backward', onDone:()=>{ idx-=2; render(); }});
}
function first(){ if(!isAnimating && idx>0){ idx=0; render(); } }
function last(){ if(isAnimating) return; const lastPair = clampPair(pages.length-2, pages.length); idx=lastPair; render(); }

/***********************
 * Drag desde esquina → dispara flip
 ***********************/
function startDrag(side, e){
  if (isAnimating) return;
  const rect = book.getBoundingClientRect();
  drag = {
    side,
    startX: e.clientX || (e.touches && e.touches[0].clientX) || 0,
    rect, t:0
  };
}
function moveDrag(e){
  if (!drag) return;
  const x = (e.clientX || (e.touches && e.touches[0].clientX) || drag.startX);
  const {rect, side} = drag;
  const half = rect.width/2;
  const center = rect.left + half;
  let t;
  if (side==='right'){ t = Math.min(1, Math.max(0, (center - x)/half)); }
  else               { t = Math.min(1, Math.max(0, (x - center)/half)); }
  drag.t = t;
}
function endDrag(){
  if (!drag) return;
  const {side, t} = drag; drag=null;
  if (t>0.45){
    if (side==='right') next(); else prev();
  }
}

/***********************
 * Eventos
 ***********************/
document.getElementById('btn-next').addEventListener('click', next);
document.getElementById('btn-prev').addEventListener('click', prev);
document.getElementById('btn-first').addEventListener('click', first);
document.getElementById('btn-last').addEventListener('click', last);

document.addEventListener('keydown', e=>{
  if(e.key==='ArrowRight') next();
  if(e.key==='ArrowLeft')  prev();
});

cornerR.addEventListener('pointerdown', e=>{ startDrag('right', e); });
cornerL.addEventListener('pointerdown', e=>{ startDrag('left',  e); });
window.addEventListener('pointermove', moveDrag, {passive:true});
window.addEventListener('pointerup',   endDrag);

slider.addEventListener('input', ()=>{ idx=parseInt(slider.value,10)*2; render(); });

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
