#!/usr/bin/env bash
# Run on the approved Ubuntu ECS host as root. No database or provider calls here.
set -euo pipefail

name=vp-hosted-text-worker
env_file=/etc/visepanda/hosted-text-worker.env
journal_dir=/var/lib/vp-worker/journal

usage() { echo "usage: $0 preflight|status|stop|replace <12-40 hex git SHA>" >&2; exit 2; }
fail() { echo "hosted worker: $*" >&2; exit 1; }
[[ ${EUID} -eq 0 ]] || fail 'run as root'
[[ $# -ge 1 ]] || usage
action=$1

case "$action" in
  preflight|status|stop) [[ $# -eq 1 ]] || usage ;;
  replace) [[ $# -eq 2 && $2 =~ ^[0-9a-f]{12,40}$ ]] || usage ;;
  *) usage ;;
esac

if [[ $action == stop ]]; then
  docker stop --time 75 "$name"
  exit
fi
if [[ $action == status ]]; then
  docker inspect --format 'image={{.Config.Image}} state={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name"
  exit
fi

command -v docker >/dev/null || fail 'Docker Engine is required'
docker info >/dev/null || fail 'Docker daemon is unavailable'
[[ -f $env_file && ! -L $env_file ]] || fail 'private env file is missing'
[[ $(stat -c %u "$env_file") == 0 && $(stat -c %g "$env_file") == 0 && $(stat -c %a "$env_file") == 600 ]] || fail 'env file must be root:root mode 0600'
for key in VISEPANDA_HOSTED_TEXT_WORKER VISEPANDA_HOSTED_WORKER_DB_KEY VISEPANDA_HOSTED_WORKER_QWEN_KEY VISEPANDA_HOSTED_WORKER_PROFILE; do
  grep -q "^${key}=" "$env_file" || fail "missing $key in env file"
done
[[ ! -L $journal_dir ]] || fail 'journal directory must not be a symlink'
install -d -o 1000 -g 1000 -m 0700 "$journal_dir"
[[ $(stat -c %u "$journal_dir") == 1000 && $(stat -c %g "$journal_dir") == 1000 && $(stat -c %a "$journal_dir") == 700 ]] || fail 'journal directory must be uid/gid 1000 mode 0700'

if [[ $action == preflight ]]; then
  echo 'hosted worker: host prerequisites passed; no container changed'
  exit
fi

image="vp-hosted-text-worker:$2"
docker image inspect "$image" >/dev/null || fail 'image tag is not loaded locally'
candidate="${name}-candidate"
previous="${name}-previous"
docker container inspect "$candidate" >/dev/null 2>&1 && fail 'candidate container already exists; inspect it before retrying'

# No published port: Docker runs the health probe inside the container. The SQL
# stop switch remains independent and must be disabled before rollback/replacement.
docker create --name "$candidate" \
  --restart unless-stopped --stop-timeout 75 \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --memory 768m --pids-limit 128 \
  --log-opt max-size=10m --log-opt max-file=3 \
  --env-file "$env_file" \
  --env VISEPANDA_HOSTED_WORKER_BUILD="$2" \
  --env VISEPANDA_HOSTED_WORKER_JOURNAL_DIR=/var/lib/vp-worker/journal \
  --env VISEPANDA_HOSTED_WORKER_HEALTH_PORT=8765 \
  --env VISEPANDA_HOSTED_WORKER_HEALTH_HOST=127.0.0.1 \
  --mount "type=bind,src=$journal_dir,dst=/var/lib/vp-worker/journal" \
  --health-interval 30s --health-timeout 5s --health-start-period 90s \
  --health-cmd 'node -e "fetch(\"http://127.0.0.1:8765/healthz\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"' \
  "$image" >/dev/null

# Keep the stopped former container until the replacement starts successfully.
# This also preserves its image and configuration if a Docker start/rename fails.
if docker container inspect "$name" >/dev/null 2>&1; then
  docker inspect --format 'previous image={{.Config.Image}}' "$name"
  if docker container inspect "$previous" >/dev/null 2>&1; then docker rm "$previous" >/dev/null; fi
  if ! docker stop --time 75 "$name" >/dev/null || ! docker rename "$name" "$previous"; then
    docker rm "$candidate" >/dev/null
    if docker container inspect "$name" >/dev/null 2>&1; then docker start "$name" >/dev/null || true; fi
    fail 'could not stop/retain previous container'
  fi
fi
if ! docker rename "$candidate" "$name" || ! docker start "$name" >/dev/null; then
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker rm "$candidate" >/dev/null 2>&1 || true
  if docker container inspect "$previous" >/dev/null 2>&1; then
    docker rename "$previous" "$name"
    docker start "$name" >/dev/null || fail 'replacement and previous container both failed to start; keep SQL disabled'
  fi
  fail 'replacement failed; previous container restored; keep SQL disabled'
fi
echo "hosted worker: started $image; inspect health and SQL heartbeat before enabling claims"
