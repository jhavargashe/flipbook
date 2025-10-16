#!/usr/bin/env bash
# Convertir todos los PDFs en /books/<slug> a JPGs en /assets/books/<slug>/pages

# Hacemos el script robusto y compatible (sin exigir 'pipefail')
set -e
set -u
set -o pipefail 2>/dev/null || true

DPI="${DPI:-300}"             # resolución de salida (puedes 150/200/300/600)
QUALITY="${QUALITY:-95}"      # calidad JPG (0–100)

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
BOOKS_DIR="${ROOT}/books"
OUT_ROOT="${ROOT}/assets/books"

# Requiere poppler-utils (pdftoppm)
command -v pdftoppm >/dev/null 2>&1 || {
  echo "ERROR: 'pdftoppm' no está instalado."; exit 1;
}

shopt -s nullglob

# Recorre libros: /books/<slug>/*.pdf
for bookdir in "${BOOKS_DIR}"/*; do
  [ -d "$bookdir" ] || continue
  slug="$(basename "$bookdir")"

  # PDFs dentro del libro
  pdfs=("$bookdir"/*.pdf)
  [ ${#pdfs[@]} -gt 0 ] || continue

  outdir="${OUT_ROOT}/${slug}/pages"
  mkdir -p "$outdir"

  echo "==> Libro: ${slug}"
  # Limpiamos antiguos page-*.jpg (si existían)
  rm -f "${outdir}"/page-*.jpg

  # Si hay varios PDFs en el mismo libro, los concatenamos uno tras otro
  page_offset=0
  for pdf in "${pdfs[@]}"; do
    echo "   -> PDF: $(basename "$pdf")  (DPI=${DPI}, quality=${QUALITY})"
    # Salida temporal con prefijo dentro del propio outdir, para no mover archivos
    # pdftoppm genera page-1.jpg, page-2.jpg, ...
    pdftoppm -jpeg -r "${DPI}" "$pdf" "${outdir}/page"

    # Re-numera si ya había páginas anteriores (evita sobreescribir si hay >1 PDF)
    if [ $page_offset -gt 0 ]; then
      for f in "${outdir}"/page-*.jpg; do
        # extrae número
        base="$(basename "$f")"              # page-12.jpg
        num="${base#page-}"                  # 12.jpg
        num="${num%.jpg}"                    # 12
        newnum=$((num + page_offset))
        mv -f "$f" "${outdir}/page-${newnum}.jpg"
      done
    fi

    # actualiza el offset contando cuántas páginas hay ahora
    count_now=$(ls -1 "${outdir}"/page-*.jpg 2>/dev/null | wc -l | tr -d ' ')
    page_offset=$count_now
  done

  # Ajuste de calidad con mogrify (opcional; salta si no está ImageMagick)
  if command -v mogrify >/dev/null 2>&1; then
    mogrify -quality "${QUALITY}" "${outdir}"/page-*.jpg || true
  fi

  echo "   => Completado: ${slug} (${page_offset} páginas)"
done
