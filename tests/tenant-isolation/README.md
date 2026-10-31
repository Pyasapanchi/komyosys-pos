# Tenant-isolation test

Komyosys POS runs many restaurants on one database. This test checks that one
restaurant (B) cannot read or change another restaurant's (A) data.

Run it on the server after building a new backend image, from the repo root:

```sh
sh tests/tenant-isolation/run.sh
```

It starts a throwaway copy (project `pos-isotest`: own database, no published ports,
not on Traefik), applies `deploy/vps-lockdown.sql`, and removes everything at the end.

| Script | What it does |
|---|---|
| `setup.mjs` | Registers A and B through the real signup API, then inserts one `A_MARK` row into every table, linked to A by foreign keys. |
| `attack.mjs` | As B, calls every API route (from the backend's route log) with each of A's ids and A's `branchId`, and with hostile bodies full of A's ids. Flags any 2xx response containing A's stored data, and diffs the whole database before/after for changes to A's rows. |
| `summarize.mjs` | Groups `attack.mjs` findings by route. |
| `keys.mjs` | B's MCP key (all 40 tools), B's website integration key, and A's public QR link with B's menu items. |
| `targeted.mjs` | Well-formed creates/updates from B pointing at A's table, customer, menu item, role and branch. |
| `role.mjs` | B tries to move its own staff into A's OWNER role. |

Expected result: `readLeaks=0`, `ALL TARGETED CHECKS PASSED`, `role unchanged`.
Known benign noise: `webhook_deliveries` "write leaks" are the background webhook
retry job updating A's seeded delivery, not B.

The test client rotates `X-Forwarded-For` (the test copy sets `TRUST_PROXY=1`)
to get past the per-IP rate limit; production does not trust that header.

First run (31 Oct 2026) found 36 list endpoints returning every restaurant's
data when `?branchId` was omitted; fixed in `BranchAccessService.assertAccess`.
