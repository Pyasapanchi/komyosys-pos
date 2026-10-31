#!/bin/sh
# Tenant-isolation test: spins up a throwaway copy of the POS (own DB, no ports,
# not on Traefik), registers restaurants A and B, fills every table with A's data,
# then attacks A as B through every API route, API keys, MCP and public QR links.
# Run on the server from the repo root after building the backend image:
#   sh tests/tenant-isolation/run.sh
# Leaves nothing behind (down -v at the end).
set -eu

HERE=tests/tenant-isolation
ENV=$(mktemp)
printf "POSTGRES_PASSWORD=%s\nJWT_SECRET=%s\nAPP_VERSION=dev\n" "$(openssl rand -hex 16)" "$(openssl rand -hex 32)" > "$ENV"
C="docker compose -p pos-isotest --env-file $ENV -f docker-compose.yml -f $HERE/docker-compose.isotest.yml"
trap '$C down -v >/dev/null 2>&1; rm -f "$ENV"' EXIT

$C up -d postgres backend
for i in $(seq 1 40); do docker logs pos-isotest-backend 2>&1 | grep -q "successfully started" && break; sleep 3; done
docker exec -i pos-isotest-postgres psql -U nodedr -d nodedr_restaurant -q -v ON_ERROR_STOP=1 < deploy/vps-lockdown.sql

docker logs pos-isotest-backend 2>&1 | grep -o -E "Mapped \{[^}]+\}" \
  | sed -E "s/Mapped \{([^,]+), ([A-Z]+)\}/\2 \1/" > /tmp/isotest-routes.txt
docker cp /tmp/isotest-routes.txt pos-isotest-backend:/tmp/isotest-routes.txt
for f in setup attack keys targeted role summarize; do
  docker cp "$HERE/$f.mjs" "pos-isotest-backend:/repo/apps/backend/isotest-$f.mjs"
done

X="docker exec -w /repo/apps/backend pos-isotest-backend node"
$X isotest-setup.mjs
$X isotest-attack.mjs
$X isotest-summarize.mjs
$X isotest-keys.mjs
$X isotest-targeted.mjs
$X isotest-role.mjs
