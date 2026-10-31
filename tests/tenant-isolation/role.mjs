// Tenant-isolation test, phase 5: can B move one of its own (non-owner) staff into A's OWNER role?
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const { A, B } = JSON.parse(readFileSync('/tmp/isotest-state.json', 'utf8'));
const db = new PrismaClient();
const call = async (method, path, body) => {
  const res = await fetch(`http://localhost:4000/api/v1${path}`, {
    method,
    headers: { Cookie: B.cookie, 'X-Forwarded-For': `10.9.${Math.random() * 250 | 0}.1`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return `${res.status} ${(await res.text()).slice(0, 120)}`;
};
const bWaiter = await db.role.findFirst({ where: { restaurantId: B.restaurantId, name: 'WAITER' } });
const aOwner = await db.role.findFirst({ where: { restaurantId: A.restaurantId, name: 'OWNER' } });
console.log('create B waiter:', await call('POST', '/users', { name: 'w1', email: `w1-${Date.now()}@isotest.local`, password: 'Password123!', roleId: bWaiter.id, branchIds: [B.branchId] }));
const waiter = await db.user.findFirst({ where: { restaurantId: B.restaurantId, roleId: bWaiter.id } });
console.log('B waiter -> A OWNER role:', await call('PATCH', `/users/${waiter.id}`, { roleId: aOwner.id }));
const after = await db.user.findUnique({ where: { id: waiter.id } });
console.log(after.roleId === aOwner.id ? 'LEAK: waiter now holds A\'s OWNER role' : 'ok: role unchanged');
await db.$disconnect();
