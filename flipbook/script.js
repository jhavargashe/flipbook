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
 * z-index dinámico del lado activo
 ***********************/
function beginTurn(side){
  left.classList.remove('turning');
  right.classList.remove('turning');
  if (side==='right') right.classList.add('turning');
  else                left.classList.add('turning');
}
function endTurn(){
  left.classList.remove('turning');
  right.classList.remove('turning');
}

/***********************
 * Render/UI + loaders
 ***********************/
function setSheetTransform(side, deg){
  const page  = side==='right' ? right : left;
  const sheet = page.querySelector('.sheet');
  sheet.style.transform = `rotateY(${side==='right' ? -deg : deg}deg)`;

  const fold = page.querySelector('.foldShade');
  const opp  = page.querySelector('.oppositeShade');
  const k = Math.sin(Math.min(Math.PI, (deg/180)*Math.PI)); // 0..1..0
  fold.style.opacity = 0.55 * k;
  opp.style.opacity  = 0.38 * k;

  const edge = page.querySelector('.edge');
  edge.style.opacity = 0.75 - 0.5*k;
}

function relax(side, toDeg, ms=520, done){
  if (isAnimating) return;
  isAnimating = true;
  beginTurn(side);

  const page = side==='right'?right:left;
  const sheet = page.querySelector('.sheet');
  const from = (()=> {
    const m = sheet.style.transform.match(/rotateY\((-?[\d.]+)deg\)/);
    if(!m) return 0;
    return Math.abs(parseFloat(m[1]));
  })();

  const start = performance.now();
  function frame(now){
    const t = Math.min(1,(now-start)/ms);
    const d = from + (toDeg-from)*easeInOut(t);
    setSheetTransform(side, d);
    if (t<1) requestAnimationFrame(frame);
    else { isAnimating=false; endTurn(); done && done(); }
  }
  requestAnimationFrame(frame);
}

function updateUI(){
  const spreads = Math.ceil(pages.length/2);
  slider.max = Math.max(0, spreads-1);
  slider.value = Math.floor(idx/2);
  const pct = spreads>1 ? (slider.value/(spreads-1))*100 : 0;
  fill.style.width = (isFinite(pct)?pct:0)+'%';

  const atStart = idx<=0;
  const atEnd   = idx+2>=pages.length;
  btnPrev.disabled = atStart;
  btnNext.disabled = atEnd;
  btnFirst.disabled= atStart;
  btnLast.disabled = atEnd;
}

/* Loader por lado */
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

function render(){
  if(!pages.length){
    imgL.removeAttribute('src'); imgR.removeAttribute('src');
    spinL.classList.add('hidden'); spinR.classList.add('hidden');
    updateUI(); return;
  }
  idx = clampPair(idx, pages.length);
  applySrc(imgL, pages[idx]   || '', spinL);
  applySrc(imgR, pages[idx+1] || '', spinR);

  setSheetTransform('left',  0);
  setSheetTransform('right', 0);
  endTurn();
  updateUI();
}

/***********************
 * Navegación (ahora con beginTurn/endTurn)
 ***********************/
function next(){
  if (isAnimating || idx+2>=pages.length) return;
  relax('right', 180, 560, ()=>{ idx+=2; render(); });
}
function prev(){
  if (isAnimating || idx<=0) return;
  relax('left', 180, 560, ()=>{ idx-=2; render(); });
}
function first(){ if(idx>0){ idx=0; render(); } }
function last(){ const lastPair = clampPair(pages.length-2, pages.length); idx=lastPair; render(); }

/***********************
 * Drag desde la esquina
 ***********************/
function startDrag(side, e){
  if (isAnimating) return;
  beginTurn(side);
  const rect = book.getBoundingClientRect();
  drag = {
    side,
    startX: e.clientX || (e.touches && e.touches[0].clientX) || 0,
    rect
  };
  setSheetTransform(side, 10);
}
function moveDrag(e){
  if (!drag) return;
  const x = (e.clientX || (e.touches && e.touches[0].clientX) || drag.startX);
  const {rect, side} = drag;
  const half = rect.width/2;
  const center = rect.left + half;
  let t;

  if (side==='right'){
    t = Math.min(1, Math.max(0, (center - x)/half));
    setSheetTransform('right', t*180);
  }else{
    t = Math.min(1, Math.max(0, (x - center)/half));
    setSheetTransform('left', t*180);
  }
  drag.t = t;
}
function endDrag(){
  if (!drag) return;
  const {side, t} = drag;
  drag = null;
  if (t>0.5){
    if (side==='right'){ relax('right', 180, 420, ()=>{ idx+=2; render(); }); }
    else               { relax('left',  180, 420, ()=>{ idx-=2; render(); }); }
  }else{
    relax(side, 0, 360, ()=>{ /* no cambio de spread */ });
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
 * Init (detección)
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
