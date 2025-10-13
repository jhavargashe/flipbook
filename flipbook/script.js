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
let pages = [];                 // urls por página (0-based)
let idx   = 1;                  // índice izquierda del pliego actual (p. ej. 1 => (2,3))
let isAnimating = false;
let atCover = false;            // estado especial de portada
let drag = null;                // { dir, overlay, shade, rect, startX, t, deg }
let wheelLockUntil = 0;

const viewer = document.getElementById('viewer');
const book   = document.getElementById('book');

const bl   = document.getElementById('base-left');
const br   = document.getElementById('base-right');
const imgBL= document.getElementById('base-img-left');
const imgBR= document.getElementById('base-img-right');

const spinL  = document.getElementById('spin-left');
const spinR  = document.getElementById('spin-right');

const destShadeL = document.getElementById('destShade-left');
const destShadeR = document.getElementById('destShade-right');

const cornerL= document.getElementById('corner-L');
const cornerR= document.getElementById('corner-R');

const slider = document.getElementById('slider');
const fill   = document.getElementById('fill');

const btnPrev  = document.getElementById('btn-prev');
const btnNext  = document.getElementById('btn-next');
const btnFirst = document.getElementById('btn-first');
const btnLast  = document.getElementById('btn-last');
const btnFS    = document.getElementById('btn-fs');

const bPrev = document.getElementById('b-prev');
const bNext = document.getElementById('b-next');

/***********************
 * Util
 ***********************/
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

function decodeImage(url){
  if (!url) return Promise.resolve();
  const img = new Image();
  img.src = url;
  if (img.decode) return img.decode().catch(()=>{});
  return new Promise(res => { img.onload = res; img.onerror = res; });
}
const decodePair = (l,r)=>Promise.all([decodeImage(l), decodeImage(r)]);

/***********************
 * Carga de imágenes base con spinner
 ***********************/
function applyBase(img, url, spinner){
  if (!url){ img.removeAttribute('src'); spinner?.classList.add('hidden'); return; }
  spinner?.classList.remove('hidden');
  img.onload  = ()=> spinner?.classList.add('hidden');
  img.onerror = ()=> spinner?.classList.add('hidden');
  img.src = url;
  if (img.complete && img.naturalWidth>0) spinner?.classList.add('hidden');
}

/***********************
 * Render lógicos
 ***********************/
function totalSpreads(){
  // En portada el slider mostrará 0…(spreads-1), pero el “spread 0” es portada.
  const n = pages.length;
  if (n<=1) return 1;
  return 1 /*portada*/ + Math.ceil((n-1)/2);
}

function renderCover(){
  atCover = true;
  book.classList.add('cover');
  // Página derecha = 1; izquierda ausente
  applyBase(imgBL, '', spinL);
  applyBase(imgBR, pages[0] || '', spinR);
  slider.max = Math.max(0, totalSpreads()-1);
  slider.value = 0;
  fill.style.width = '0%';
  updateButtons();
}

function renderSpread(){
  atCover = false;
  book.classList.remove('cover');
  const L = pages[idx]   || '';
  const R = pages[idx+1] || '';
  applyBase(imgBL, L, spinL);
  applyBase(imgBR, R, spinR);

  const spreadIndex = 1 + Math.floor((idx-1)/2);
  slider.max = Math.max(0, totalSpreads()-1);
  slider.value = Math.max(0, spreadIndex);
  const pct = slider.max ? (slider.value/slider.max)*100 : 0;
  fill.style.width = (isFinite(pct)?pct:0)+'%';
  updateButtons();
}

function updateButtons(){
  const atStart = atCover;
  const atEnd   = atCover ? pages.length<=1 : (idx+1)>=pages.length || (idx>=pages.length);
  btnPrev.disabled  = atStart;
  btnFirst.disabled = atStart;
  bPrev.disabled    = atStart;

  btnNext.disabled  = atEnd;
  btnLast.disabled  = atEnd;
  bNext.disabled    = atEnd;
}

/***********************
 * Overlay para el giro
 ***********************/
