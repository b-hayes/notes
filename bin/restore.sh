#!/usr/bin/env bash
set -euo pipefail

RED=$'\e[31m'; YELLOW=$'\e[33m'; GREEN=$'\e[32m'; BLUE=$'\e[34m'; CYAN=$'\e[36m'; RESET=$'\e[0m'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER=notes
DATA_DIR="$ROOT/data"
TEST_CONTAINER=notes-restoretest
TEST_DIR="$ROOT/dist/restoretest"
TEST_PORT=13000
MODE=test
ASSUME_YES=false
HEALTH_TIMEOUT=120

usage() {
    cat <<EOF
${BLUE}Notes restore${RESET}

Restores a backup made by bin/backup.sh. Two modes:

  ${GREEN}test${RESET} (default) - SAFE. Copies the backup into a throwaway dir, starts a
       throwaway Notes from the same image on port $TEST_PORT, verifies it serves
       every restored note, then tears it down. The live instance is NEVER touched.

  ${YELLOW}--into-live${RESET} - DISASTER RECOVERY ONLY. Stops the container, moves the
       current data/ and .env aside (not deleted), copies the backup in, starts the
       container and verifies it serves the restored notes.
       If anything fails it ROLLS BACK to the moved-aside state automatically.

The backup copies are owned by the host user and the container runs as root, so no root is needed.

Usage: bin/restore.sh [options] <backup-dir>

  <backup-dir>   A notes-<datetime> folder from backup.sh (must contain data/).

Options:
  --into-live    Restore over the live instance instead of the isolated test.
  --yes          Skip the confirmation prompt (for automation)
  -h, --help     Show this help
EOF
}

fail() { echo "${RED}ERROR: $*${RESET}" >&2; exit 1; }

BACKUP_DIR=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --into-live) MODE=live; shift ;;
        --yes) ASSUME_YES=true; shift ;;
        -h|--help) usage; exit 0 ;;
        -*) echo "${RED}Unknown option: $1${RESET}"; usage; exit 1 ;;
        *) BACKUP_DIR=${1%/}; shift ;;
    esac
done

# --- Pre-flight validation (do all checks BEFORE touching anything) ---
[[ -n "$BACKUP_DIR" ]] || { echo "${RED}No backup dir given.${RESET}"; usage; exit 1; }
command -v docker >/dev/null || fail "docker not found on PATH."
docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER" || fail "Container '$CONTAINER' not found - deploy it (docker compose up -d) before restoring."

[[ -d "$BACKUP_DIR" ]] || fail "Backup dir '$BACKUP_DIR' does not exist."
# Structural integrity: these must exist in a real backup, or the restore is junk.
[[ -d "$BACKUP_DIR/data" ]] || fail "'$BACKUP_DIR/data' missing - not a valid backup."
BACKUP_NOTES="$(find "$BACKUP_DIR/data" -type f -name '*.md' | wc -l)"
[[ "$BACKUP_NOTES" -gt 0 ]] || fail "'$BACKUP_DIR/data' has no .md notes - not a valid backup."
echo "${GREEN}Backup validated:${RESET} $BACKUP_DIR ($BACKUP_NOTES notes)"

# The note count the app's own /api/structure reports proves it loaded the restored data.
wait_serving() {
    local target=$1 base=$2 elapsed=0 status served=""
    while [[ $elapsed -lt $HEALTH_TIMEOUT ]]; do
        status="$(docker inspect --format '{{.State.Status}}' "$target")"
        [[ "$status" == "exited" || "$status" == "dead" ]] && fail "Container '$target' is '$status' after restore - see 'docker logs $target'."
        served="$(curl -sf "$base/api/structure" | grep -o '"type":"file"' | wc -l)" && [[ "$served" -gt 0 ]] && break
        sleep 3; elapsed=$((elapsed + 3))
    done
    [[ "$served" -ge "$BACKUP_NOTES" ]] || fail "$base/api/structure lists $served notes, backup has $BACKUP_NOTES."
    echo "${GREEN}'$target' serves all $served notes.${RESET}"
}

