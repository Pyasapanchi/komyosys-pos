// Tenant-isolation test, phase 1 (runs inside the throwaway pos-isotest-backend container).
// Registers restaurants A and B through the real API, then inserts one A_MARK row into
// every table, wired through foreign keys to A's restaurant/branch/user.
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const API = 'http://localhost:4000/api/v1';
const db = new PrismaClient();
const ip = () => `10.${Math.random() * 250 | 0}.${Math.random() * 250 | 0}.${Math.random() * 250 | 0}`;

async function register(tag) {
  const email = `${tag.toLowerCase()}-${randomBytes(3).toString('hex')}@isotest.local`;
  const password = `Pw-${randomBytes(9).toString('hex')}`;
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip() },
    body: JSON.stringify({ restaurantName: `${tag}_MARK Restaurant`, branchName: `${tag}_MARK Branch`, ownerName: `${tag}_MARK Owner`, email, password }),
  });
  if (!res.ok) throw new Error(`register ${tag}: ${res.status} ${await res.text()}`);
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const user = await db.user.findFirst({ where: { email }, include: { restaurant: { include: { branches: true } } } });
  return { email, password, cookie, userId: user.id, restaurantId: user.restaurantId, branchId: user.restaurant.branches[0].id };
}

const A = await register('A');
const B = await register('B');

// ---- Generic seeder -------------------------------------------------------
const SKIP = new Set(['_prisma_migrations', 'permissions', 'sync_state', 'sync_changes', 'backup_config', 'backups']);
const q = (sql, ...p) => db.$queryRawUnsafe(sql, ...p);

const tables = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`))
  .map((r) => r.table_name).filter((t) => !SKIP.has(t));
const cols = await q(`
  SELECT c.table_name, c.column_name, c.is_nullable, c.column_default, c.data_type, c.udt_name,
         (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname=c.udt_name) AS enum_labels
  FROM information_schema.columns c WHERE c.table_schema='public'`);
const fks = await q(`
  SELECT cl.relname AS tbl, a.attname AS col, rcl.relname AS ref
  FROM pg_constraint k JOIN pg_class cl ON cl.oid=k.conrelid JOIN pg_class rcl ON rcl.oid=k.confrelid
  JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1]
  WHERE k.contype='f' AND cl.relnamespace='public'::regnamespace AND array_length(k.conkey,1)=1`);

const colsOf = (t) => cols.filter((c) => c.table_name === t);
const fkOf = (t, c) => fks.find((f) => f.tbl === t && f.col === c)?.ref;
const aIds = { restaurants: A.restaurantId, branches: A.branchId, users: A.userId };

function value(t, c) {
  const ref = fkOf(t, c.column_name);
  if (ref) return aIds[ref] ?? undefined; // undefined = dependency not ready yet
  if (c.enum_labels) return c.enum_labels[0];
  switch (c.data_type) {
    case 'text': case 'character varying': return c.column_name === 'id' ? `A_MARK_${t}` : `A_MARK ${t}.${c.column_name}`;
    case 'integer': case 'bigint': case 'smallint': case 'numeric': case 'double precision': case 'real': return 1;
    case 'boolean': return false;
    case 'timestamp without time zone': case 'timestamp with time zone': return new Date();
    case 'date': return new Date();
    case 'jsonb': case 'json': return { mark: 'A_MARK' };
    case 'ARRAY': return [];
    case 'bytea': return 'A_MARK';
    case 'uuid': return '00000000-0000-4000-8000-' + randomBytes(6).toString('hex');
    default: return `A_MARK ${c.column_name}`;
  }
}

// Signup already links the owner to their branch.
const done = new Set(['restaurants', 'branches', 'users', 'user_branches']);
const failures = {};
for (let pass = 0; pass < 8; pass++) {
  for (const t of tables) {
    if (done.has(t)) continue;
    const row = {};
    let ready = true;
    for (const c of colsOf(t)) {
      const ref = fkOf(t, c.column_name);
      const required = c.is_nullable === 'NO' && c.column_default === null;
      if (!required && !ref) continue;
      const v = value(t, c);
      if (v === undefined) { if (required) { ready = false; break; } continue; }
      row[c.column_name] = v;
    }
    if (!ready) continue;
    const keys = Object.keys(row);
    const casts = keys.map((k, i) => {
      const c = colsOf(t).find((x) => x.column_name === k);
      const ty = c.data_type === 'USER-DEFINED' ? `"${c.udt_name}"` : c.data_type === 'ARRAY' ? `${c.udt_name.slice(1)}[]` : c.data_type === 'jsonb' ? 'jsonb' : null;
      if (c.data_type === 'bytea') return `convert_to($${i + 1}::text, 'UTF8')`;
      return ty ? `$${i + 1}::${ty}` : `$${i + 1}`;
    });
    const vals = keys.map((k) => (row[k] && typeof row[k] === 'object' && !(row[k] instanceof Date) && !Array.isArray(row[k]) ? JSON.stringify(row[k]) : row[k]));
    try {
      const sql = keys.length
        ? `INSERT INTO "${t}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${casts.join(',')}) RETURNING *`
        : `INSERT INTO "${t}" DEFAULT VALUES RETURNING *`;
      const [r] = await q(sql, ...vals);
      aIds[t] = r.id ?? Object.values(r)[0];
      done.add(t);
      delete failures[t];
    } catch (e) {
      failures[t] = String(e.message).split('\n').slice(-2).join(' ').slice(0, 200);
    }
  }
}

writeFileSync('/tmp/isotest-state.json', JSON.stringify({ A, B, aIds }, null, 2));
console.log(`A=${A.restaurantId} B=${B.restaurantId}`);
console.log(`seeded A rows in ${Object.keys(aIds).length}/${tables.length + 3} tables`);
console.log('not seeded:', JSON.stringify(failures, null, 1));
await db.$disconnect();
