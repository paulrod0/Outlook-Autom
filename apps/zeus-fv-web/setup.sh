#!/usr/bin/env bash
# Arranque rápido de la app Zeus FV en local.
# Uso: bash setup.sh   (desde apps/zeus-fv-web)
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Zeus FV — arranque local"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js no está instalado. Instala Node 20+ desde https://nodejs.org"
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: se requiere Node 20 o superior (tienes $(node -v))."
  exit 1
fi

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "==> Creado .env.local desde la plantilla."
  echo "    (Opcional) edita DATABASE_URL para usar Neon; si no, se usa localStorage."
fi

echo "==> Instalando dependencias…"
npm install

echo "==> Arrancando servidor de desarrollo en http://localhost:3000"
npm run dev
