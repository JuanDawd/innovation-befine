#!/usr/bin/env bash
# Throwaway test database for E2E and packages/db integration tests (M-71, M-70b).
#
# Starts Postgres 17 (data on tmpfs) behind a local Neon HTTP/WebSocket proxy, so
# the app's Neon serverless driver works unchanged with NEON_LOCAL_PROXY=1.
# The password is random per run — no credential is ever committed.
#
#   scripts/test-db.sh up      start (or restart = empty database) and print the env
#   scripts/test-db.sh down    remove the containers
#
# On GitHub Actions the env is written to $GITHUB_ENV and the password masked.
# PUBLIC_HOST (default localhost) is the host clients use, e.g. 192.168.0.107
# when the containers run on another machine.
set -euo pipefail

NET=befine-testdb
PG=befine-testdb-pg
PROXY=befine-testdb-proxy
HOST="${PUBLIC_HOST:-localhost}"

down() {
  docker rm -f "$PG" "$PROXY" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}

up() {
  down
  local pw
  pw="$(openssl rand -hex 24)"
  docker network create "$NET" >/dev/null

  docker run -d --name "$PG" --network "$NET" \
    -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD="$pw" -e POSTGRES_DB=main \
    --tmpfs /var/lib/postgresql/data \
    --health-cmd "pg_isready -U postgres -d main" --health-interval 1s --health-retries 60 \
    postgres:17 >/dev/null
  until [ "$(docker inspect -f '{{.State.Health.Status}}' "$PG")" = healthy ]; do sleep 1; done

  # Only the proxy is published; Postgres stays on the private network.
  docker run -d --name "$PROXY" --network "$NET" -p 4444:4444 \
    -e PG_CONNECTION_STRING="postgres://postgres:${pw}@${PG}:5432/main" \
    ghcr.io/timowilhelm/local-neon-http-proxy:main >/dev/null
  for _ in $(seq 1 60); do
    curl -s -o /dev/null "http://localhost:4444/sql" && break
    sleep 1
  done

  local url="postgres://postgres:${pw}@${HOST}:5432/main"
  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "::add-mask::${pw}"
    {
      echo "NEON_LOCAL_PROXY=1"
      echo "DATABASE_URL=${url}"
      echo "TEST_DATABASE_URL=${url}"
    } >>"$GITHUB_ENV"
  else
    echo "export NEON_LOCAL_PROXY=1"
    echo "export DATABASE_URL='${url}'"
    echo "export TEST_DATABASE_URL='${url}'"
  fi
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  *) echo "usage: $0 up|down" >&2; exit 2 ;;
esac
