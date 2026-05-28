# Customer Segment Assignment — Operations Platform

An internal dashboard for Customer Success Managers (CSMs) to classify enterprises
into customer segments (**ENT / Mid / SMB**) or mark them **churned**, draining the
backlog of `NULL` / `unassigned` records that block internal queueing.

Built fresh, deliberately small, and optimized to **not fail**: every change is
optimistically locked, idempotent, and audited, and ingestion never resurrects a
record a CSM already resolved.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router, full-stack) |
| Language | TypeScript |
| DB / ORM | Postgres (Neon) + Prisma |
| Auth | Google SSO via Auth.js (NextAuth v5), restricted to `@spyne.ai` |
| Data source | Metabase public question → JSON |
| Exports | Streamed CSV/JSON + in-memory XLSX (exceljs) |
| Hosting | Vercel (+ Vercel Cron for sync) |

---

## The four reliability guarantees

1. **No resurrection** — the sync upsert (`src/server/sync.ts`) refreshes mirror
   columns only `WHERE status <> 'RESOLVED'`, and never touches `status`/`version`.
   A resolved record stays resolved even while Metabase still lists it.
2. **No lost updates** — assign/churn use an optimistic compare-and-swap on
   `version` (`src/app/actions.ts`). A losing write returns `STALE`, not silent
   overwrite.
3. **No double-writes** — `AuditLog.idempotencyKey` is unique; a double-click or
   retry is caught (`P2002`) and treated as a successful replay.
4. **No silent mutations** — the audit row is written in the **same transaction**
   as the change. Both commit or neither does.

---

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env      # then fill in the values (see below)

# 3. Create the schema (needs DATABASE_URL pointing at a Postgres you can write)
npm run db:deploy         # applies prisma/migrations
npm run db:generate       # generate the Prisma client

# 4. (optional) Seed demo rows so the dashboard is usable without Metabase
npm run db:seed

# 5. Run
npm run dev               # http://localhost:3001  (port pinned in package.json)
```

### Required env vars (`.env`)

| Var | What |
|---|---|
| `DATABASE_URL` | Postgres connection string (Neon pooled URL in prod) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client credentials |
| `ALLOWED_EMAIL_DOMAIN` | `spyne.ai` (only this domain may sign in) |
| `ADMIN_EMAILS` | comma-separated emails granted ADMIN |
| `METABASE_QUESTION_URL` | public question URL **with `.json`** |
| `CRON_SECRET` | bearer secret protecting `/api/sync` |

> **Google OAuth redirect URI:** add
> `http://localhost:3001/api/auth/callback/google` (dev — port pinned to 3001 in
> the `dev` script) and the prod equivalent in the Google Cloud Console.

---

## Data source (Metabase)

The app reads the unresolved-segment rows from a **public Metabase question**.
**Use the `.csv` endpoint**, not `.json` — Metabase silently caps public `.json`
responses at 2,000 rows, while `.csv` returns up to ~1,000,000. The ingestion
auto-detects format by Content-Type / extension, so both work, but `.csv` is
required for any non-trivial dataset.

```
METABASE_QUESTION_URL="https://metabase.spyne.ai/public/question/<uuid>.csv"
```

Ingestion (`src/lib/metabase.ts`) normalizes column names (lowercases, snake-cases,
and applies an alias table) so display names like `Csm Email` map onto our canonical
fields. If your question uses a column name not yet covered, add it to `ALIASES`
in that file. Invalid rows are skipped and counted in `sync_run.rows_invalid` —
never fatal.

