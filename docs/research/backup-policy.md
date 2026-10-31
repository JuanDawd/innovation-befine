# Database Backup Policy — BeFine

**Last updated:** 2026-10-31  
**Database:** Neon PostgreSQL (serverless, `ep-wild-hill-angoy5u6-pooler.c-6.us-east-1.aws.neon.tech`)

---

## Neon built-in backup behavior

Neon provides continuous, automatic point-in-time restore (PITR) for all projects. No manual configuration is required.

**Current plan:** Free. **Actual history retention: 6 hours** (`history_retention_seconds: 21600`, checked 2026-10-31). Before go-live, move to a paid plan with a longer window and confirm the new value in the project settings; check Neon's pricing page for current limits.

Neon stores backups as Write-Ahead Log (WAL) segments replicated across availability zones. Data is encrypted at rest (AES-256) and in transit (TLS 1.3).

---

## Restore procedure

Neon console (Backup & Restore) or the Neon API, in this order:

1. Create a snapshot of `main` at the target timestamp. It must be inside the retention window.
2. Restore it as a new branch **without finalizing** (in the Neon MCP tool, pass `finalize: false` explicitly: it defaults to true for a new branch, and finalizing replaces the target).
3. Inspect the restored branch and compare row counts.
4. Finalize the restore. Neon moves the computes to the restored branch and replaces `main`, so connection details stay the same and no Vercel change is needed.

## Restore drill

| Date       | Performed by               | Target timestamp     | Result                                                                                                                                                                                                           | Duration                        |
| ---------- | -------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 2026-10-31 | Claude Code, for the owner | 2026-10-31T19:12:00Z | Pass. Restored 400 tickets, 25 voided, 23 cancelled test appointments, 9 payouts ($10.268.998), 11 checkouts ($5.990.000), 48 cleanup log rows, 53 migration rows. `main` stayed on the wiped state (0 tickets). | Snapshot to branch created: 7 s |

The drill used a real loss: the T135 reset emptied production at about 19:13 UTC, and the restore brought back the data from just before it.

The restore was then finalized at 19:25 UTC. The restored branch became `main`, the production endpoint (`ep-wild-hill`) and connection string stayed the same, no Vercel change was needed, and `/api/health` returned 200 on every check (first request after the swap: about 1 s, as the compute restarted). The previous branch stays as `main (old)` until deleted. Signing in and the app's screens were not exercised after the swap.

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
