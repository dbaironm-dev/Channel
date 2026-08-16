#!/usr/bin/env bash
# Corre las cinco suites contra los JSON de workflows/ y los CSV de hojas/.
# Sin dependencias: solo node. Úsalo cada vez que exportes un workflow desde n8n.
set -u
cd "$(dirname "$0")"

fallos=0
for prueba in 0*.js; do
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  $prueba"
  echo "══════════════════════════════════════════════════════════"
  node "$prueba" || fallos=$((fallos + 1))
done

echo ""
if [ "$fallos" -eq 0 ]; then
  echo "✅ Todas las suites pasan"
else
  echo "❌ $fallos suite(s) con fallos"
fi
exit "$fallos"
