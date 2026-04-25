# Database Backup Policy — BeFine

**Last updated:** 2026-04-24  
**Database:** Neon PostgreSQL (serverless, `ep-wild-hill-angoy5u6-pooler.c-6.us-east-1.aws.neon.tech`)

---

## Neon built-in backup behavior

Neon provides continuous, automatic point-in-time restore (PITR) for all projects. No manual configuration is required.

| Plan            | PITR retention | Granularity |
| --------------- | -------------- | ----------- |
| Free            | 24 hours       | Any second  |
| Launch ($19/mo) | 7 days         | Any second  |
| Scale ($69/mo)  | 30 days        | Any second  |

**Current plan:** Free (24-hour retention). **Upgrade to Launch before go-live** to get 7-day retention — sufficient for a small salon's operational risk.

Neon stores backups as Write-Ahead Log (WAL) segments replicated across availability zones. Data is encrypted at rest (AES-256) and in transit (TLS 1.3).

---

## Restore procedure

### Point-in-time restore via Neon Console

1. Log into [console.neon.tech](https://console.neon.tech)
2. Select the **BeFine** project → **Branches**
3. Click **Restore** on the `main` branch
4. Choose the target timestamp (any second within the retention window)
5. Neon creates a new branch at that point — inspect data before promoting
6. To promote: update `DATABASE_URL` in Vercel to point to the restored branch, then delete the old main branch

**Total downtime:** typically < 5 minutes for branch creation; < 2 minutes for Vercel env var update + redeploy.

### Restore drill (required before T089 go-live)

Perform once on the staging branch before go-live:

1. Note a target timestamp (e.g. 30 minutes ago)
2. Insert a test row in `clients` table: `INSERT INTO clients (id, name, ...) VALUES (...)`
3. Record the timestamp after insertion
4. Restore the staging branch to the timestamp **before** the insertion
5. Verify the test row does not appear in the restored branch
6. Delete the restore branch; re-promote the original staging branch

Document the drill result here:

| Date | Performed by | Target timestamp | Row inserted | Row absent after restore | Duration |
| ---- | ------------ | ---------------- | ------------ | ------------------------ | -------- |
| ⏳   | —            | —                | —            | —                        | —        |

> **Status (T10R-R3, 2026-04-24):** Blocked. There is currently no staging
> Neon branch — local development talks to the production branch directly.
> Running the drill against production is unsafe; the drill will be executed
> as soon as a dedicated staging branch is provisioned. Tracked under
> `T10R-R3` in `docs/Business/progress.md` with status `blocked`.

---

## Storage limit monitoring

Neon Free tier: 512 MB storage. Launch: 10 GB.

**Current usage:** Estimated < 10 MB for MVP dataset (< 1 000 employees, < 10 000 tickets, < 5 000 clients).

To set up a Neon storage alert:

1. Neon Console → Project → **Monitoring** → **Alerts**
2. Add alert: "Storage > 400 MB" (80% of free tier) → email `juandawdb@gmail.com`
3. If approaching limit, export a dump via `pg_dump` and store on Google Drive as a secondary backup

---

## Secondary backup (manual)

For additional safety, export a full dump monthly. `vercel env pull` writes a
`.env` file rather than emitting a single variable to stdout, so source the
file before invoking `pg_dump` and remove it immediately after:

```bash
vercel env pull .env.production --environment=production --yes
set -a; . ./.env.production; set +a
pg_dump "$DATABASE_URL" --no-owner --no-acl -F c \
  -f "befine-backup-$(date +%Y%m%d).dump"
rm .env.production
```

Alternative (Neon CLI, no Vercel round-trip):

```bash
pg_dump "$(neonctl connection-string main --project-id <project-id>)" \
  --no-owner --no-acl -F c -f "befine-backup-$(date +%Y%m%d).dump"
```

Store in a Google Drive folder named `BeFine DB Backups`. Retain the last 3 monthly dumps.

---

## Rollback plan for go-live

If a critical bug is found post-launch:

1. Immediately revert the Vercel deployment to the prior commit (Vercel → Deployments → Redeploy previous)
2. If schema migration was applied, use PITR to restore the DB to the timestamp before go-live
3. Staff reverts to spreadsheets while the fix is prepared (max 24 hours)
4. Fix is deployed to staging, verified, then promoted to production

See `docs/Business/tasks/phase-10-polish.md` T089 for the full go-live checklist.
