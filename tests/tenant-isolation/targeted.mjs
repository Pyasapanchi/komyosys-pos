// Tenant-isolation test, phase 4: well-formed create/update requests from B that
// reference A's records (table, customer, menu item, role, branch). Every one must fail.
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const { A, B, aIds } = JSON.parse(readFileSync('/tmp/isotest-state.json', 'utf8'));
const db = new PrismaClient();
const API = 'http://localhost:4000/api/v1';
const ip = () => `10.${Math.random() * 250 | 0}.${Math.random() * 250 | 0}.${Math.random() * 250 | 0}`;
async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Cookie: B.cookie, 'X-Forwarded-For': ip(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, text: await res.text() };
}

const bItem = await db.menuItem.findFirst({ where: { branchId: B.branchId } });
const aOwnerRole = await db.role.findFirst({ where: { restaurantId: A.restaurantId, name: 'OWNER' } });
const bWaiterRole = await db.role.findFirst({ where: { restaurantId: B.restaurantId, name: 'WAITER' } });
const bq = `?branchId=${B.branchId}`;
const future = new Date(Date.now() + 2 * 864e5).toISOString();
const item = (id) => [{ menuItemId: id, quantity: 1, modifierIds: [] }];

const own = await call('POST', `/orders${bq}`, { type: 'TAKEAWAY', items: item(bItem.id) });
const bOrderId = JSON.parse(own.text).id;
const wl = JSON.parse((await call('POST', `/waitlist${bq}`, { customerName: 'w', partySize: 2 })).text);
const bUser = await db.user.findFirst({ where: { restaurantId: B.restaurantId } });

const cases = [
  ['sanity: B order with B item (should succeed)', 'POST', `/orders${bq}`, { type: 'TAKEAWAY', items: item(bItem.id) }, true],
  ['order on A\'s table', 'POST', `/orders${bq}`, { type: 'DINE_IN', tableId: aIds.tables, items: item(bItem.id) }],
  ['order for A\'s customer', 'POST', `/orders${bq}`, { type: 'TAKEAWAY', customerId: aIds.customers, items: item(bItem.id) }],
  ['order with A\'s menu item', 'POST', `/orders${bq}`, { type: 'TAKEAWAY', items: item(aIds.menu_items) }],
  ['add A\'s menu item to B order', 'POST', `/orders/${bOrderId}/items${bq}`, { items: item(aIds.menu_items) }],
  ['reservation on A\'s table', 'POST', `/reservations${bq}`, { customerName: 'r', guestCount: 2, reservedAt: future, tableId: aIds.tables }],
  ['seat B waitlist at A\'s table', 'POST', `/waitlist/${wl.id}/seat${bq}`, { tableId: aIds.tables }],
  ['gift card for A\'s customer', 'POST', `/gift-cards${bq}`, { initialValue: 10, customerId: aIds.customers }],
  ['new staff with A\'s OWNER role', 'POST', '/users', { name: 's', password: 'Password123!', roleId: aOwnerRole.id, branchIds: [B.branchId] }],
  ['new staff assigned to A\'s branch', 'POST', '/users', { name: 's2', password: 'Password123!', roleId: bWaiterRole.id, branchIds: [A.branchId] }],
  ['move own user to A\'s OWNER role', 'PATCH', `/users/${bUser.id}`, { roleId: aOwnerRole.id }],
  ['edit A\'s OWNER role permissions', 'PATCH', `/roles/${aOwnerRole.id}`, { permissionKeys: ['menu.view'] }],
];

let failures = 0;
for (const [label, m, p, body, expectOk] of cases) {
  const r = await call(m, p, body);
  const ok = r.status < 300;
  const bad = expectOk ? !ok : ok;
  if (bad) failures++;
  console.log(`${bad ? 'LEAK ' : 'ok   '} ${r.status} ${label}${bad ? ' -> ' + r.text.slice(0, 140) : ''}`);
}
// Belt and braces: nothing of B's may now point at A's rows.
const crossLinks = await db.$queryRawUnsafe(`
  SELECT 'orders' t, count(*)::int n FROM orders WHERE "branchId"=$1 AND ("tableId"=$2 OR "customerId"=$3)
  UNION ALL SELECT 'order_items', count(*)::int FROM order_items oi JOIN orders o ON o.id=oi."orderId" WHERE o."branchId"=$1 AND oi."menuItemId"=$4
  UNION ALL SELECT 'reservations', count(*)::int FROM reservations WHERE "branchId"=$1 AND "tableId"=$2
  UNION ALL SELECT 'gift_cards', count(*)::int FROM gift_cards WHERE "branchId"=$1 AND "customerId"=$3
  UNION ALL SELECT 'users w/ A role', count(*)::int FROM users WHERE "restaurantId"=$5 AND "roleId"=$6`,
  B.branchId, aIds.tables, aIds.customers, aIds.menu_items, B.restaurantId, aOwnerRole.id);
for (const c of crossLinks) if (c.n > 0) { failures++; console.log(`LEAK  DB: ${c.n} ${c.t} rows of B point at A`); }
const roleStill = await db.rolePermission.count({ where: { roleId: aOwnerRole.id } });
console.log(`A's OWNER role still has ${roleStill} permissions`);
console.log(failures ? `FAILURES: ${failures}` : 'ALL TARGETED CHECKS PASSED');
await db.$disconnect();