function makeTurnOverlay(dir, frontRightURL, backLeftURL, frontLeftURL, backRightURL) {
  const turn = document.createElement('div');
  turn.className = 'turn';
  turn.classList.add(dir); // 'forward' o 'backward'

  const front = document.createElement('div'); front.className='face front';
  const back  = document.createElement('div'); back.className='face back';

  const fL = document.createElement('img'); fL.className='half left';
  const fR = document.createElement('img'); fR.className='half right';
  const bL = document.createElement('img'); bL.className='half left';
  const bR = document.createElement('img'); bR.className='half right';

  if (dir==='forward'){ // R→L
    fR.src = frontRightURL || '';    // cara: derecha actual
    fL.style.opacity = 0;
    bL.src = backLeftURL  || '';     // dorso: próxima izquierda
    bR.style.opacity = 0;
  } else {              // L→R
    fL.src = frontLeftURL || '';     // cara: izquierda actual
    fR.style.opacity = 0;
    bR.src = backRightURL || '';     // dorso: derecha anterior
    bL.style.opacity = 0;
  }

  front.append(fL,fR); back.append(bL,bR);

  const shade = document.createElement('div'); shade.className='turnShade';
  turn.append(front, back, shade);
  book.appendChild(turn);
  return {turn, shade};
}

function setTurnDeg(turnEl, shadeEl, deg){
  turnEl.style.transform = `translateZ(1.4px) rotateY(${deg}deg)`;
  const k = Math.sin(Math.min(Math.PI, (Math.abs(deg)/180)*Math.PI)); // 0..1..0
  shadeEl.style.opacity = 0.55 * k;    // pliegue más visible en el medio

  // Oscurece destino progresivamente (imitando referente)
  const mid = Math.min(1, Math.abs(deg)/120); // sube más pronto y cae
  destShadeL.style.opacity = .18 * mid;
  destShadeR.style.opacity = .18 * mid;
}

function clearDestShade(){
  destShadeL.style.opacity = 0;
  destShadeR.style.opacity = 0;
}

/***********************
 * Animaciones principales
 ***********************/
function forward(){ // normal (no portada)
  if (isAnimating) return;
  if ((idx+1)>=pages.length) return;

  const Ld = pages[idx+2] || ''; // spread destino (2 adelante)
  const Rd = pages[idx+3] || '';

  // Prepara fondo destino ANTES de girar
  applyBase(imgBL, Ld, null);
  applyBase(imgBR, Rd, null);

  // Pre-decodifica para seguridad
  const gate = decodePair(Ld,Rd);

  // Hoja que gira: frente = derecha actual, dorso = próxima izquierda
  const frontRight = pages[idx+1] || '';
  const backLeft   = pages[idx+2] || '';

  const {turn, shade} = makeTurnOverlay('forward', frontRight, backLeft);

  isAnimating = true;
  const from=0, to=-180, ms=680; const t0=performance.now();
  function frame(now){
    const t = Math.min(1,(now-t0)/ms);
    const d = from + (to-from)*easeInOut(t);
    setTurnDeg(turn, shade, d);
    if(t<1) requestAnimationFrame(frame);
    else{
      Promise.resolve(gate).then(()=>{
        turn.remove(); clearDestShade();
        idx += 2; renderSpread(); isAnimating=false;
      });
    }
  }
  requestAnimationFrame(frame);
}

function backward(){ // normal (no portada)
  if (isAnimating) return;
  if (idx<=1) { // si volvemos a portada (con cover=true) se maneja aparte
    if (startMode==='cover' && pages.length>0) return backwardToCover();
    return;
  }

  const Ld = pages[idx-2] || '';
  const Rd = pages[idx-1] || '';

  applyBase(imgBL, Ld, null);
  applyBase(imgBR, Rd, null);

  const gate = decodePair(Ld,Rd);

  // Hoja que gira: frente = izquierda actual, dorso = derecha anterior
  const frontLeft  = pages[idx]   || '';
  const backRight  = pages[idx-1] || '';

  const {turn, shade} = makeTurnOverlay('backward', null,null, frontLeft, backRight);

  isAnimating = true;
  const from=0, to=180, ms=680; const t0=performance.now();
  function frame(now){
    const t = Math.min(1,(now-t0)/ms);
    const d = from + (to-from)*easeInOut(t);
    setTurnDeg(turn, shade, d);
    if(t<1) requestAnimationFrame(frame);
    else{
      Promise.resolve(gate).then(()=>{
        turn.remove(); clearDestShade();
        idx -= 2; renderSpread(); isAnimating=false;
      });
    }
  }
  requestAnimationFrame(frame);
}

