:root{
  /* AR base: el JS seteará --page-ar al medir la primera imagen real */
  --page-ar: 2/3;                            /* ancho/alto de UNA página */
  --book-ar: calc(2 * var(--page-ar));       /* spread = dos páginas lado a lado */

  --radius: 16px;
  --shadow: 0 18px 55px rgba(0,0,0,.18);
  --bg: #f5f6f7;

  /* tema claro (fullscreen cambia variables abajo) */
  --tc-bg: rgba(255,255,255,.92);
  --tc-shadow: 0 6px 20px rgba(0,0,0,.12);
  --icon-bg:#fff; --icon-fg:#222; --icon-bd:#d9d9d9;

  --rail:#cbcbcb; --fill:#6f6f6f;

  /* spinner */
  --spin-base: rgba(0,0,0,.14);
  --spin-fg:   #6f6f6f;
  --spin-bg:   rgba(255,255,255,.75);

  /* sombras (máximos) */
  --static-shadow-max: 0.85;  /* PE1/PE2 (lado “atrás”) */
  --dest-shadow-max:   0.65;  /* proyección sobre receptora */
}

*{box-sizing:border-box}
html,body{height:100%;margin:0;background:var(--bg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
button{border:0;background:none;padding:0;cursor:pointer}

.viewer{min-height:100vh;display:grid;place-items:center;position:relative}

/* Botonera superior */
.top-controls{
  position:fixed; right:16px; top:16px; z-index:12;
  display:flex; gap:8px; background:var(--tc-bg);
  border-radius:12px; padding:6px 8px; box-shadow:var(--tc-shadow);
  backdrop-filter:blur(6px)
}
.icon{
  width:38px;height:38px;border-radius:10px;background:var(--icon-bg);color:var(--icon-fg);
  border:1px solid var(--icon-bd); font-size:18px;line-height:38px;text-align:center;
  transition:transform .12s ease,opacity .12s ease
}
.icon:disabled{opacity:.35;cursor:not-allowed}
.icon:hover{transform:translateY(-1px)}

.stack{display:flex;flex-direction:column;align-items:center;gap:36px;width:100%}

/* Libro: SIEMPRE usa AR de spread; sin perspectiva (plano) */
.book{
  position:relative;width:min(96vw,1280px);aspect-ratio:var(--book-ar);
  background:#fff;border-radius:var(--radius);box-shadow:var(--shadow);
  overflow:hidden; /* durante drag abrimos para que no se corte el overlay */
}
.book.dragging{ overflow:visible; }

/* Skeleton inicial (antes de medir AR real) */
.book-skeleton{
  position:absolute; inset:0; display:grid; grid-template-columns:1fr 1fr; gap:1px;
  background:linear-gradient(180deg,#ececec,#f7f7f7);
  z-index:0; pointer-events:none;
}
.book[data-ready="true"] .book-skeleton{ display:none; }
.book-skeleton .sk-left{ background:repeating-linear-gradient(90deg,#f2f2f2,#f2f2f2 12px,#f8f8f8 12px,#f8f8f8 24px) }
.book-skeleton .sk-right{ background:repeating-linear-gradient(90deg,#f7f7f7,#f7f7f7 12px,#ffffff 12px,#ffffff 24px) }

.gutter{
  position:absolute;inset:0;z-index:1;pointer-events:none;
  background:
    linear-gradient(90deg, rgba(0,0,0,.08), transparent 12%, transparent 88%, rgba(0,0,0,.08)),
    radial-gradient(120px 100% at 50% 0, rgba(0,0,0,.14), transparent 60%),
    radial-gradient(120px 100% at 50% 100%, rgba(0,0,0,.14), transparent 60%);
  opacity:.33
}

/* Mitades estáticas */
.page{
  position:absolute; top:0; bottom:0; width:50%; height:100%;
  z-index:2; transform-style:preserve-3d;
}
.page.left  { left:0;  transform-origin:right center }
.page.right { right:0; transform-origin:left  center }

.sheet{ position:absolute; inset:0; width:100%; height:100%;
  backface-visibility:hidden; transform-style:preserve-3d; will-change:transform }
.sheet img{ position:absolute; inset:0; width:100%; height:100%; object-fit:contain; background:#fff; opacity:0; transition:opacity .18s ease }
.sheet .back{ content:""; position:absolute; inset:0; background:#fff; transform:rotateY(180deg); backface-visibility:hidden }
.sheet .edge{ position:absolute; top:0; bottom:0; width:3px; left:auto; right:0; background:linear-gradient(180deg,#ddd,#aaa,#ddd); transform:translateZ(0.5px) }
.page.left .sheet .edge{ left:0; right:auto }
.sheet .foldShade{ position:absolute; inset:0; pointer-events:none; opacity:0; background:linear-gradient(90deg, rgba(0,0,0,.35), rgba(0,0,0,0) 35%) }
.page.left .sheet .foldShade{ background:linear-gradient(270deg, rgba(0,0,0,.35), rgba(0,0,0,0) 35%) }

/* Sombras estáticas (PE1/PE2) — más fuertes y animables */
.shadow-static{
  position:absolute; inset:0; pointer-events:none; opacity:0; z-index:3;
}
.shadow-static.left{
  /* R→L: derecha más oscura sobre la izquierda (gutter hacia adentro) */
  background:
    linear-gradient(270deg, rgba(0,0,0,.95), rgba(0,0,0,0) 45%),
    radial-gradient(80% 140% at 50% 50%, rgba(0,0,0,.35), transparent 60%);
}
.shadow-static.right{
  /* L→R: izquierda más oscura sobre la derecha */
  background:
    linear-gradient(90deg, rgba(0,0,0,.95), rgba(0,0,0,0) 45%),
    radial-gradient(80% 140% at 50% 50%, rgba(0,0,0,.35), transparent 60%);
}

/* Franja de arrastre por borde */
.drag-zone{
  position:absolute; top:0; height:100%; width:9%;
  z-index:8; opacity:0; cursor:ew-resize; touch-action:none;
}
.drag-zone.left  { left:0; }
.drag-zone.right { right:0; }

/* Loader por página */
.spinner{
  position:absolute; z-index:6; top:50%; left:50%; transform:translate(-50%,-50%);
  width:46px; height:46px; border-radius:50%;
  border:3px solid var(--spin-base); border-top-color:var(--spin-fg);
  animation: spin .9s linear infinite; box-shadow: 0 2px 8px rgba(0,0,0,.12);
  background: radial-gradient(closest-side, var(--spin-bg), rgba(255,255,255,0) 70%);
  transition: opacity .18s ease, transform .18s ease;
}
.spinner.hidden{ opacity:0; transform:translate(-50%,-50%) scale(.9); pointer-events:none }
@keyframes spin { to { transform:translate(-50%,-50%) rotate(360deg) } }

/* Barra inferior (delgada y separada ~ 3x su alto) */
.bar{width:100%;display:flex;justify-content:center; margin-top: 54px; }
.bar-box{background:var(--tc-bg);border-radius:12px;box-shadow:var(--tc-shadow);padding:10px 12px}
.rail{ position:relative;width:min(96vw,1280px);height:12px;border-radius:999px;background:var(--rail);box-shadow:inset 0 2px 5px rgba(0,0,0,.08) }
.fill{ position:absolute;left:2px;top:2px;bottom:2px;width:0%;background:var(--fill);border-radius:999px;transition:width .12s linear }
.slider{ position:absolute;inset:0;width:100%;height:100%;appearance:none;background:transparent;outline:none;cursor:pointer }
.slider::-webkit-slider-thumb{appearance:none;width:0;height:0}
.slider::-moz-range-thumb{width:0;height:0;border:0}

/* Fullscreen: tema oscuro */
:fullscreen .viewer{
  --tc-bg: rgba(20,20,20,.88); --tc-shadow: 0 10px 30px rgba(0,0,0,.35);
  --icon-bg:#111; --icon-fg:#fff; --icon-bd:#0000;
  --rail:#8d8d8d; --fill:#2a2a2a;
  --spin-base: rgba(255,255,255,.22); --spin-fg:#e9e9e9; --spin-bg: rgba(0,0,0,.25);
  background:#000;
}

/* ============ HOJA OVERLAY (flip único, plano, hinge en el lomo) ============ */
.turn{
  position:absolute; inset:-24px; z-index:9; pointer-events:none;
  transform-style:preserve-3d;
  /* hinge: en el centro (lomo) — el JS decide dirección mediante rotateY +/- */
  transform-origin: 50% 50%;
}
.turn .face{
  position:absolute; inset:24px;
  backface-visibility:hidden;
}
.turn .back{ transform:rotateY(180deg) }
.turn img{ width:100%; height:100%; object-fit:contain; background:transparent }

/* Cresta del pliegue (solo en hoja activa) */
.foldRidge, .turn .foldRidge{
  position:absolute; top:24px; bottom:24px; width:20%;
  left:40%; pointer-events:none; opacity:0;
  background:
    radial-gradient(60% 140% at 50% 50%, rgba(0,0,0,.20), transparent 60%),
    linear-gradient(90deg, rgba(0,0,0,.35), rgba(0,0,0,0) 35%);
}

/* Proyección en página receptora (se inyecta dinámicamente) */
.shadow-dest{
  position:absolute; inset:0; pointer-events:none; opacity:0; z-index:4;
  background:
    radial-gradient(90% 120% at 50% 50%, rgba(0,0,0,.35), transparent 60%),
    linear-gradient(90deg, rgba(0,0,0,.25), rgba(0,0,0,0) 40%);
}

/* Flechas laterales minimalistas (fuera del libro, alineadas) */
.edge-hint{
  position:fixed; bottom:68px; z-index:11;
  width:32px; height:32px; display:grid; place-items:center;
  font-size:24px; line-height:1; color:#111;
  filter: drop-shadow(0 2px 3px rgba(0,0,0,.25));
  opacity:.9;
}
.edge-hint.left  { left:  calc(50vw - min(96vw, 1280px)/2 - 28px); }
.edge-hint.right { right: calc(50vw - min(96vw, 1280px)/2 - 28px); }
.edge-hint:disabled{ opacity:.25; cursor:not-allowed }
.edge-hint:hover{ transform:translateY(-1px) }
