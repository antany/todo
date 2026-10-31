#!/usr/bin/env bash
# Dump the todo database from the running pod to a folder on the host, keeping the newest N days.
#   BACKUP_DIR   target folder (default ~/backups/todo); point it at a share/mount if you like
#   KEEP_DAYS    delete dumps older than this (default 14)
#   CONTAINER    postgres container name (default todo-postgres)
# Restore: gunzip -c todo_<stamp>.sql.gz | podman exec -i todo-postgres psql -U todo todo
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/todo}"
KEEP_DAYS="${KEEP_DAYS:-14}"
CONTAINER="${CONTAINER:-todo-postgres}"

# cron has no login session; rootless podman needs this to find its runtime dir.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"

mkdir -p "$BACKUP_DIR"
stamp="$(date +%Y-%m-%d_%H%M%S)"
tmp="$BACKUP_DIR/.todo_$stamp.sql.gz.part"
out="$BACKUP_DIR/todo_$stamp.sql.gz"

# Write to a .part file first so a failed dump never leaves a truncated backup behind.
trap 'rm -f "$tmp"' EXIT
podman exec "$CONTAINER" pg_dump -U todo --no-owner todo | gzip > "$tmp"

# gzip of an empty dump is ~20 bytes; anything real is larger. Also confirm the archive is intact.
[ "$(stat -c %s "$tmp")" -gt 200 ] || { echo "backup is suspiciously small, keeping nothing" >&2; exit 1; }
gzip -t "$tmp"
mv "$tmp" "$out"
trap - EXIT

find "$BACKUP_DIR" -maxdepth 1 -name 'todo_*.sql.gz' -mtime "+$KEEP_DAYS" -delete
echo "backup written: $out"
