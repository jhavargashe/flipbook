#!/usr/bin/env bash
set -euo pipefail

ROOT="$(pwd)"

# Carpeta de libros con PDFs (books/<slug>/*.pdf)
BOOKS_DIR="${ROOT}/books"
# Salida de imágenes (assets/books/<slug>/pages/)
OUT_ROOT="${ROOT}/assets/books"

shopt -s nullglob

found_any=false

for pdf in "${BOOKS_DIR}"/**/*.pdf; do
  found_any=true

  # slug = subcarpeta (mi-libro, proyecto-x, etc.)
  slug="$(basename "$(dirname "$pdf")")"

  out_dir="${OUT_ROOT}/${slug}/pages"
  mkdir -p "$out_dir"

  # Nombre base sin extensión
  base="$(basename "$pdf" .pdf)"

  echo "Convirtiendo: $pdf -> $out_dir"

  # Con pdftoppm (rápido y nítido). 300 dpi a JPG.
  # Salida: page-1.jpg, page-2.jpg, ...
  pdftoppm -jpeg -r 300 "$pdf" "${out_dir}/page"

  # Asegurar extensión .jpg (pdftoppm produce page-1.jpg ya)
  # Normalizar calidad si quieres:
  for img in "${out_dir}"/page-*.jpg; do
    mogrify -strip -quality 92 "$img"
  done

done

if ! $found_any; then
  echo "No se encontraron PDFs en ${BOOKS_DIR}"
fi

echo "Conversión terminada."
