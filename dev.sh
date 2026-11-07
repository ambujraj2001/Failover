#!/usr/bin/env bash
# Failover dev runner.
#
#   ./dev.sh            start everything (database, API, web) and stream logs; Ctrl+C stops API + web
#   ./dev.sh stop       stop API, web and the database container
#   ./dev.sh status     show what is running
#   ./dev.sh reset-db   wipe the local database volume and start fresh
#
# Anything already listening on the API or web port is stopped first, so it is always safe to re-run.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
LOG_DIR="$ROOT/.dev/logs"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"
DB_PORT=5433
DB_CONTAINER="failover-db-1"
PIDFILE="$ROOT/.dev/dev.pid"

if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; BLU=$'\033[34m'; MAG=$'\033[35m'; RST=$'\033[0m'
else
  B=""; DIM=""; RED=""; GRN=""; YEL=""; BLU=""; MAG=""; RST=""
fi

info() { printf "%s▸%s %s\n" "$BLU" "$RST" "$*"; }
ok()   { printf "%s✓%s %s\n" "$GRN" "$RST" "$*"; }
warn() { printf "%s!%s %s\n" "$YEL" "$RST" "$*"; }
die()  { printf "%s✗ %s%s\n" "$RED" "$*" "$RST" >&2; exit 1; }

# ---- helpers ----------------------------------------------------------------------------------

pids_on_port() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | sort -u; }

free_port() {
  local port=$1 name=$2 pids
  pids=$(pids_on_port "$port")
  [ -z "$pids" ] && return 0
  warn "Port $port ($name) is in use by: $(echo "$pids" | xargs -I{} ps -o comm= -p {} 2>/dev/null | xargs basename 2>/dev/null | tr '\n' ' ')— stopping it"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null
  for _ in $(seq 1 20); do
    [ -z "$(pids_on_port "$port")" ] && { ok "Port $port is free"; return 0; }
    sleep 0.25
  done
  # shellcheck disable=SC2086
  kill -9 $(pids_on_port "$port") 2>/dev/null
  sleep 0.5
  [ -z "$(pids_on_port "$port")" ] || die "Could not free port $port. Close the program using it and try again."
  ok "Port $port is free (force-stopped)"
}

wait_http() {
  local url=$1 name=$2 tries=${3:-60} log=$4
  for _ in $(seq 1 "$tries"); do
    if curl -fsS -o /dev/null --max-time 2 "$url" 2>/dev/null; then return 0; fi
    if [ -n "${5:-}" ] && ! kill -0 "$5" 2>/dev/null; then
      printf "%s✗ %s exited during startup. Last log lines:%s\n" "$RED" "$name" "$RST" >&2
      tail -n 25 "$log" >&2
      return 1
    fi
    sleep 1
  done
  printf "%s✗ %s did not become ready at %s. Last log lines:%s\n" "$RED" "$name" "$url" "$RST" >&2
  tail -n 25 "$log" >&2
  return 1
}

kill_tree() {
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null
}

stop_previous_runner() {
  [ -f "$PIDFILE" ] || return 0
  local old
  old=$(cat "$PIDFILE" 2>/dev/null)
  if [ -n "$old" ] && [ "$old" != "$$" ] && kill -0 "$old" 2>/dev/null && ps -p "$old" -o command= | grep -q "dev.sh"; then
    warn "Another ./dev.sh is running (pid $old) — stopping it"
    kill -TERM "$old" 2>/dev/null
    for _ in $(seq 1 40); do kill -0 "$old" 2>/dev/null || break; sleep 0.25; done
    kill -0 "$old" 2>/dev/null && kill -9 "$old" 2>/dev/null
  fi
  rm -f "$PIDFILE"
}

need() { command -v "$1" >/dev/null 2>&1 || die "$1 is not installed. $2"; }

load_deepseek_key() {
  [ -n "${DEEPSEEK_API_KEY:-}" ] && return 0
  local line
  for f in "$HOME/.zshrc" "$HOME/.zprofile" "$HOME/.bashrc" "$HOME/.bash_profile"; do
    [ -f "$f" ] || continue
    line=$(grep -E '^[[:space:]]*export[[:space:]]+DEEPSEEK_API_KEY=' "$f" | tail -n 1)
    if [ -n "$line" ]; then
      eval "$line"
      export DEEPSEEK_API_KEY
      return 0
    fi
  done
  return 1
}

