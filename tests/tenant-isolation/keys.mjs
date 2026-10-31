// Tenant-isolation test, phase 3: B's API keys (MCP staff key, website integration key)
// and the unauthenticated QR/kiosk links, all pointed at restaurant A.
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { INTEGRATION_SCOPES } from '@nodedr-restaurant/types';

const { A, B, aIds } = JSON.parse(readFileSync('/tmp/isotest-state.json', 'utf8'));
const db = new PrismaClient();
const API = 'http://localhost:4000/api/v1';
const ip = () => `10.${Math.random() * 250 | 0}.${Math.random() * 250 | 0}.${Math.random() * 250 | 0}`;
const out = { readLeaks: [], suspicious: [] };

async function call(method, path, { auth, cookie, body } = {}) {
  const headers = { 'X-Forwarded-For': ip(), Accept: 'application/json, text/event-stream' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  if (cookie) headers.Cookie = cookie;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (res.ok && text.includes('A_MARK ')) out.readLeaks.push(`${method} ${path} ${body ? JSON.stringify(body).slice(0, 120) : ''} -> ${text.slice(text.indexOf('A_MARK ') - 60, text.indexOf('A_MARK ') + 60)}`);
  return { status: res.status, text };
}

// B's own menu item, so "B's item at A's table" can be tried.
const bCat = await db.menuCategory.create({ data: { branchId: B.branchId, name: 'B cat' } });
const bItem = await db.menuItem.create({ data: { branchId: B.branchId, categoryId: bCat.id, name: 'B item', price: 5 } });

// ---- MCP with B's personal key --------------------------------------------
const sk = JSON.parse((await call('POST', '/staff-api-keys', { cookie: B.cookie, body: { name: 'b-mcp' } })).text);
const staffKey = sk.key ?? sk.rawKey ?? sk.token ?? sk.apiKey;
const rpc = async (id, method, params) => {
  const r = await call('POST', '/mcp', { auth: staffKey, body: { jsonrpc: '2.0', id, method, params } });
  const line = r.text.split('\n').find((l) => l.startsWith('data:'));
  return line ? JSON.parse(line.slice(5)) : JSON.parse(r.text || '{}');
};
await rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'isotest', version: '0' } });
const tools = (await rpc(2, 'tools/list', {})).result?.tools ?? [];
const idFor = (name) => {
  const base = name.replace(/Ids?$/, '').replace(/([A-Z])/g, '_$1').toLowerCase();
  const t = Object.keys(aIds).find((k) => k === `${base}s` || k === `${base}es` || k.endsWith(`${base}s`) || k === base.replace(/y$/, 'ies'));
  return aIds[t] ?? aIds.orders;
};
let mcpCalls = 0; let mcpOk = 0;
for (const tool of tools) {
  const props = tool.inputSchema?.properties ?? {};
  for (const variant of ['A-branch', 'B-branch']) {
    const args = {};
    for (const [k, s] of Object.entries(props)) {
      if (k === 'branchId') args[k] = variant === 'A-branch' ? A.branchId : B.branchId;
      else if (/Ids$/.test(k)) args[k] = [idFor(k)];
      else if (/Id$|^id$/.test(k)) args[k] = idFor(k === 'id' ? tool.name.split('_').pop() : k);
      else if (s.type === 'number' || s.type === 'integer') args[k] = 1;
      else if (s.type === 'boolean') args[k] = false;
      else if (s.type === 'array') args[k] = k === 'items' ? [{ menuItemId: aIds.menu_items, quantity: 1 }] : [];
      else if (s.enum) args[k] = s.enum[0];
      else args[k] = 'B_ATTACK';
    }
    mcpCalls++;
    const r = await rpc(100 + mcpCalls, 'tools/call', { name: tool.name, arguments: args });
    const text = JSON.stringify(r);
    if (text.includes('A_MARK ')) out.readLeaks.push(`MCP ${tool.name} ${variant}: ${text.slice(text.indexOf('A_MARK ') - 60, text.indexOf('A_MARK ') + 60)}`);
    if (r.result && !r.result.isError) { mcpOk++; out.suspicious.push(`MCP ok ${tool.name} ${variant}: ${text.slice(0, 160)}`); }
  }
}