/* Portada → abrir (1) ⇒ (2,3) */
function forwardFromCover(){
  if (isAnimating || pages.length<=1) return;

  // fondo destino = (2,3)
  const Ld = pages[1] || '';
  const Rd = pages[2] || '';
  applyBase(imgBL, Ld, null);
  applyBase(imgBR, Rd, null);
  const gate = decodePair(Ld,Rd);

  // gira la portada: frente=derecha actual(1), dorso=próxima izq(2)
  const {turn, shade} = makeTurnOverlay('forward', pages[0]||'', pages[1]||'');

  isAnimating = true;
  const from=0, to=-180, ms=680; const t0=performance.now();
  function frame(now){
    const t = Math.min(1,(now-t0)/ms);
    const d = from + (to-from)*easeInOut(t);
    setTurnDeg(turn, shade, d);
    if(t<1) requestAnimationFrame(frame);
    else{
      Promise.resolve(gate).then(()=>{
        turn.remove(); clearDestShade();
        idx = 1; renderSpread(); isAnimating=false;
      });
    }
  }
  requestAnimationFrame(frame);
}

/* (2,3) ⇒ Portada */
function backwardToCover(){
  if (isAnimating) return;

  // Fondo destino = portada (solo derecha=1)
  applyBase(imgBL, '', null);
  applyBase(imgBR, pages[0]||'', null);
  const gate = decodeImage(pages[0]||'');

  // Gira la izquierda actual (2) hacia atrás, dorso=1
  const {turn, shade} = makeTurnOverlay('backward', null,null, pages[idx]||'', pages[0]||'');

  isAnimating = true;
  const from=0, to=180, ms=680; const t0=performance.now();
  function frame(now){
    const t = Math.min(1,(now-t0)/ms);
    const d = from + (to-from)*easeInOut(t);
    setTurnDeg(turn, shade, d);
    if(t<1) requestAnimationFrame(frame);
    else{
      Promise.resolve(gate).then(()=>{
        turn.remove(); clearDestShade();
        renderCover(); isAnimating=false;
      });
    }
  }
  requestAnimationFrame(frame);
}

/***********************
 * Navegación (botones/teclado/rueda/click)
 ***********************/
function next(){
  if (atCover) return forwardFromCover();
  return forward();
}
function prev(){
  if (atCover) return; // ya estás en portada
  if (startMode==='cover' && idx<=1) return backwardToCover();
  return backward();
}
function first(){ if (startMode==='cover') renderCover(); else { idx=1; renderSpread(); } }
function last(){
  if (pages.length<=1){ first(); return; }
  const tail = (pages.length-1); // última izquierda según haya impar/par
  idx = tail%2===0 ? tail-1 : tail - 2 + 1; // ajusta para que idx apunte a izquierda válida
  if (idx<1) idx=1;
  renderSpread();
}

btnNext.onclick = next;  bNext.onclick = next;
btnPrev.onclick = prev;  bPrev.onclick = prev;
btnFirst.onclick= first; btnLast.onclick = last;

/* Click dentro del libro: mitad izq/der */
book.addEventListener('click', (e)=>{
  if (isAnimating) return;
  if (e.target && e.target.closest('.corner')) return;
  const rect = book.getBoundingClientRect();
  const centerX = rect.left + rect.width/2;
  if (e.clientX < centerX) prev(); else next();
});

/* Rueda del mouse sobre el libro */
book.addEventListener('wheel', (e)=>{
  e.preventDefault();
  if (isAnimating) return;
  const now = performance.now();
  if (now < wheelLockUntil) return;
  wheelLockUntil = now + 320;
  if (e.deltaY > 0) next();
  else if (e.deltaY < 0) prev();
}, { passive:false });

/* Teclado */
document.addEventListener('keydown', e=>{
  if(e.key==='ArrowRight') next();
  if(e.key==='ArrowLeft')  prev();
});

/***********************
 * Drag de esquina
 ***********************/