if [[ "$MODE" == test ]]; then
    IMAGE="$(docker inspect --format '{{.Image}}' "$CONTAINER")" || fail "Cannot read image from live container '$CONTAINER'."
    echo "${BLUE}Isolated restore test${RESET} (image: $(docker inspect --format '{{.Config.Image}}' "$CONTAINER"))"
    echo "${CYAN}The live instance will NOT be touched.${RESET}"

    teardown() {
        docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
        rm -rf "$TEST_DIR"
    }
    trap teardown EXIT
    teardown  # clear any leftovers from a previous run

    echo "${CYAN}Copying the backup into $TEST_DIR...${RESET}"
    mkdir -p "$TEST_DIR"
    cp -a "$BACKUP_DIR/data" "$TEST_DIR/data"

    echo "${CYAN}Starting throwaway Notes on port $TEST_PORT...${RESET}"
    docker run -d --name "$TEST_CONTAINER" \
        -p "127.0.0.1:$TEST_PORT:3000" \
        -v "$TEST_DIR/data:/app/data" \
        -v "$ROOT/public:/app/public:ro" \
        -v "$ROOT/server.js:/app/server.js:ro" \
        -v "$ROOT/lib:/app/lib:ro" \
        "$IMAGE" >/dev/null

    wait_serving "$TEST_CONTAINER" "http://127.0.0.1:$TEST_PORT"

    echo "${GREEN}Restore test PASSED.${RESET} The backup restores into a clean instance with its data intact."
    echo "${CYAN}Tearing down throwaway container + dir...${RESET}"
    exit 0
fi

# --- MODE=live : disaster recovery over the running instance ---
PARTS=("$DATA_DIR")

echo "${YELLOW}This will REPLACE $DATA_DIR${RESET}"
[[ -f "$BACKUP_DIR/secrets/.env" ]] && echo "${YELLOW}...and REPLACE $ROOT/.env${RESET}"
echo "${YELLOW}Everything written since this backup will be lost.${RESET}"
if [[ "$ASSUME_YES" != true ]]; then
    read -r -p "Type 'restore' to proceed: " ANS
    [[ "$ANS" == "restore" ]] || { echo "${CYAN}Aborted - nothing changed.${RESET}"; exit 0; }
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
RESTORE_OK=false
MOVED=false

rollback() {
    echo "${YELLOW}Rolling back to pre-restore state...${RESET}" >&2
    docker stop "$CONTAINER" >/dev/null 2>&1 || true
    for p in "${PARTS[@]}" "$ROOT/.env"; do
        [[ -e "$p.pre-restore-$STAMP" ]] || continue
        rm -rf "$p"
        mv "$p.pre-restore-$STAMP" "$p"
    done
    docker start "$CONTAINER" >/dev/null 2>&1 || true
    echo "${YELLOW}Rolled back. Original data is live again.${RESET}" >&2
}

cleanup() {
    if [[ "$RESTORE_OK" != true && "$MOVED" == true ]]; then
        rollback
        echo "${RED}Restore FAILED and was rolled back. Nothing lost.${RESET}" >&2
    fi
}
trap cleanup EXIT

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "${CYAN}Stopping container...${RESET}"
    docker stop "$CONTAINER" >/dev/null
fi

echo "${CYAN}Moving current data and .env aside (kept for rollback)...${RESET}"
MOVED=true
for p in "${PARTS[@]}"; do
    [[ -e "$p" ]] && mv "$p" "$p.pre-restore-$STAMP"
done
[[ -f "$BACKUP_DIR/secrets/.env" && -f "$ROOT/.env" ]] && mv "$ROOT/.env" "$ROOT/.env.pre-restore-$STAMP"

echo "${CYAN}Copying backup into place...${RESET}"
cp -a "$BACKUP_DIR/data" "$DATA_DIR"
[[ -f "$BACKUP_DIR/secrets/.env" ]] && cp -a "$BACKUP_DIR/secrets/.env" "$ROOT/.env"

echo "${CYAN}Starting container...${RESET}"
docker start "$CONTAINER" >/dev/null

echo "${CYAN}Waiting for it to serve the restored notes (up to ${HEALTH_TIMEOUT}s)...${RESET}"
LIVE_URL="http://127.0.0.1:$(docker port "$CONTAINER" 3000/tcp | head -n 1 | awk -F: '{print $NF}')"
wait_serving "$CONTAINER" "$LIVE_URL"

RESTORE_OK=true
echo "${GREEN}Restore complete and Notes is up.${RESET}"
echo "${CYAN}Pre-restore copies kept at:${RESET}"
for p in "${PARTS[@]}" "$ROOT/.env"; do
    [[ -e "$p.pre-restore-$STAMP" ]] && echo "  $p.pre-restore-$STAMP"
done
echo "${YELLOW}VERIFY before trusting this restore:${RESET}"
echo "${CYAN}  - API serves:  curl -s -o /dev/null -w '%{http_code}\\n' $LIVE_URL/api/structure  (expect 200)${RESET}"
echo "${CYAN}  - Open $LIVE_URL in a browser, open a recent note and confirm its content is the latest you remember.${RESET}"
if [[ ! -f /etc/cron.d/notes-backup ]]; then
    echo "${YELLOW}  - Backup cron is NOT installed - the schedule is stopped. Reinstall: sed s/__USER__/\$USER/ $ROOT/deploy/notes-backup | sudo tee /etc/cron.d/notes-backup${RESET}"
fi
echo "${CYAN}Only once verified, delete the pre-restore copies above.${RESET}"
