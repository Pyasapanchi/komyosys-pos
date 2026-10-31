-- Komyosys POS hosted-instance lockdown (pos.komyosys.ai).
--
-- Upstream OrderRestro is single-tenant per server: its backup feature dumps and
-- restores the WHOLE database, and every self-signup Owner gets `backup.manage`.
-- On a shared multi-restaurant host that lets any tenant download or overwrite
-- every other tenant's data. Backups here are done by the server's own nightly
-- job instead (/usr/local/bin/komyosys-pos-backup), so nobody gets this permission.
--
-- Idempotent. Apply with:
--   docker exec -i nodedr-restaurant-postgres psql -U nodedr -d nodedr_restaurant -v ON_ERROR_STOP=1 < deploy/vps-lockdown.sql

BEGIN;

DELETE FROM role_permissions
WHERE "permissionId" IN (SELECT id FROM permissions WHERE key = 'backup.manage');

CREATE OR REPLACE FUNCTION komyosys_block_backup_permission() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM permissions WHERE id = NEW."permissionId" AND key = 'backup.manage') THEN
    RETURN NULL; -- silently skip, so signup and role edits still succeed without it
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS komyosys_block_backup_permission ON role_permissions;
CREATE TRIGGER komyosys_block_backup_permission
  BEFORE INSERT OR UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION komyosys_block_backup_permission();

COMMIT;
