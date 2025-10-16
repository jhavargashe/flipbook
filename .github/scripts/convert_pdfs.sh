#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"
BOOKS_DIR="${ROOT}/books"            # PDFs: books/<libro>/*.pdf
OUT_ROOT="${ROOT}/assets/books"      # JPGs: assets/books/<libro>/pages/page-1.jpg...

shopt -s globstar nullglob

found_any=false

echo "Buscando PDFs en: ${BOOKS_DIR}"

for pdf in "${BOOKS_DIR}"/**/*.pdf; do
  found_any=true

  # <libro> es la carpeta contenedora del PDF
  slug="$(basename "$(dirname "$pdf")")"
  out_dir="${OUT_ROOT}/${slug}/pages"
  mkdir -p "$out_dir"

  echo "Convirtiendo: $pdf"
  echo "Destino:      $out_dir"

  # -r 300 => 300 dpi; -jpeg => salida JPG; prefijo 'page'
  # Genera page-1.jpg, page-2.jpg, ...
  pdftoppm -jpeg -r 300 "$pdf" "${out_dir}/page"

  # Normaliza metadatos/calidad (opcional)
  for img in "${out_dir}"/page-*.jpg; do
    [ -f "$img" ] || continue
    mogrify -strip -quality 92 "$img"
  done
done

if ! $found_any; then
  echo "No se encontraron PDFs en ${BOOKS_DIR}"
else
  echo "Conversión terminada."
  echo "Revisar: assets/books/<libro>/pages/page-1.jpg ..."
fi