ensure_docker() {
  need docker "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  if docker info >/dev/null 2>&1; then return 0; fi
  if [ "$(uname)" = "Darwin" ]; then
    info "Docker is not running — starting Docker Desktop"
    open -a Docker 2>/dev/null || die "Could not start Docker Desktop. Open it manually and re-run."
  else
    die "The Docker daemon is not running. Start it (e.g. 'sudo systemctl start docker') and re-run."
  fi
  for i in $(seq 1 90); do
    docker info >/dev/null 2>&1 && { ok "Docker is up"; return 0; }
    [ $((i % 10)) -eq 0 ] && info "Still waiting for Docker… (${i}s)"
    sleep 1
  done
  die "Docker did not start within 90 s."
}

start_db() {
  ensure_docker
  # Port 5433 taken by something that is not our container?
  local owner
  owner=$(docker ps --filter "publish=$DB_PORT" --format '{{.Names}}' 2>/dev/null | head -n1)
  if [ -n "$owner" ] && [ "$owner" != "$DB_CONTAINER" ]; then
    warn "Container '$owner' is using port $DB_PORT — stopping it"
    docker stop "$owner" >/dev/null
  elif [ -z "$owner" ] && [ -n "$(pids_on_port $DB_PORT)" ]; then
    free_port "$DB_PORT" "database"
  fi
  info "Starting PostgreSQL (port $DB_PORT)"
  (cd "$ROOT" && docker compose up -d db >/dev/null 2>"$LOG_DIR/db.log") || { cat "$LOG_DIR/db.log" >&2; die "Could not start the database container."; }
  for i in $(seq 1 60); do
    if [ "$(docker inspect -f '{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null)" = "healthy" ]; then
      ok "PostgreSQL is ready"
      return 0
    fi
    [ $((i % 10)) -eq 0 ] && info "Waiting for PostgreSQL… (${i}s)"
    sleep 1
  done
  docker logs --tail 20 "$DB_CONTAINER" >&2
  die "PostgreSQL did not become healthy."
}

setup_backend() {
  need uv "Install it: curl -LsSf https://astral.sh/uv/install.sh | sh"
  if [ ! -f "$BACKEND/.env" ]; then
    info "Creating backend/.env from .env.example"
    cp "$BACKEND/.env.example" "$BACKEND/.env"
    local secret
    secret=$(python3 -c 'import secrets;print(secrets.token_urlsafe(48))' 2>/dev/null || openssl rand -base64 48 | tr -d '\n/+=')
    sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$secret|" "$BACKEND/.env" && rm -f "$BACKEND/.env.bak"
  fi
  info "Syncing Python dependencies"
  (cd "$BACKEND" && uv sync --quiet) || die "uv sync failed."
  info "Applying database migrations"
  (cd "$BACKEND" && uv run --quiet alembic upgrade head >"$LOG_DIR/migrate.log" 2>&1) || { tail -n 20 "$LOG_DIR/migrate.log" >&2; die "Migrations failed."; }
  ok "Backend ready"
}

setup_frontend() {
  need node "Install Node 20+: https://nodejs.org"
  need npm "npm ships with Node."
  local major
  major=$(node -p 'process.versions.node.split(".")[0]')
  [ "$major" -ge 20 ] || die "Node $major found; Node 20 or newer is required."
  if [ ! -d "$FRONTEND/node_modules" ] || [ "$FRONTEND/package-lock.json" -nt "$FRONTEND/node_modules/.package-lock.json" ]; then
    info "Installing frontend dependencies"
    (cd "$FRONTEND" && npm install --no-fund --no-audit --loglevel=error) || die "npm install failed."
  fi
  ok "Frontend ready"
}

stop_apps() {
  stop_previous_runner
  free_port "$API_PORT" "API"
  free_port "$WEB_PORT" "web"
}

status() {
  printf "%sFailover status%s\n" "$B" "$RST"
  local db
  db=$(docker inspect -f '{{.State.Status}}' "$DB_CONTAINER" 2>/dev/null)
  if [ "$db" = "running" ]; then
    printf "  database  %srunning%s  localhost:%s (%s)\n" "$GRN" "$RST" "$DB_PORT" \
      "$(docker inspect -f '{{.State.Health.Status}}' "$DB_CONTAINER" 2>/dev/null)"
  else printf "  database  stopped\n"; fi
  if curl -fsS --max-time 2 "http://127.0.0.1:$API_PORT/api/v1/health" >/dev/null 2>&1; then
    printf "  api       %srunning%s  http://localhost:%s\n" "$GRN" "$RST" "$API_PORT"
  else printf "  api       stopped\n"; fi
  if curl -fsS --max-time 2 "http://localhost:$WEB_PORT" >/dev/null 2>&1; then
    printf "  web       %srunning%s  http://localhost:%s\n" "$GRN" "$RST" "$WEB_PORT"
  else printf "  web       stopped\n"; fi
}

