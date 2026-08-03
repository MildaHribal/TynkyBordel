#!/usr/bin/env bash
#
# Nightly backup: Postgres dump + uploaded product images.
#
# Run from the project root (where docker-compose.prod.yml lives):
#   ./scripts/backup.sh
#
# Install as cron — see DEPLOY.md. Backups older than RETENTION_DAYS are pruned.
#
# ⚠️  Copy the resulting files OFF this machine (rclone, scp, object storage…).
#     A backup that shares a disk with the database doesn't survive a disk failure.

set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"

cd "$(dirname "$0")/.."

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "✗ $COMPOSE_FILE not found — run this from the project root." >&2
  exit 1
fi

# Credentials come from the same env file the stack uses.
POSTGRES_USER="$(grep -E '^POSTGRES_USER=' .env.production 2>/dev/null | cut -d= -f2- || true)"
POSTGRES_DB="$(grep -E '^POSTGRES_DB=' .env.production 2>/dev/null | cut -d= -f2- || true)"
POSTGRES_USER="${POSTGRES_USER:-shopik}"
POSTGRES_DB="${POSTGRES_DB:-shopik}"

mkdir -p "$BACKUP_DIR"

echo "→ Dumping database ($POSTGRES_DB) ..."
# --clean --if-exists makes the dump restorable over an existing database.
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump --clean --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"
echo "  ✓ $BACKUP_DIR/db-$STAMP.sql.gz ($(du -h "$BACKUP_DIR/db-$STAMP.sql.gz" | cut -f1))"

echo "→ Archiving uploaded images ..."
# The volume name is <project>_uploads; the project defaults to the directory name.
UPLOADS_VOLUME="$(docker volume ls --format '{{.Name}}' | grep -E '_uploads$' | head -n1)"
if [ -z "$UPLOADS_VOLUME" ]; then
  echo "  ! no *_uploads volume found — skipping image backup." >&2
else
  docker run --rm \
    -v "$UPLOADS_VOLUME":/data:ro \
    -v "$(pwd)/$BACKUP_DIR":/backup \
    alpine tar czf "/backup/uploads-$STAMP.tar.gz" -C /data .
  echo "  ✓ $BACKUP_DIR/uploads-$STAMP.tar.gz ($(du -h "$BACKUP_DIR/uploads-$STAMP.tar.gz" | cut -f1))"
fi

echo "→ Pruning backups older than $RETENTION_DAYS days ..."
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.sql.gz' -o -name 'uploads-*.tar.gz' \) \
  -mtime +"$RETENTION_DAYS" -print -delete

echo "✔ Backup complete: $STAMP"
