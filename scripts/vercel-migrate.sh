#!/bin/sh
# Applies database migrations during Vercel's production build, before the app is
# built. A failure stops the build, so the current deployment stays live.
# Everywhere else (previews, CI, local builds) it does nothing.
set -eu

if [ "${VERCEL_ENV:-}" != "production" ]; then
  exit 0
fi
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set: refusing to build production without migrating." >&2
  exit 1
fi

cd "$(dirname "$0")/../packages/db"
exec pnpm exec node --import tsx/esm src/migrate.ts
