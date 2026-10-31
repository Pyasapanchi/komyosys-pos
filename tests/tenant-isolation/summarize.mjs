import { readFileSync } from 'node:fs';

const r = JSON.parse(readFileSync('/tmp/isotest-report.json', 'utf8'));
const norm = (p) => p.replace(/A_MARK_[a-z_]+|c[a-z0-9]{24}/g, ':id').replace(/[?&]branchId=:id/, '');
const g = {};
for (const l of r.readLeaks) {
  const k = `${l.method} ${norm(l.path)}`;
  (g[k] ??= { n: 0, s: l.sample, ex: l.path }).n++;
}
console.log('== READ LEAKS by route');
for (const [k, v] of Object.entries(g)) {
  console.log(`${v.n}x ${k}\n    ex: ${v.ex.slice(0, 120)}\n    data: ${v.s.replace(/\s+/g, ' ').slice(0, 170)}`);
}
console.log('== WRITE LEAKS');
for (const w of r.writeLeaks) console.log(w.table, w.kind, w.row.slice(0, 260));
console.log('== 2xx writes');
console.log([...new Set(r.writeCandidates.map(norm))].join('\n'));
console.log('== 5xx');
console.log([...new Set(r.errors5xx.map(norm))].join('\n'));
