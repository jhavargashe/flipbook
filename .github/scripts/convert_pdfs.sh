#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

# Convierte cada PDF que encuentre dentro de books/<libro>/ a JPGs en assets/books/<libro>/pages
# Requisitos: ImageMagick (magick) y/o poppler-utils (ya los instala el workflow)

ROOT_DIR="$(pwd)"

for dir in "$ROOT_DIR"/books/*; do
  [[ -d "$dir" ]] || continue

  # PDF de entrada: prioriza books/<libro>/source.pdf; si no, cualquier *.pdf del directorio
  pdf=""
  if [[ -f "$dir/source.pdf" ]]; then
    pdf="$dir/source.pdf"
  else
    for f in "$dir"/*.pdf; do pdf="$f"; break; done
  fi

  [[ -n "${pdf}" ]] || { echo "⚠️  No hay PDF en $dir, se omite."; continue; }

  slug="$(basename "$dir")"
  out="$ROOT_DIR/assets/books/$slug/pages"
  mkdir -p "$out"

  echo "📄 Libro: $slug"
  echo "   PDF : $pdf"
  echo "   OUT : $out"

  # Limpia salidas anteriores
  rm -f "$out"/page-*.jpg

  # Conversión con ImageMagick (300 DPI, buena calidad)
  # Nota: algunos runners bloquean PDF por policy.xml; el workflow lo ajusta.
  magick -density 300 "$pdf" -quality 92 -alpha remove -strip "$out/page-%d.jpg"

  # ImageMagick numera desde 0 -> renumeramos a base 1: page-1.jpg, page-2.jpg, ...
  for f in "$out"/page-*.jpg; do
    base="$(basename "$f")"
    n="${base#page-}"; n="${n%.jpg}"       # número 0-based
    new=$(( n + 1 ))
    mv "$f" "$out/page-$new.jpg"
  done

  # Manifest con número de páginas (opcional, útil para el visor)
  count=$(ls "$out"/page-*.jpg 2>/dev/null | wc -l | tr -d ' ')
  printf '{ "book": "%s", "pages": %d }\n' "$slug" "$count" > "$out/manifest.json"

  echo "✅ Convertido: $count páginas para $slug"
done
