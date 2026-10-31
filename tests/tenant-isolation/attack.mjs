// Tenant-isolation test, phase 2: restaurant B attacks restaurant A through every API route.
// Read leak  = a 2xx response containing A's stored data ("A_MARK " with a space only
//              comes from stored column values, never from an echoed id "A_MARK_<table>").
// Write leak = any row belonging to / pointing at A that changed between DB snapshots.
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const { A, B, aIds } = JSON.parse(readFileSync('/tmp/isotest-state.json', 'utf8'));
const routes = readFileSync('/tmp/isotest-routes.txt', 'utf8').trim().split('\n').map((l) => l.split(' '));
const db = new PrismaClient();
const BASE = 'http://localhost:4000';
const ip = () => `10.${Math.random() * 250 | 0}.${Math.random() * 250 | 0}.${Math.random() * 250 | 0}`;

const SKIP = [/\/auth\/(logout|register|login|pin-login)$/, /\/auth\/2fa/];
const idList = [...new Set(Object.values(aIds))];

// Body that points every foreign-key-looking field at A's rows.
const fks = await db.$queryRawUnsafe(`
  SELECT DISTINCT a.attname AS col, rcl.relname AS ref FROM pg_constraint k
  JOIN pg_class rcl ON rcl.oid=k.confrelid JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1]
  WHERE k.contype='f' AND array_length(k.conkey,1)=1`);
const hostile = { name: 'B_ATTACK', restaurantId: A.restaurantId, branchId: A.branchId, toBranchId: A.branchId, fromBranchId: A.branchId };
for (const { col, ref } of fks) if (aIds[ref] && !(col in hostile)) hostile[col] = aIds[ref];
for (const t of Object.keys(aIds)) {
  const singular = t.replace(/ies$/, 'y').replace(/s$/, '').replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  hostile[`${singular}Id`] ??= aIds[t];
  hostile[`${singular}Ids`] ??= [aIds[t]];
}
hostile.items = [{ menuItemId: aIds.menu_items, quantity: 1 }];

async function snapshot() {
  const tables = (await db.$queryRawUnsafe(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name NOT IN ('_prisma_migrations','audit_logs','sync_changes','notifications')`)).map((r) => r.table_name);
  const snap = {};
  for (const t of tables) {
    const rows = await db.$queryRawUnsafe(`SELECT to_jsonb(x)::text AS j FROM "${t}" x`);
    snap[t] = rows.map((r) => r.j);
  }
  return snap;
}
const aSet = new Set([...idList, A.restaurantId, A.branchId, A.userId]);
const touchesA = (json) => json.includes('A_MARK') || [...aSet].some((id) => json.includes(`"${id}"`));

const findings = { readLeaks: [], writeCandidates: [], errors5xx: [] };
let count = 0;
async function hit(method, path, body) {
  count++;
  const headers = { Cookie: B.cookie, 'X-Forwarded-For': ip() };
  if (body) headers['Content-Type'] = 'application/json';
  try {
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const text = await res.text();
    if (res.status >= 500) findings.errors5xx.push(`${res.status} ${method} ${path}`);
    if (res.ok && text.includes('A_MARK ')) findings.readLeaks.push({ method, path, status: res.status, sample: text.slice(Math.max(0, text.indexOf('A_MARK ') - 80), text.indexOf('A_MARK ') + 80) });
    else if (res.ok && method !== 'GET') findings.writeCandidates.push(`${res.status} ${method} ${path}`);
  } catch (e) {
    findings.errors5xx.push(`ERR ${method} ${path} ${e.message}`);
  }
}

function variants(path) {
  const params = path.match(/:[A-Za-z]+/g);
  const q = path.includes('?') ? '&' : '?';
  if (!params) return [path, `${path}${q}branchId=${A.branchId}`];
  return idList.map((id) => path.replace(/:[A-Za-z]+/g, id) + `${q}branchId=${A.branchId}`);
}

const before = await snapshot();
const order = { GET: 0, POST: 1, PUT: 1, PATCH: 1, DELETE: 2 };
const sorted = routes.filter(([, p]) => !SKIP.some((r) => r.test(p))).sort((a, b) => order[a[0]] - order[b[0]]);
for (const [method, path] of sorted) {
  for (const p of variants(path)) await hit(method, p, method === 'GET' ? null : hostile);
}
const after = await snapshot();

// Diff: any changed/removed row that belonged to A, or any new row pointing at A.
const writeLeaks = [];
for (const t of Object.keys(before)) {
  const b = new Set(before[t]); const a = new Set(after[t] ?? []);
  for (const row of before[t]) if (!a.has(row) && touchesA(row)) writeLeaks.push({ table: t, kind: 'changed-or-deleted', row: row.slice(0, 300) });
  for (const row of after[t] ?? []) if (!b.has(row) && touchesA(row)) writeLeaks.push({ table: t, kind: 'added/changed-to', row: row.slice(0, 300) });
}

const report = { requests: count, routesTested: sorted.length, readLeaks: findings.readLeaks, writeLeaks, writeCandidates: findings.writeCandidates, errors5xx: [...new Set(findings.errors5xx)] };
writeFileSync('/tmp/isotest-report.json', JSON.stringify(report, null, 2));
console.log(`requests=${count} routes=${sorted.length} readLeaks=${report.readLeaks.length} writeLeaks=${writeLeaks.length} 2xxWrites=${report.writeCandidates.length} 5xx=${report.errors5xx.length}`);
await db.$disconnect();
