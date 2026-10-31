-- Komyosys POS hosted-instance lockdown (pos.komyosys.ai).
--
-- Upstream OrderRestro is single-tenant per server, so a few features act on the
-- WHOLE database rather than one restaurant. On a shared multi-restaurant host
-- with open signup, any tenant could use them to read or overwrite every other
-- tenant's data:
--   * Backups (backup.manage): dump/restore/export the entire database.
--   * Server Sync (settings.manage, Settings > Server Sync): pushes every
--     restaurant's changes to an arbitrary URL and applies changes pulled back.
--   * System updates (system.update): instance-wide container updates.
-- Backups here are done by the server's nightly job instead
-- (/usr/local/bin/komyosys-pos-backup). Traefik also 403s these API paths.
--
-- Idempotent. Apply with:
--   docker exec -i nodedr-restaurant-postgres psql -U nodedr -d nodedr_restaurant -v ON_ERROR_STOP=1 < deploy/vps-lockdown.sql

BEGIN;

-- 1. Instance-wide permissions: never granted to any role, including new signups.
DELETE FROM role_permissions
WHERE "permissionId" IN (SELECT id FROM permissions WHERE key IN ('backup.manage', 'system.update'));

CREATE OR REPLACE FUNCTION komyosys_block_backup_permission() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM permissions
    WHERE id = NEW."permissionId" AND key IN ('backup.manage', 'system.update')
  ) THEN
    RETURN NULL; -- silently skip, so signup and role edits still succeed without it
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS komyosys_block_backup_permission ON role_permissions;
CREATE TRIGGER komyosys_block_backup_permission
  BEFORE INSERT OR UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION komyosys_block_backup_permission();

-- 2. Server Sync: pin the single sync_state row to "disabled client, no peer".
UPDATE sync_state SET enabled = false, role = 'client', "serverUrl" = NULL, "apiKey" = NULL WHERE id = 1;
DELETE FROM sync_changes;

CREATE OR REPLACE FUNCTION komyosys_block_sync() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.enabled := false;
  NEW.role := 'client';
  NEW."serverUrl" := NULL;
  NEW."apiKey" := NULL;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS komyosys_block_sync ON sync_state;
CREATE TRIGGER komyosys_block_sync
  BEFORE INSERT OR UPDATE ON sync_state
  FOR EACH ROW EXECUTE FUNCTION komyosys_block_sync();

COMMIT;
