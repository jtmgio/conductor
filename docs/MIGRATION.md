# Conductor — Migration Guide

How to move Conductor from one machine to another.

## Quick Migration (Recommended)

### On the old machine

1. Open Conductor → Settings → System → General → Data
2. Click **Export full backup** — saves a JSON file with everything:
   - Roles, staff, schedule
   - Tasks, follow-ups, notes, transcripts
   - Conversations (AI chat history)
   - Skills, integrations, tags
   - Profile and voice settings
3. Keep the downloaded `.json` file

### On the new machine

1. Clone the repo and copy your `.env` file:
   ```bash
   git clone <repo-url> conductor
   cd conductor
   cp /path/to/.env .env
   ```

2. Start the stack:
   ```bash
   docker compose up -d --build
   ```

3. Open `http://localhost:3100` — you'll see the Setup Wizard

4. On the welcome screen, click **Import config file** and select your backup JSON

5. Set your password when prompted

6. Done — all your data is restored

## What the export includes

| Data | Full Backup | Config Only |
|------|:-----------:|:-----------:|
| Roles + staff | Yes | Yes |
| Schedule blocks | Yes | Yes |
| Skills (custom + built-in) | Yes | Custom only |
| Integrations | Yes | Yes |
| Tags | Yes | Yes |
| Profile / voice | Yes | Yes |
| **Tasks** | Yes | No |
| **Follow-ups** | Yes | No |
| **Notes** | Yes | No |
| **Transcripts** | Yes | No |
| **Conversations** | Yes | No |
| **AI usage stats** | Yes | No |
| Uploaded files | No | No |
| API keys | No | No |
| Password | No | No |

## What's NOT included

- **Uploaded files** — these live in the `uploads` Docker volume. If you need them, copy the volume:
  ```bash
  # Export uploads from old machine
  docker run --rm -v conductor_uploads:/data -v $(pwd):/backup alpine tar czf /backup/uploads.tar.gz -C /data .

  # Import uploads on new machine
  docker run --rm -v conductor_uploads:/data -v $(pwd):/backup alpine sh -c "cd /data && tar xzf /backup/uploads.tar.gz"
  ```

- **API keys** — re-enter your Anthropic API key in Settings → System → API Keys after migration. Environment variables in `.env` transfer automatically.

- **Password** — you'll set a new one during setup on the new machine.

## Alternative: Database-level migration

For a byte-perfect copy (preserves IDs, timestamps, everything):

```bash
# On the old machine — dump the database
docker compose exec postgres pg_dump -U conductor conductor | gzip > conductor-db.tar.gz

# Copy to new machine
scp conductor-db.tar.gz user@newhost:~/conductor/

# On the new machine — start fresh, then restore
docker compose up -d
docker compose exec -T postgres psql -U conductor conductor -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gunzip -c conductor-db.tar.gz | docker compose exec -T postgres psql -U conductor conductor
docker compose restart conductor
```

This copies everything including IDs, so integrations (Linear, Granola) will continue deduplicating correctly.

## Docker Compose reference

```
Services:
  conductor       — Next.js app on port 3100
  postgres        — PostgreSQL 16 on port 5433
  conductor-cron  — Hourly sync jobs (Linear + Granola)

Volumes:
  pgdata          — Database files (persists across restarts)
  uploads         — Uploaded files (persists across restarts)
```

### Useful commands

```bash
# Start everything
docker compose up -d

# Rebuild after code changes
docker compose build conductor && docker compose up -d

# View logs
docker compose logs -f conductor

# Stop everything (data preserved)
docker compose down

# Stop and DELETE all data
docker compose down -v
```
