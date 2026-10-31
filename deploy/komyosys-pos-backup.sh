#!/bin/sh
# Nightly backup of Komyosys POS: Postgres (pg_dump custom format) + uploaded images.
# Installed at /usr/local/bin/komyosys-pos-backup, run from /etc/cron.d/komyosys-pos-backup.
# Restore steps: /opt/komyosys-pos-backups/RESTORE.txt
set -eu

DIR=/opt/komyosys-pos-backups
KEEP_DAYS=14
TS=$(date +%F_%H%M)

umask 077
mkdir -p "$DIR"

# Write to a temp name first so a failed run never leaves a truncated "good" file.
docker exec nodedr-restaurant-postgres pg_dump -U nodedr -Fc nodedr_restaurant > "$DIR/db_$TS.dump.part"
# Refuse to keep a dump that pg_restore can't read.
docker exec -i nodedr-restaurant-postgres pg_restore --list < "$DIR/db_$TS.dump.part" > /dev/null
mv "$DIR/db_$TS.dump.part" "$DIR/db_$TS.dump"

docker exec nodedr-restaurant-backend tar czf - -C /data/uploads . > "$DIR/uploads_$TS.tar.gz.part"
mv "$DIR/uploads_$TS.tar.gz.part" "$DIR/uploads_$TS.tar.gz"

find "$DIR" -maxdepth 1 -type f \( -name 'db_*.dump' -o -name 'uploads_*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
find "$DIR" -maxdepth 1 -type f -name '*.part' -mtime +1 -delete

echo "$(date -Is) ok db_$TS.dump $(du -h "$DIR/db_$TS.dump" | cut -f1)"

# Off-site copy to Cloudflare R2, only once the key file exists (root-only, 600).
R2_ENV=/etc/komyosys-pos-backup/r2.env
if [ -f "$R2_ENV" ]; then
  . "$R2_ENV"
  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
    RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
    RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    RCLONE_CONFIG_R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
  # Bucket-scoped tokens can't list/create buckets, hence --s3-no-check-bucket.
  rclone copy "$DIR" "r2:$R2_BUCKET/pos" --s3-no-check-bucket \
    --include "db_$TS.dump" --include "uploads_$TS.tar.gz"
  rclone delete "r2:$R2_BUCKET/pos" --s3-no-check-bucket --min-age "${R2_KEEP_DAYS:-30}d"
  echo "$(date -Is) ok r2 copy -> $R2_BUCKET/pos (keeping ${R2_KEEP_DAYS:-30} days)"
fi
