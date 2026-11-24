#!/usr/bin/env bash
set -euo pipefail

RED=$'\e[31m'; YELLOW=$'\e[33m'; GREEN=$'\e[32m'; BLUE=$'\e[34m'; CYAN=$'\e[36m'; RESET=$'\e[0m'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER=notes
DATA_DIR="$ROOT/data"
DEST_BASE=/array/backup
KEEP=7
DO_STOP=true
# Gitignored files the repo cannot restore - they must travel in the backup.
SECRET_FILES=(.env)

usage() {
    cat <<EOF
${BLUE}Notes backup${RESET}

Copies the data/ notes folder (plus .env if present) to a timestamped dir on the
array, so the service can be rehydrated after an OS-drive rebuild. Notes has no
dump command, so the container is stopped during the copy for a consistent set.

Usage: bin/backup.sh [options]

Options:
  --dest DIR      Base backup dir           (default: $DEST_BASE)
  --keep N        Keep the N newest backups (default: $KEEP; 0 = keep all)
  --no-stop       Do NOT stop the container (risks an inconsistent copy)
  -h, --help      Show this help
EOF
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --dest) DEST_BASE=$2; shift 2 ;;
        --keep) KEEP=$2; shift 2 ;;
        --no-stop) DO_STOP=false; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "${RED}Unknown option: $1${RESET}"; usage; exit 1 ;;
    esac
done

docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER" || { echo "${RED}Container '$CONTAINER' not found.${RESET}"; exit 1; }
[[ -d "$DATA_DIR" ]] || { echo "${RED}Source dir not found: $DATA_DIR${RESET}"; exit 1; }

DATETIME="$(date +%Y-%b-%d-%I-%p)"
DEST="$DEST_BASE/notes-$DATETIME"
n=2
while [[ -e "$DEST" ]]; do
    DEST="$DEST_BASE/notes-$DATETIME-$n"
    n=$((n + 1))
done

echo "${BLUE}Backing up Notes${RESET}"
echo "${CYAN}Source: $DATA_DIR${RESET}"
echo "${CYAN}Destination: $DEST${RESET}"
mkdir -p "$DEST"

WAS_RUNNING=false
if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    WAS_RUNNING=true
fi

# Always bring the container back, even if the copy fails part way.
restart() {
    if [[ "$DO_STOP" == true && "$WAS_RUNNING" == true ]]; then
        echo "${CYAN}Restarting container...${RESET}"
        docker start "$CONTAINER" >/dev/null
    fi
}
trap restart EXIT

if [[ "$DO_STOP" == true && "$WAS_RUNNING" == true ]]; then
    echo "${CYAN}Stopping container for a consistent copy...${RESET}"
    docker stop "$CONTAINER" >/dev/null
elif [[ "$DO_STOP" == false ]]; then
    echo "${YELLOW}--no-stop set: copying live data stores, which may be inconsistent.${RESET}"
fi

echo "${CYAN}Copying notes...${RESET}"
cp -a "$DATA_DIR" "$DEST/data"

restart
trap - EXIT

echo "${CYAN}Copying secret files...${RESET}"
mkdir -p "$DEST/secrets"
for f in "${SECRET_FILES[@]}"; do
    if [[ -f "$ROOT/$f" ]]; then
        cp -a "$ROOT/$f" "$DEST/secrets/$f"
        echo "  saved $f"
    else
        echo "${YELLOW}  $f not present - skipped${RESET}"
    fi
done

SIZE="$(du -sh "$DEST" | cut -f1)"
echo "${GREEN}Backup complete: $DEST ($SIZE)${RESET}"

if [[ "$KEEP" -gt 0 ]]; then
    mapfile -t OLD < <(ls -1dt "$DEST_BASE"/notes-* 2>/dev/null | tail -n +$((KEEP + 1)))
    if [[ ${#OLD[@]} -gt 0 ]]; then
        echo "${CYAN}Pruning ${#OLD[@]} old backup(s) beyond --keep $KEEP...${RESET}"
        for d in "${OLD[@]}"; do
            echo "  removing $d"
            rm -rf "$d"
        done
    fi
fi

echo "${GREEN}Done.${RESET}"
echo "${CYAN}Test this backup with: bin/restore.sh $DEST  (isolated, does not touch the live instance)${RESET}"