Trigger a sync manually (admin session or cron secret):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/sync
```

In production, Vercel Cron hits `/api/sync` on the schedule in `vercel.json`
(every 6 hours by default).

---

## Routes

| Route | Purpose |
|---|---|
| `/` | Home: metric cards + queue grouped by CSM |
| `/queue/[enterpriseId]` | Record detail + audit history + actions |
| `POST` `assignSegment` / `markChurned` (Server Actions) | Resolve a record |
| `GET /api/queue` | Paged, filtered queue (keyset pagination) |
| `GET /api/summary` | Dashboard metrics |
| `GET /api/export/{csv,json,xlsx}` | Filtered export (whole / per-CSM) |
| `GET /api/sync` | Ingestion (cron- or admin-triggered) |
| `GET /api/health` | DB liveness |

---

## Writeback model

This app **never writes to the production database.** Resolved records leave only
via export. The data team applies the exported file to prod out-of-band; on the next
sync those rows no longer appear in the Metabase question, so they drain from the
queue naturally.

---

## Deploy (Vercel + Neon)

End-to-end, ~15 minutes.

### 1. Push the repo to Git

Vercel deploys from a Git repo. From the project folder:

```powershell
git init
git add .
git commit -m "Initial commit — segment ops platform"
# Create an empty repo on GitHub (private), then:
git remote add origin git@github.com:<your-org>/segment-ops.git
git push -u origin main
```

`.env` is gitignored — secrets stay on your machine.

### 2. Create the Neon Postgres DB

- Sign in at https://neon.tech → create a project (region near your users).
- From the project's **Connection Details** panel, copy **both** strings:
  - **Pooled connection** (host contains `-pooler`) → goes to `DATABASE_URL`.
  - **Direct connection** (host without `-pooler`) → goes to `DIRECT_URL`.
- Both URLs should end with `?sslmode=require`.

### 3. Import into Vercel

- https://vercel.com/new → import your GitHub repo.
- Framework: **Next.js** (auto-detected). Root directory: project root.
- **Don't deploy yet** — set env vars first (next step).

### 4. Set environment variables (Vercel → Settings → Environment Variables)

Set these for **Production** (and also Preview if you want preview deploys to work):

| Var | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** URL |
| `DIRECT_URL` | Neon **direct** URL |
| `AUTH_SECRET` | run `openssl rand -base64 32` and paste — **new value for prod, do not reuse local** |
| `AUTH_GOOGLE_ID` | same Google OAuth client ID you used locally |
| `AUTH_GOOGLE_SECRET` | same Google OAuth client secret |
| `ALLOWED_EMAIL_DOMAIN` | `spyne.ai` |
| `ADMIN_EMAILS` | comma-separated emails who can trigger sync / manage |
| `METABASE_QUESTION_URL` | the `.csv` URL (not `.json`) |
| `CRON_SECRET` | run `openssl rand -base64 32` — **new value for prod** |

### 5. Add the prod Google OAuth redirect URI

In Google Cloud Console → Credentials → your OAuth Client ID, **add** (don't remove the localhost ones):
- Authorized JavaScript origins: `https://<your-app>.vercel.app`
- Authorized redirect URIs: `https://<your-app>.vercel.app/api/auth/callback/google`

(Once you set up a custom domain, add that as a third pair.)

### 6. Deploy

Trigger the deploy from Vercel. The `build` script automatically runs
`prisma generate && prisma migrate deploy && next build` — so all four
migrations (`0001_init` through `0004_assign_csm_and_last_received_at`)
apply to the empty Neon DB on the first build.

### 7. Verify

- Visit `https://<your-app>.vercel.app` → sign in with your `@spyne.ai` Google account.
- Trigger the first sync (from a terminal that can reach the prod URL):
  ```bash
  curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-app>.vercel.app/api/sync
  ```
- Vercel → Functions → `/api/sync` logs: look for `metabase.fetch.ok` with the row counts.
- Vercel Cron is already registered (`vercel.json`); runs once daily at 00:00 UTC (~5:30 AM IST).

### Plan / cost note

`/api/sync` and the exports have `maxDuration = 60`. Vercel's **Hobby** plan
caps functions at 10s and is TOS-restricted for commercial use — you'll want
**Pro** ($20/month per member). Standard for a 100-employee internal tool.

### Operational defaults

- **Anyone with `@spyne.ai` Google** can sign in → role `CSM` (assign / churn / export).
- Listed in `ADMIN_EMAILS` → also `ADMIN` (can trigger `/api/sync` from an authenticated session, not just via the cron secret).
- Sync runs **once daily at 00:00 UTC (≈5:30 AM IST)** — edit `vercel.json` to change the schedule.
