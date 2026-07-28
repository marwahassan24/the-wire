# Backups and restore

Satisfies the Phase 1 build brief's "Automated daily backups, tested restore"
line item (BUILD-BRIEF.md) and its definition of done: "The database is
backed up daily and a restore has been performed successfully at least
once."

## What's automated

`.github/workflows/backup.yml` runs nightly (02:17 UTC) plus on-demand via
the Actions tab ("Run workflow"):

1. **backup job** - `pg_dump`s `the-wire-db`, gzips it, uploads it to an
   S3-compatible bucket under `the-wire/YYYY/MM/DD-backup.sql.gz`, and
   deletes anything in that bucket older than 30 days.
2. **restore-test job** - runs immediately after, on every single backup,
   not on a separate schedule. Restores that exact dump into a scratch
   Postgres 16 instance (a GitHub Actions service container, thrown away
   at the end of the job) and checks:
   - every expected table exists
   - `pgmigrations` has rows (the schema actually came from migrations,
     not an empty database)
   - row counts for `clients`, `users`, `meeting_notes` match what was
     dumped

   If either job fails, the workflow run is red in the Actions tab - that
   is the alert. There's no separate notification wired up; whoever owns
   this should check the Actions tab occasionally or add a step that pings
   Slack/email on failure if that's wanted.

## One-time setup

Add these as repository secrets (Settings -> Secrets and variables ->
Actions -> New repository secret):

| Secret | Value |
| --- | --- |
| `PROD_DATABASE_URL` | Render dashboard -> `the-wire-db` -> Connect -> **External** Database URL (not the internal one - Actions runners aren't on Render's private network) |
| `BACKUP_S3_BUCKET` | Bucket name |
| `BACKUP_S3_ACCESS_KEY_ID` | |
| `BACKUP_S3_SECRET_ACCESS_KEY` | |
| `BACKUP_S3_REGION` | e.g. `eu-west-2`. Any value works for a provider that ignores region (R2, B2). |
| `BACKUP_S3_ENDPOINT` | Only set this for a non-AWS S3-compatible provider (Cloudflare R2, Backblaze B2). Leave the secret unset entirely for real AWS S3. |

Any S3-compatible bucket works. Pick one TCFP already has billing for, or
whichever is cheapest for a few megabytes a day with 30-day retention -
this app's data volume is small (~10 users, ~250 client families at most).
Bucket should be private, and ideally in the same region as the data
protection ruling ends up requiring (see BUILD-BRIEF.md's open question
1) - that ruling governs where backups can live too, not just the primary
database.

No code change is needed once the secrets exist; the workflow is already
in the repo and will start running on its next scheduled tick, or
immediately via "Run workflow" in the Actions tab.

## Restoring for real (disaster recovery)

If `the-wire-db` is lost or corrupted:

1. Get the latest dump: download the newest object under `the-wire/` in
   the backup bucket (dated path, so the newest is easy to spot).
2. Provision a fresh Postgres 16 database (a new Render Postgres instance,
   or point at the recovered/repaired one - anywhere reachable).
3. From the repo root, with `psql` on PATH:
   ```
   DATABASE_URL=<connection string of the empty target database> \
     scripts/restore.sh path/to/downloaded-backup.sql.gz
   ```
4. Point `the-wire-api`'s `DATABASE_URL` env var at the restored database
   (Render dashboard, or update `render.yaml`'s `fromDatabase` reference
   if it's a genuinely new database resource) and redeploy.
5. Sanity-check the app: log in, open a client, confirm data looks right
   and matches the dump's date - remember every backup is a point in time,
   so anything written to production after that dump is gone.

`scripts/restore.sh` is deliberately the same script the CI job uses, not
a separate "prod version" - it's not been anywhere it wasn't proven to
work.

**`scripts/restore.sh` is destructive to whatever database `DATABASE_URL`
points at.** It runs the dump's `CREATE TABLE`/`COPY` statements directly;
against a database that already has a schema, most statements will fail
(existing objects) and `ON_ERROR_STOP=1` will halt the script partway
through, leaving a mixed state. Always point it at an empty database.

## Ad hoc / manual backup

Useful before a risky migration or manual data fix, outside the nightly
schedule:

```
DATABASE_URL=<connection string> scripts/backup.sh
```

Writes `backup-<UTC timestamp>.sql.gz` to the current directory. Needs
`pg_dump` on PATH, matching Postgres 16 (`sudo apt install
postgresql-client-16`, or `brew install postgresql@16` on macOS).

## Known limitations

- **Render's free Postgres plan expires 30 days after creation, then a
  14-day grace period, then Render deletes it** (see `render.yaml`).
  Backups protect the *data*, not the *service* - if nobody upgrades the
  plan before that window closes, there's a period where restoring means
  provisioning a brand new database and pointing the API at it, which
  works fine with the steps above, but is worth knowing in advance rather
  than discovering during an actual incident.
- The row-count check has a small race window - see the comment on the
  "Record row counts" step in `backup.yml`. A one-off mismatch on a night
  with real usage isn't necessarily a broken backup; a persistent one is.
- No off-site copy beyond the S3-compatible bucket. If that account/bucket
  is itself lost, so are the backups - normal object versioning /
  cross-region replication on the bucket is a reasonable next step if this
  needs to be more resilient than "good enough for a ~10-person internal
  tool."
