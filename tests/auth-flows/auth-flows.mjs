// End-to-end checks for password reset, email verification and one-account-per-email.
// Runs inside pos-isotest-backend; emails are read back from the Mailpit container.
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const API = 'http://localhost:4000/api/v1';
const MAIL = 'http://mailpit:8025/api/v1';
const db = new PrismaClient();
const ip = () => `10.${Math.random() * 250 | 0}.${Math.random() * 250 | 0}.${Math.random() * 250 | 0}`;
let failures = 0;
const check = (ok, label, extra = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ` (${extra})` : ''}`);
};

async function call(method, path, body, cookie) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip(), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const setCookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, cookie: setCookie };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function mailsTo(addr) {
  const list = await (await fetch(`${MAIL}/search?query=${encodeURIComponent(`to:"${addr}"`)}`)).json();
  return list.messages ?? [];
}
// Waits for the (already+1)th email to `addr` whose subject matches, newest first.
async function linkToken(addr, path, already = 0) {
  const subject = path === '/reset-password' ? /Reset/ : /Confirm/;
  for (let i = 0; i < 20; i++) {
    const msgs = (await mailsTo(addr)).filter((m) => subject.test(m.Subject));
    if (msgs.length > already) {
      const full = await (await fetch(`${MAIL}/message/${msgs[0].ID}`)).json();
      const m = full.Text.match(new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`));
      return { token: m?.[1], subject: full.Subject, count: msgs.length, html: full.HTML };
    }
    await sleep(500);
  }
  return { token: undefined, count: already };
}

const tag = randomBytes(3).toString('hex');
const email = `owner-${tag}@isotest.local`;
const pw1 = `First-${tag}-pw`;
const pw2 = `Second-${tag}-pw`;

// 1. Signup sends a verification email; the link verifies.
const reg = await call('POST', '/auth/register', { restaurantName: `Flow ${tag}`, branchName: 'Main', ownerName: 'Ayesha', email, password: pw1 });
check(reg.status === 201, 'signup works', `status ${reg.status}`);
check(reg.json?.user?.emailVerified === false, 'new owner starts unverified');
const v = await linkToken(email, '/verify-email');
check(!!v.token, 'verification email arrives with a link', v.subject);
check(v.html?.includes('Komyosys POS') && v.html?.includes('#C23F02'), 'email is Komyosys-branded');
check((await call('POST', '/auth/verify-email', { token: v.token })).status === 201, 'verification link accepted');
check((await call('GET', '/auth/me', null, reg.cookie)).json?.user?.emailVerified === true, 'owner now verified');
check((await call('POST', '/auth/verify-email', { token: v.token })).status === 400, 'verification link works only once');

// 2. Forgot password: same answer for unknown emails, emails only real accounts.
const oldSession = (await call('POST', '/auth/login', { email, password: pw1 })).cookie;
const unknown = `nobody-${tag}@isotest.local`;
const fu = await call('POST', '/auth/forgot-password', { email: unknown });
const fk = await call('POST', '/auth/forgot-password', { email: email.toUpperCase() });
check(fu.status === fk.status && JSON.stringify(fu.json) === JSON.stringify(fk.json), 'unknown and known emails get identical replies', `${fu.status}/${fk.status}`);
const r = await linkToken(email, '/reset-password');
check(!!r.token, 'reset email arrives (email matched case-insensitively)', r.subject);
await sleep(1500);
check((await mailsTo(unknown)).length === 0, 'no email sent to an unknown address');
await call('POST', '/auth/forgot-password', { email });
await sleep(1500);
check((await mailsTo(email)).filter((m) => /Reset/.test(m.Subject)).length === 1, 'second request within a minute sends nothing (cooldown)');

// 3. Reset: weak password refused, token single-use, old sessions signed out.
check((await call('POST', '/auth/reset-password', { token: r.token, password: 'short' })).status === 400, 'too-short new password refused');
check((await call('POST', '/auth/reset-password', { token: 'x'.repeat(43), password: pw2 })).status === 400, 'made-up token refused');
check((await call('POST', '/auth/reset-password', { token: r.token, password: pw2 })).status === 201, 'reset with emailed link works');
check((await call('POST', '/auth/reset-password', { token: r.token, password: 'Third-pw-123' })).status === 400, 'reset link works only once');
check((await call('GET', '/auth/me', null, oldSession)).status === 401, 'session from before the reset is signed out');
check((await call('POST', '/auth/login', { email, password: pw1 })).status === 401, 'old password no longer works');
check((await call('POST', '/auth/login', { email: email.toUpperCase(), password: pw2 })).status === 201, 'new password works (any email casing)');

// 4. Expired link refused.
await call('POST', '/auth/forgot-password', { email: `  ${email}  ` });
await db.authToken.updateMany({ where: { user: { email }, purpose: 'PASSWORD_RESET' }, data: { createdAt: new Date(Date.now() - 120_000) } });
await call('POST', '/auth/forgot-password', { email });
const r2 = await linkToken(email, '/reset-password', 1);
await db.authToken.updateMany({ where: { user: { email }, purpose: 'PASSWORD_RESET', usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
check(!!r2.token && (await call('POST', '/auth/reset-password', { token: r2.token, password: 'Fourth-pw-123' })).status === 400, 'expired link refused');

// 5. One account per email across restaurants.
const other = await call('POST', '/auth/register', { restaurantName: `Other ${tag}`, branchName: 'Main', ownerName: 'Bilal', email: `other-${tag}@isotest.local`, password: pw1 });
const otherOwner = await db.user.findFirst({ where: { email: `other-${tag}@isotest.local` }, include: { restaurant: { include: { branches: true } } } });
const waiter = await db.role.findFirst({ where: { restaurantId: otherOwner.restaurantId, name: 'WAITER' } });
const steal = await call('POST', '/users', { name: 'x', email: email.toUpperCase(), password: pw1, roleId: waiter.id, branchIds: [otherOwner.restaurant.branches[0].id] }, other.cookie);
check(steal.status === 409, "another restaurant can't add staff with an existing email", `status ${steal.status}`);
check((await call('POST', '/auth/register', { restaurantName: 'Dup', branchName: 'Main', ownerName: 'D', email: email.toUpperCase(), password: pw1 })).status === 400, 'signup with an existing email (different case) refused');
const okStaff = await call('POST', '/users', { name: 'Sara', email: `sara-${tag}@isotest.local`, password: pw1, roleId: waiter.id, branchIds: [otherOwner.restaurant.branches[0].id] }, other.cookie);
check(okStaff.status === 201, 'owner can still add staff with a new email');
const sara = await call('POST', '/auth/login', { email: `sara-${tag}@isotest.local`, password: pw1 });
check(sara.json?.user?.emailVerified === true, 'staff added by an owner count as verified (no banner)');

console.log(failures ? `FAILURES: ${failures}` : 'ALL AUTH FLOW CHECKS PASSED');
await db.$disconnect();
