#!/usr/bin/env bash
# Explicit Staging file-mode preparation. No replacement or SQL activation.
set -euo pipefail

name=vp-hosted-text-worker
secret_dir=/run/vp-worker-secrets
profile_file=/etc/visepanda/hosted-profile.json
journal_dir=/var/lib/vp-worker/journal
fail() { echo "hosted file worker: $*" >&2; exit 1; }
usage() { echo "usage: $0 preflight [--planning|--qa]|start <12-40 hex git SHA> [--planning|--qa]|status|stop" >&2; exit 2; }
[[ ${EUID} -eq 0 ]] || fail 'run as root'
[[ $# -ge 1 ]] || usage
action=$1
planning=false
qa=false
case "$action" in
  status|stop) [[ $# -eq 1 ]] || usage ;;
  preflight) [[ $# -eq 1 || ( $# -eq 2 && ( $2 == --planning || $2 == --qa ) ) ]] || usage
    if [[ $# -eq 2 ]]; then [[ $2 == --planning ]] && planning=true || qa=true; fi ;;
  start) [[ ( $# -eq 2 || ( $# -eq 3 && ( $3 == --planning || $3 == --qa ) ) ) && $2 =~ ^[0-9a-f]{12,40}$ ]] || usage
    if [[ $# -eq 3 ]]; then [[ $3 == --planning ]] && planning=true || qa=true; fi ;;
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
secret_files=(db.key qwen.key)
# Independent QA must never inspect or mount the legacy root DB key.
if $qa; then secret_files=(qwen.key); fi
if $planning; then
  profile_file=/etc/visepanda/planning/hosted-profile.json
  target_file=/etc/visepanda/planning/planning-target.json
  [[ -d /etc/visepanda/planning && ! -L /etc/visepanda/planning ]] || fail 'planning package directory is missing'
  [[ $(stat -c '%u:%g:%a' /etc/visepanda/planning) == 0:0:700 ]] || fail 'planning package directory must be root:root mode 0700'
  secret_files+=(amap.key)
fi
for file in "${secret_files[@]}"; do
  path="$secret_dir/$file"
  [[ -f $path && ! -L $path ]] || fail "private $file is missing"
  [[ $(findmnt -T "$path" -no FSTYPE) == tmpfs ]] || fail "$file must reside on tmpfs"
  [[ $(stat -c '%u:%g:%a:%h' "$path") == 1000:1000:400:1 ]] || fail "$file must be uid/gid 1000 mode 0400 with one link"
  bytes=$(stat -c %s "$path")
  (( bytes >= 1 && bytes <= 4096 )) || fail "$file size is invalid"
done
[[ -f $profile_file && ! -L $profile_file ]] || fail 'nonsecret profile is missing'
[[ $(stat -c '%u:%g:%a:%h' "$profile_file") == 0:0:600:1 ]] || fail 'profile must be root:root mode 0600'
bytes=$(stat -c %s "$profile_file")
(( bytes >= 2 && bytes <= 16384 )) || fail 'profile size is invalid'
extra_env=()
if $planning; then
  [[ -f $target_file && ! -L $target_file ]] || fail 'planning target is missing'
  [[ $(stat -c '%u:%g:%a:%h' "$target_file") == 0:0:600:1 ]] || fail 'planning target must be root:root mode 0600 with one link'
  bytes=$(stat -c %s "$target_file")
  (( bytes >= 2 && bytes <= 4096 )) || fail 'planning target size is invalid'
  command -v node >/dev/null || fail 'Node 22 is required to validate the runtime profile'
  checker="$(dirname "$0")/validate-planning-profile.mjs"
  if [[ $action == start ]]; then
    validated=$(node --experimental-strip-types --disable-warning=ExperimentalWarning "$checker" "$profile_file" "$target_file" "$2" --emit) || fail 'planning package is unavailable'
    profile_json=${validated%%$'\n'*}
    endpoint=${validated#*$'\n'}
    extra_env=(--env VISEPANDA_HOSTED_PLANNING_WORKER=true --env "VISEPANDA_QWEN_ENDPOINT=$endpoint")
  else
    node --experimental-strip-types --disable-warning=ExperimentalWarning "$checker" "$profile_file" "$target_file" || fail 'planning package is unavailable'
  fi
else
  command -v python3 >/dev/null || fail 'Python 3 is required to validate nonsecret profile'
  if $qa; then
    profile_json=$(python3 "$(dirname "$0")/validate-qa-profile.py" "$profile_file" --emit) || fail 'QA profile is unavailable'
    target_file=/etc/visepanda/qa/qa-target.json
    [[ -d /etc/visepanda/qa && ! -L /etc/visepanda/qa ]] || fail 'QA package directory is missing'
    [[ $(stat -c '%u:%g:%a' /etc/visepanda/qa) == 0:0:700 ]] || fail 'QA package directory must be root:root mode 0700'
    [[ -f $target_file && ! -L $target_file ]] || fail 'QA target is missing'
    [[ $(stat -c '%u:%g:%a:%h' "$target_file") == 0:0:600:1 ]] || fail 'QA target must be root:root mode 0600 with one link'
    bytes=$(stat -c %s "$target_file")
    (( bytes >= 2 && bytes <= 4096 )) || fail 'QA target size is invalid'
    # Read only the nonsecret build selector before the full canonical check.
    # preflight has no build argument; start must still match the target build.
    qa_selection=$(python3 - "$target_file" <<'PYBUILD'
import json, re, sys
try:
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError()
            result[key] = value
        return result
    with open(sys.argv[1], encoding="utf-8") as source:
        target = json.load(source, object_pairs_hook=pairs)
    build, project_ref = target["build"], target["projectRef"]
    if not isinstance(project_ref, str) or not re.fullmatch(r"[a-z0-9]{20}", project_ref) or project_ref == "dzqdzetcctkhbrhlxxgn":
        raise ValueError()
    if not isinstance(build, str) or not re.fullmatch(r"[0-9a-f]{12,40}", build):
        raise ValueError()
    print(build + "\n" + project_ref)
except (OSError, ValueError, TypeError, KeyError):
    sys.exit(1)
PYBUILD
    ) || fail 'QA target build is unavailable'
    qa_build=${qa_selection%%$'\n'*}
    qa_project_ref=${qa_selection#*$'\n'}
    [[ $action != start || $qa_build == "$2" ]] || fail 'QA target build does not match start'
    # Resolve once: both validation and worker creation consume this same local
    # immutable image ID. Never pull a tag or execute a host-supplied validator.
    qa_image=$(docker image inspect --format '{{.Id}}' "vp-hosted-text-worker:$qa_build") || fail 'QA image is not loaded locally'
    [[ $qa_image =~ ^sha256:[0-9a-f]{64}$ ]] || fail 'QA image identity is unavailable'
    validated=$(docker run --rm --pull=never \
      --name "vp-qa-validator-$$-$RANDOM" --network none --restart no \
      --read-only --user 0:0 --cap-drop ALL --security-opt no-new-privileges \
      --ulimit core=0:0 --memory 256m --pids-limit 32 --log-driver none \
      --mount "type=bind,src=$profile_file,dst=/qa/profile.json,readonly" \
      --mount "type=bind,src=$target_file,dst=/qa/target.json,readonly" \
      --entrypoint /usr/local/bin/node "$qa_image" \
      --experimental-strip-types --disable-warning=ExperimentalWarning \
      /app/deploy/hosted-worker/validate-qa-target.mjs \
      /qa/profile.json /qa/target.json "$qa_build" --emit-runtime) || fail 'QA package is unavailable'
    qa_secret_dir="$secret_dir/qa-$qa_project_ref"
    [[ -d $qa_secret_dir && ! -L $qa_secret_dir ]] || fail 'independent QA secret directory is missing'
    [[ $(findmnt -T "$qa_secret_dir" -no FSTYPE) == tmpfs ]] || fail 'QA secret directory must be tmpfs'
    [[ $(stat -c '%u:%g:%a' "$qa_secret_dir") == 1000:1000:700 ]] || fail 'QA secret directory must be uid/gid 1000 mode 0700'
    qa_db_file="$qa_secret_dir/db.key"
    [[ -f $qa_db_file && ! -L $qa_db_file ]] || fail 'independent QA DB key file is missing'
    [[ $(findmnt -T "$qa_db_file" -no FSTYPE) == tmpfs ]] || fail 'QA DB key file must reside on tmpfs'
    [[ $(stat -c '%u:%g:%a:%h' "$qa_db_file") == 1000:1000:400:1 ]] || fail 'QA DB key file must be uid/gid 1000 mode 0400 with one link'
    bytes=$(stat -c %s "$qa_db_file")
    (( bytes >= 1 && bytes <= 4096 )) || fail 'QA DB key file size is invalid'
    if [[ $action == start ]]; then
      profile_json=${validated%%$'\n'*}
      endpoint=${validated#*$'\n'}
      extra_env=(--env "VISEPANDA_QWEN_ENDPOINT=$endpoint" --env "VISEPANDA_QA_SUPABASE_PROJECT_REF=$qa_project_ref")
    fi
  else
    profile_json=$(python3 "$(dirname "$0")/validate-s1-profile.py" "$profile_file" --emit) || fail 'S1 profile is unavailable'
  fi
fi
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
if $qa; then image=$qa_image; fi
docker image inspect "$image" >/dev/null || fail 'image tag is not loaded locally'
secret_mounts=(--mount "type=bind,src=$secret_dir,dst=/run/vp-worker-secrets,readonly")
if $qa; then
  secret_mounts=(--tmpfs /run/vp-worker-secrets:rw,noexec,nosuid,nodev,size=64k,mode=0700,uid=1000,gid=1000
    --mount "type=bind,src=$qa_db_file,dst=/run/vp-worker-secrets/db.key,readonly"
    --mount "type=bind,src=$secret_dir/qwen.key,dst=/run/vp-worker-secrets/qwen.key,readonly")
fi
# The profile and flags are nonsecret. Docker receives only /run bind paths,
# never key values or an env-file. A host reboot clears /run; no auto-restart.
docker create --name "$name" \
  --restart no --stop-timeout 75 --ulimit core=0:0 \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  --memory 768m --pids-limit 128 \
  --log-opt max-size=10m --log-opt max-file=3 \
  --env VISEPANDA_HOSTED_TEXT_WORKER=true \
  --env VISEPANDA_HOSTED_WORKER_SECRET_MODE=files \
  --env VISEPANDA_HOSTED_WORKER_PROFILE="$profile_json" \
  "${extra_env[@]}" \
  --env VISEPANDA_HOSTED_WORKER_BUILD="$2" \
  --env VISEPANDA_HOSTED_WORKER_JOURNAL_DIR=/var/lib/vp-worker/journal \
  --env VISEPANDA_HOSTED_WORKER_HEALTH_PORT=8765 \
  --env VISEPANDA_HOSTED_WORKER_HEALTH_HOST=127.0.0.1 \
  "${secret_mounts[@]}" \
  --mount "type=bind,src=$journal_dir,dst=/var/lib/vp-worker/journal" \
  --health-interval 30s --health-timeout 5s --health-start-period 90s \
  --health-cmd 'node -e "fetch(\"http://127.0.0.1:8765/healthz\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"' \
  "$image" >/dev/null
docker start "$name" >/dev/null || fail 'container did not start; keep SQL disabled and inspect before cleanup'
echo "hosted file worker: started $image without restart policy; verify SQL-disabled heartbeat before any claim"