# ---- commands ---------------------------------------------------------------------------------

mkdir -p "$LOG_DIR"
cmd="${1:-start}"

case "$cmd" in
  stop)
    stop_apps
    if docker info >/dev/null 2>&1; then
      (cd "$ROOT" && docker compose stop db >/dev/null 2>&1) && ok "Database stopped"
    fi
    exit 0
    ;;
  status)
    status
    exit 0
    ;;
  reset-db)
    ensure_docker
    printf "%sThis deletes every account and all progress in the local database.%s Type 'yes' to continue: " "$YEL" "$RST"
    read -r answer
    [ "$answer" = "yes" ] || { info "Cancelled."; exit 0; }
    stop_apps
    (cd "$ROOT" && docker compose down -v >/dev/null 2>&1)
    ok "Database volume removed. Run ./dev.sh to start fresh."
    exit 0
    ;;
  start) ;;
  -h|--help|help)
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    die "Unknown command '$cmd'. Use: ./dev.sh [start|stop|status|reset-db]"
    ;;
esac

need curl "Install curl."
need lsof "Install lsof."
printf "\n%sFailover%s · local development\n\n" "$B" "$RST"

stop_apps
start_db
setup_backend
setup_frontend

if load_deepseek_key; then ok "DeepSeek key found — AI features enabled"
else warn "DEEPSEEK_API_KEY not set — the app runs, AI features will show as unavailable"; fi

: >"$LOG_DIR/api.log"
: >"$LOG_DIR/web.log"

info "Starting API on :$API_PORT"
(cd "$BACKEND" && exec uv run uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT" --reload) >>"$LOG_DIR/api.log" 2>&1 &
API_PID=$!
disown "$API_PID" 2>/dev/null

info "Starting web on :$WEB_PORT"
(cd "$FRONTEND" && exec npx vite --port "$WEB_PORT" --strictPort) >>"$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!
disown "$WEB_PID" 2>/dev/null

cleanup() {
  trap - INT TERM EXIT
  printf "\n"
  info "Stopping API and web…"
  # only this runner's own processes: never touch ports another run may now own
  kill_tree "$API_PID"
  kill_tree "$WEB_PID"
  [ -n "${TAIL_PID:-}" ] && kill_tree "$TAIL_PID"
  pkill -P $$ 2>/dev/null
  for _ in $(seq 1 20); do
    kill -0 "$API_PID" 2>/dev/null || kill -0 "$WEB_PID" 2>/dev/null || break
    sleep 0.25
  done
  [ "$(cat "$PIDFILE" 2>/dev/null)" = "$$" ] && rm -f "$PIDFILE"
  ok "Stopped. The database keeps running (./dev.sh stop to stop it too)."
  exit 0
}
trap cleanup INT TERM EXIT
echo $$ >"$PIDFILE"

wait_http "http://127.0.0.1:$API_PORT/api/v1/health" "API" 90 "$LOG_DIR/api.log" "$API_PID" || exit 1
ok "API ready"
wait_http "http://localhost:$WEB_PORT" "Web" 60 "$LOG_DIR/web.log" "$WEB_PID" || exit 1
ok "Web ready"

printf "\n  %sApp%s       http://localhost:%s\n" "$B" "$RST" "$WEB_PORT"
printf "  %sAPI docs%s  http://localhost:%s/docs\n" "$B" "$RST" "$API_PORT"
printf "  %sLogs%s      %s\n" "$B" "$RST" "${LOG_DIR#"$ROOT"/}"
printf "\n  %sCtrl+C to stop.%s\n\n" "$DIM" "$RST"

# stream both logs with coloured prefixes
tail -n 0 -F "$LOG_DIR/api.log" "$LOG_DIR/web.log" 2>/dev/null | awk -v a="${MAG}api${RST}" -v w="${BLU}web${RST}" '
  /^==> .*api.log <==$/ { p=a; next }
  /^==> .*web.log <==$/ { p=w; next }
  /^$/ { next }
  { printf "%s │ %s\n", p, $0; fflush() }' &
TAIL_PID=$!
disown "$TAIL_PID" 2>/dev/null

# exit (and clean up) if either server dies
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do sleep 2; done
if ! kill -0 "$API_PID" 2>/dev/null; then warn "The API stopped unexpectedly. See .dev/logs/api.log"; fi
if ! kill -0 "$WEB_PID" 2>/dev/null; then warn "The web server stopped unexpectedly. See .dev/logs/web.log"; fi
cleanup
