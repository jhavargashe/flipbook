#!/usr/bin/env bash
set -euo pipefail

PDF_DIR="pdfs"
OUT_BASE="books"

# Calidad de salida
DPI=400             # 300–600 según detalle
FORMAT="jpg"        # jpg|png|webp (si quieres webp, instala webp y ajusta)
JPEG_QUALITY=92     # para jpg (pdftocairo usa calidad alta por defecto)

# slugifica: "Mi Catálogo AW25.pdf" -> "mi-catalogo-aw25"
slugify() {
  local s="${1%.*}"
  # quita carpeta, deja nombre base
  s="$(basename "$s")"
  # translitera acentos -> ascii (si no está iconv, se omiten)
  s="$(printf '%s' "$s" | iconv -f utf8 -t ascii//TRANSLIT 2>/dev/null || printf '%s' "$s")"
  # minúsculas, no alfanum -> guiones, colapsa guiones
  s="$(printf '%s' "$s" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')"
  printf '%s' "$s"
}

# convierte un PDF a carpeta books/<slug>/page-001.jpg...
convert_one_pdf() {
  local pdf="$1"
  [ -f "$pdf" ] || return 0

  local slug; slug="$(slugify "$pdf")"
  local outdir="${OUT_BASE}/${slug}"

  echo "==> Convirtiendo: $pdf"
  echo "    Carpeta destino: $outdir"

  rm -rf "$outdir"
  mkdir -p "$outdir"

  # 1) volcar a JPG con poppler (pdftocairo genera prefix-1.jpg, prefix-2.jpg, ...)
  #    Nota: pdftoppm también sirve; pdftocairo suele dar buenos resultados en fotos.
  local prefix="${outdir}/page"
  if [ "$FORMAT" = "jpg" ] || [ "$FORMAT" = "jpeg" ]; then
    pdftocairo -jpeg -r "$DPI" "$pdf" "$prefix"
  elif [ "$FORMAT" = "png" ]; then
    pdftocairo -png -r "$DPI" "$pdf" "$prefix"
  else
    # fallback a jpg si formato no soportado aquí
    pdftocairo -jpeg -r "$DPI" "$pdf" "$prefix"
  fi

  # 2) renombrar a page-001.jpg, page-002.jpg...
  shopt -s nullglob
  i=1
  for f in "${outdir}/page-"*".jpg"; do
    pad=$(printf "%03d" "$i")
    mv -f "$f" "${outdir}/page-${pad}.jpg"
    i=$((i+1))
  done
  for f in "${outdir}/page-"*".png"; do
    pad=$(printf "%03d" "$i")
    mv -f "$f" "${outdir}/page-${pad}.png"
    i=$((i+1))
  done
  shopt -u nullglob

  # 3) crear manifest.json con pageCount y aspectRatio
  local first=""
  if compgen -G "${outdir}/page-001.*" > /dev/null; then
    first=$(ls "${outdir}/page-001."* | head -n1)
  fi
  local pages_count
  pages_count=$(ls "${outdir}"/page-*.* 2>/dev/null | wc -l | tr -d ' ')
  [ -z "$pages_count" ] && pages_count=0

  # dimensiones de la primera imagen
  local W=1000 H=1500
  if [ -n "$first" ]; then
    if identify -format "%w %h" "$first" >/dev/null 2>&1; then
      read -r W H < <(identify -format "%w %h" "$first")
    fi
  fi

  # aspect ratio (ancho/alto) de UNA página
  local AR
  if [ "$H" -gt 0 ]; then
    AR=$(awk -v w="$W" -v h="$H" 'BEGIN{ printf("%.6f", w/h) }')
  else
    AR="0.666667"
  fi

  cat > "${outdir}/manifest.json" <<JSON
{
  "name": "${slug}",
  "pageCount": ${pages_count},
  "aspectRatio": ${AR},
  "format": "${FORMAT}",
  "dpi": ${DPI}
}
JSON

  echo "    -> ${pages_count} páginas, AR=${AR}"
}

main() {
  mkdir -p "$OUT_BASE"
  if [ ! -d "$PDF_DIR" ]; then
    echo "No existe ${PDF_DIR}/; crea la carpeta y sube PDFs."
    exit 0
  fi

  shopt -s nullglob
  any=0
  for pdf in "${PDF_DIR}"/*.pdf "${PDF_DIR}"/*.PDF; do
    any=1
    convert_one_pdf "$pdf"
  done
  shopt -u nullglob

  if [ "$any" -eq 0 ]; then
    echo "No hay PDFs en ${PDF_DIR}/ — nada que convertir."
  fi
}

main "$@"