// ---- Website integration key scoped to B's branch -------------------------
const ik = JSON.parse((await call('POST', '/integration-api-keys', { cookie: B.cookie, body: { name: 'b-web', branchId: B.branchId, scopes: INTEGRATION_SCOPES.map((s) => (typeof s === 'string' ? s : s.key ?? s.value ?? s.id)) } })).text);
const intKey = ik.token;
if (!intKey) console.log('integration key create failed:', JSON.stringify(ik).slice(0, 300));
const own = await call('GET', `/integrations/locations/${B.branchId}/menu`, { auth: intKey });
console.log(`sanity: B key on B's own menu -> ${own.status}`);
const intChecks = [
  ['GET', `/integrations/locations/${A.branchId}/menu`],
  ['GET', `/integrations/locations/${A.branchId}/delivery-quote`],
  ['POST', `/integrations/locations/${A.branchId}/orders`, { type: 'TAKEAWAY', items: [{ menuItemId: aIds.menu_items, quantity: 1 }], customer: { name: 'x', phone: '1' } }],
  ['POST', `/integrations/locations/${B.branchId}/orders`, { type: 'TAKEAWAY', items: [{ menuItemId: aIds.menu_items, quantity: 1 }], customer: { name: 'x', phone: '1' } }],
  ['GET', `/integrations/locations/${B.branchId}/orders/${aIds.orders}`],
  ['GET', `/integrations/locations/${A.branchId}/orders/${aIds.orders}`],
  ['POST', `/integrations/locations/${A.branchId}/reservations`, { customerName: 'x', phone: '1', guestCount: 2, reservedAt: new Date(Date.now() + 864e5).toISOString() }],
  ['GET', `/integrations/locations/${B.branchId}/reservations/${aIds.reservations}`],
];
const intRes = [];
for (const [m, p, body] of intChecks) {
  const r = await call(m, p, { auth: intKey, body, headers: {} });
  intRes.push(`${r.status} ${m} ${p.replace(A.branchId, '<A-branch>').replace(B.branchId, '<B-branch>').replace(/A_MARK_\w+/, '<A-id>')}`);
  if (r.status < 300) out.suspicious.push(`integration ${r.status} ${m} ${p}: ${r.text.slice(0, 160)}`);
}

// ---- Public QR / kiosk with A's tokens ------------------------------------
// A fresh A table with no open bill, so the order isn't refused for unrelated reasons.
const seeded = await db.table.findFirst({ where: { id: aIds.tables } });
const aTable = await db.table.create({ data: { floorId: seeded.floorId, number: `QR${Date.now() % 100000}`, capacity: 2, qrToken: `qr-a-${Date.now()}` } });
const pub = [];
for (const [m, p, body] of [
  ['POST', `/public/menu/${aTable?.qrToken}/order`, { guestName: 'x', items: [{ menuItemId: bItem.id, quantity: 1 }] }],
  ['POST', `/public/menu/${aTable?.qrToken}/order`, { guestName: 'x', items: [{ menuItemId: aIds.menu_items, quantity: 1, modifierIds: [] }] }],
  ['POST', `/public/menu/${aTable?.qrToken}/request`, { type: 'WAITER' }],
]) {
  const r = await call(m, p, { body });
  pub.push(`${r.status} ${m} ${p.replace(aTable?.qrToken ?? '', '<A-qr>')} -> ${r.text.slice(0, 120)}`);
}
const mixed = await db.orderItem.findFirst({ where: { menuItemId: bItem.id, order: { branchId: A.branchId } } });

console.log(`MCP: ${tools.length} tools, ${mcpCalls} calls, ${mcpOk} succeeded (see suspicious)`);
console.log('Integration key results:\n  ' + intRes.join('\n  '));
console.log('Public QR results:\n  ' + pub.join('\n  '));
console.log(`B's menu item ended up in an A order: ${mixed ? 'YES (leak)' : 'no'}`);
console.log(`READ LEAKS: ${out.readLeaks.length}`); for (const l of out.readLeaks) console.log('  ' + l);
console.log(`SUSPICIOUS (2xx, review): ${out.suspicious.length}`); for (const l of out.suspicious) console.log('  ' + l.slice(0, 220));
await db.$disconnect();
