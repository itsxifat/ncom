#!/usr/bin/env bash
#
# Ship the current working tree to the VPS and release it.
# Run from the repo root on your workstation:  ./deploy/deploy.sh
#
# rsync rather than git, because this repo has no remote. Everything git ignores
# stays local — notably .env.local, which must never reach the server and would
# otherwise shadow .env.production.
set -euo pipefail

HOST="${HOST:-root@72.60.104.105}"
APP_DIR=/srv/ncom
APP_USER=ncom

log() { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }

[[ -f package.json ]] || { echo "Run from the repo root."; exit 1; }

log "Syncing source to ${HOST}:${APP_DIR}"
rsync -az --delete \
  --filter=':- .gitignore' \
  --exclude '.git' \
  --exclude '.env*' \
  --exclude 'node_modules' \
  --exclude '.next' \
  ./ "${HOST}:${APP_DIR}/"

log "Installing, migrating, building, restarting"
ssh "$HOST" bash -euo pipefail <<REMOTE
cd ${APP_DIR}
chown -R ${APP_USER}:${APP_USER} ${APP_DIR}

# Datastores first: a migration against a database that is not up yet fails in a
# way that looks like a schema problem.
docker compose --env-file .env.production -f deploy/docker-compose.prod.yml up -d
until docker compose -f deploy/docker-compose.prod.yml exec -T postgres pg_isready -U ncom >/dev/null 2>&1; do
  sleep 1
done

set -a; . ${APP_DIR}/.env.production; set +a

sudo -u ${APP_USER} --preserve-env pnpm install --frozen-lockfile
sudo -u ${APP_USER} --preserve-env pnpm exec prisma migrate deploy
sudo -u ${APP_USER} --preserve-env pnpm build

systemctl restart ncom
systemctl reload caddy || systemctl restart caddy
REMOTE

log "Health check"
sleep 3
ssh "$HOST" 'curl -fsS -o /dev/null -w "app on 127.0.0.1:3000 -> HTTP %{http_code}\n" http://127.0.0.1:3000/ || echo "app not responding — journalctl -u ncom -n 50"'

log "Released."