function startDrag(side, e){
  if (isAnimating) return;

  const dir = (side==='right') ? 'forward' : 'backward';

  // Determina spread destino y prepara fondo
  if (dir==='forward'){
    if (atCover){
      applyBase(imgBL, pages[1]||'', null);
      applyBase(imgBR, pages[2]||'', null);
    } else {
      applyBase(imgBL, pages[idx+2]||'', null);
      applyBase(imgBR, pages[idx+3]||'', null);
    }
  } else {
    if (atCover) return; // nada que arrastrar
    if (idx<=1 && startMode==='cover'){
      applyBase(imgBL, '', null);
      applyBase(imgBR, pages[0]||'', null);
    } else {
      applyBase(imgBL, pages[idx-2]||'', null);
      applyBase(imgBR, pages[idx-1]||'', null);
    }
  }

  // Hoja overlay según estado
  let overlay;
  if (dir==='forward'){
    const frontRight = atCover ? pages[0]||'' : pages[idx+1]||'';
    const backLeft   = atCover ? pages[1]||'' : pages[idx+2]||'';
    overlay = makeTurnOverlay('forward', frontRight, backLeft);
  } else {
    const frontLeft = pages[idx]||'';
    const backRight = (idx<=1 && startMode==='cover') ? pages[0]||'' : pages[idx-1]||'';
    overlay = makeTurnOverlay('backward', null,null, frontLeft, backRight);
  }

  const rect = book.getBoundingClientRect();
  const startX = (e.touches?e.touches[0].clientX:e.clientX) ?? rect.right;
  drag = { dir, overlay:overlay.turn, shade:overlay.shade, rect, startX, t:0, deg:0 };

  setTurnDeg(drag.overlay, drag.shade, dir==='forward' ? -6 : 6);
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
    isAnimating = true;
    const ms = 360, from = deg, to = (dir==='forward') ? -180 : 180;
    const t0 = performance.now();
    function frame(now){
      const k = Math.min(1,(now-t0)/ms);
      const d = from + (to-from)*easeInOut(k);
      setTurnDeg(overlay, shade, d);
      if (k<1) requestAnimationFrame(frame);
      else {
        overlay.remove(); clearDestShade();
        if (dir==='forward'){
          if (atCover) { idx=1; renderSpread(); }
          else { idx+=2; renderSpread(); }
        } else {
          if (startMode==='cover' && idx<=1) { renderCover(); }
          else { idx-=2; renderSpread(); }
        }
        isAnimating=false;
      }
    }
    requestAnimationFrame(frame);
  } else {
    // volver a 0°
    isAnimating = true;
    const ms = 240, from = deg, to = 0;
    const t0 = performance.now();
    function frame(now){
      const k = Math.min(1,(now-t0)/ms);
      const d = from + (to-from)*easeInOut(k);
      setTurnDeg(overlay, shade, d);
      if (k<1) requestAnimationFrame(frame);
      else { overlay.remove(); clearDestShade(); isAnimating=false; }
    }
    requestAnimationFrame(frame);
  }
}

cornerR.addEventListener('pointerdown', e=>{ startDrag('right', e); });
cornerL.addEventListener('pointerdown', e=>{ startDrag('left',  e); });
window.addEventListener('pointermove', moveDrag, {passive:true});
window.addEventListener('pointerup',   endDrag);
window.addEventListener('pointercancel', endDrag);

/***********************
 * Slider
 ***********************/
slider.addEventListener('input', ()=>{
  const v = parseInt(slider.value,10);
  if (startMode==='cover'){
    if (v===0){ renderCover(); return; }
    // v=1 corresponde a idx=1; luego +2 cada paso
    idx = 1 + (v-1)*2;
  } else {
    idx = 1 + v*2;
  }
  renderSpread();
});

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
let startMode = 'cover';

(async function init(){
  // modo de inicio por atributo
  startMode = (book.getAttribute('data-start')||'cover').toLowerCase()==='spread' ? 'spread' : 'cover';

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

  if(pages.length){
    preload(pages.slice(0,6));
    // Render inicial
    if (startMode==='cover' && pages.length>=1){
      renderCover();
    } else {
      idx = (pages.length>=2)?1:1; // 1 => (2,3) cuando exista
      renderSpread();
    }
  } else {
    // sin páginas: tapa todo en blanco
    renderCover();
  }
})();
