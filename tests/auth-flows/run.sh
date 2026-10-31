#!/bin/sh
# End-to-end test of password reset, email verification and one-account-per-email,
# on a throwaway copy of the POS with a Mailpit mail catcher. Run on the server
# from the repo root after building the backend image:
#   sh tests/auth-flows/run.sh
set -eu

ENV=$(mktemp)
printf "POSTGRES_PASSWORD=%s\nJWT_SECRET=%s\nAPP_VERSION=dev\n" "$(openssl rand -hex 16)" "$(openssl rand -hex 32)" > "$ENV"
C="docker compose -p pos-isotest --env-file $ENV -f docker-compose.yml -f tests/tenant-isolation/docker-compose.isotest.yml -f tests/auth-flows/docker-compose.mail.yml"
trap '$C down -v >/dev/null 2>&1; rm -f "$ENV"' EXIT

$C up -d postgres mailpit backend
for i in $(seq 1 40); do docker logs pos-isotest-backend 2>&1 | grep -q "successfully started" && break; sleep 3; done
docker exec -i pos-isotest-postgres psql -U nodedr -d nodedr_restaurant -q -v ON_ERROR_STOP=1 < deploy/vps-lockdown.sql
docker cp tests/auth-flows/auth-flows.mjs pos-isotest-backend:/repo/apps/backend/auth-flows.mjs
docker exec -w /repo/apps/backend pos-isotest-backend node auth-flows.mjs
