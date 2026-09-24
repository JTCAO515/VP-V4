#!/usr/bin/env bash
# First synthetic Staging smoke only. No replacement, database or provider action.
set -euo pipefail

name=vp-hosted-text-worker
secret_dir=/run/vp-worker-secrets
profile_file=/etc/visepanda/hosted-profile.json
journal_dir=/var/lib/vp-worker/journal
fail() { echo "hosted file worker: $*" >&2; exit 1; }
usage() { echo "usage: $0 preflight|start <12-40 hex git SHA>|status|stop" >&2; exit 2; }
[[ ${EUID} -eq 0 ]] || fail 'run as root'
[[ $# -ge 1 ]] || usage
action=$1
case "$action" in
  preflight|status|stop) [[ $# -eq 1 ]] || usage ;;
  start) [[ $# -eq 2 && $2 =~ ^[0-9a-f]{12,40}$ ]] || usage ;;
  *) usage ;;
esac

if [[ $action == status ]]; then
  docker inspect --format 'image={{.Config.Image}} state={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name"
  exit
fi
if [[ $action == stop ]]; then
  docker stop --time 75 "$name"
  exit
fi

command -v docker >/dev/null || fail 'Docker Engine is required'
docker info >/dev/null || fail 'Docker daemon is unavailable'
[[ $(findmnt -T "$secret_dir" -no FSTYPE) == tmpfs ]] || fail 'secret directory must be tmpfs'
[[ -d $secret_dir && ! -L $secret_dir ]] || fail 'private tmpfs directory is missing'
[[ $(stat -c '%u:%g:%a' "$secret_dir") == 1000:1000:700 ]] || fail 'secret directory must be uid/gid 1000 mode 0700'
[[ -z $(swapon --show --noheadings) ]] || fail 'swap must be disabled'
for file in db.key qwen.key; do
  path="$secret_dir/$file"
  [[ -f $path && ! -L $path ]] || fail "private $file is missing"
  [[ $(findmnt -T "$path" -no FSTYPE) == tmpfs ]] || fail "$file must reside on tmpfs"
  [[ $(stat -c '%u:%g:%a:%h' "$path") == 1000:1000:400:1 ]] || fail "$file must be uid/gid 1000 mode 0400 with one link"
  bytes=$(stat -c %s "$path")
  (( bytes >= 1 && bytes <= 4096 )) || fail "$file size is invalid"
done
[[ -f $profile_file && ! -L $profile_file ]] || fail 'nonsecret profile is missing'
[[ $(stat -c '%u:%g:%a' "$profile_file") == 0:0:600 ]] || fail 'profile must be root:root mode 0600'
bytes=$(stat -c %s "$profile_file")
(( bytes >= 2 && bytes <= 16384 )) || fail 'profile size is invalid'
command -v python3 >/dev/null || fail 'Python 3 is required to validate nonsecret profile'
python3 "$(dirname "$0")/validate-s1-profile.py" "$profile_file" || fail 'S1 profile is unavailable'
[[ ! -L $journal_dir ]] || fail 'journal directory must not be a symlink'
install -d -o 1000 -g 1000 -m 0700 "$journal_dir"
[[ $(stat -c '%u:%g:%a' "$journal_dir") == 1000:1000:700 ]] || fail 'journal directory must be uid/gid 1000 mode 0700'
for container in "$name" "${name}-candidate" "${name}-previous"; do
  docker container inspect "$container" >/dev/null 2>&1 && fail 'existing worker container requires separate reviewed replacement'
done

if [[ $action == preflight ]]; then
  echo 'hosted file worker: private tmpfs/profile/journal and empty container state verified; SQL switch must be checked separately'
  exit
fi

image="vp-hosted-text-worker:$2"
docker image inspect "$image" >/dev/null || fail 'image tag is not loaded locally'
# The profile and flags are nonsecret. Docker receives only /run bind paths,
# never key values or an env-file. A host reboot clears /run; no auto-restart.
docker create --name "$name" \
  --restart no --stop-timeout 75 --ulimit core=0:0 \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --memory 768m --pids-limit 128 \
  --log-opt max-size=10m --log-opt max-file=3 \
  --env VISEPANDA_HOSTED_TEXT_WORKER=true \
  --env VISEPANDA_HOSTED_WORKER_SECRET_MODE=files \
  --env VISEPANDA_HOSTED_WORKER_PROFILE="$(cat "$profile_file")" \
  --env VISEPANDA_HOSTED_WORKER_BUILD="$2" \
  --env VISEPANDA_HOSTED_WORKER_JOURNAL_DIR=/var/lib/vp-worker/journal \
  --env VISEPANDA_HOSTED_WORKER_HEALTH_PORT=8765 \
  --env VISEPANDA_HOSTED_WORKER_HEALTH_HOST=127.0.0.1 \
  --mount "type=bind,src=$secret_dir,dst=/run/vp-worker-secrets,readonly" \
  --mount "type=bind,src=$journal_dir,dst=/var/lib/vp-worker/journal" \
  --health-interval 30s --health-timeout 5s --health-start-period 90s \
  --health-cmd 'node -e "fetch(\"http://127.0.0.1:8765/healthz\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"' \
  "$image" >/dev/null
docker start "$name" >/dev/null || fail 'container did not start; keep SQL disabled and inspect before cleanup'
echo "hosted file worker: started $image without restart policy; verify SQL-disabled heartbeat before any claim"
