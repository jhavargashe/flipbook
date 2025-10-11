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
    i.src = url + `?v=$
