#!/usr/bin/env bash
set -euo pipefail

# Si el script se copió con CRLF alguna vez, normalízate a ti mismo silenciosamente
if command -v dos2unix >/dev/null 2>&1; then
  dos2unix "$0" >/dev/null 2>&1 || true
fi

if ! command -v pdftoppm >/dev/null 2>&1; then
  echo "ERROR: 'pdftoppm' no está instalado." >&2
  exit 1
fi

shopt -s nullglob

ROOT="$(pwd)"
BOOKS_DIR="${ROOT}/books"

# Busca libros: books/<slug>/*.pdf
found_any=false
for pdf in "${BOOKS_DIR}"/*/*.pdf; do
  found_any=true

  book_dir="$(dirname "$pdf")"                     # books/mi-libro
  slug="$(basename "$book_dir")"                   # mi-libro
  out_dir="${ROOT}/assets/books/${slug}/pages"     # assets/books/mi-libro/pages

  mkdir -p "${out_dir}"

  echo "==> Procesando: ${pdf}"
  echo "    Salida en:  ${out_dir}"

  # Limpia JPGs previos (si quieres conservarlos, comenta esta línea)
  rm -f "${out_dir}"/*.jpg

  # Convierte a JPG a 300 DPI. Cambia -r si quieres otra resolución.
  # Esto genera page-1.jpg, page-2.jpg, ...
  pdftoppm -jpeg -r 300 "$pdf" "${out_dir}/page" >/dev/null

  # Renombra a 1.jpg, 2.jpg, ...
  n=1
  for f in "${out_dir}"/page-*.jpg; do
    mv "$f" "${out_dir}/${n}.jpg"
    n=$((n+1))
  done

  echo "    OK (${n-1} páginas)"
done

if [ "${found_any}" = false ]; then
  echo "No se encontraron PDFs en 'books/<slug>/*.pdf'." >&2
fi
