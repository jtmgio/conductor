# Conductor

A personal productivity operating system for engineers managing multiple concurrent roles. Replaces traditional task managers with AI-powered follow-up tracking, transcript processing, communication drafting, and persistent per-role conversations.

**Single-user app** — one person per instance, password-protected.

## Quick Start

### Prerequisites

- **Docker Desktop** (Mac, Windows, or Linux)
- **Node.js 18+** (for running Prisma commands if needed)
- **Anthropic API key** from [console.anthropic.com](https://console.anthropic.com)

### 1. Clone and configure

```bash
git clone <repo-url> conductor
cd conductor
cp .env.template .env
```

Edit `.env` and set:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/conductor"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="http://localhost:5402"
ANTHROPIC_API_KEY="sk-ant-..."
```

### 2. Set up PostgreSQL

The app uses a local PostgreSQL instance on your host machine.

**macOS:**
```bash
brew install postgresql@16
brew services start postgresql@16
createdb conductor
```

**Linux:**
```bash
sudo apt install postgresql
sudo -u postgres createdb conductor
```

Then update `DATABASE_URL` in `.env` to match your Postgres credentials.

### 3. Start the app

```bash
docker compose up -d --build
```

Open **http://localhost:5402** — the setup wizard will guide you through creating your password, roles, schedule, and profile.

## Port Reference

| Service  | Port | Description              |
|----------|------|--------------------------|
| App      | 5402 | Conductor web UI         |
| Postgres | 5433 | Database (Docker)        |

Change ports by editing `docker-compose.yml`. If you change the app port, also update `NEXTAUTH_URL` in both `.env` and `docker-compose.yml`.

## Linux Notes

The default `docker-compose.yml` uses `host.docker.internal` to connect to host Postgres, which works on macOS and Windows. On Linux, either:

1. Use the containerized Postgres instead — change `DATABASE_URL` in `docker-compose.yml` to:
   ```
   postgresql://conductor:localdev@postgres:5432/conductor
   ```
2. Or add `extra_hosts: ["host.docker.internal:host-gateway"]` to the conductor service.

## Calendar Sync (macOS only, optional)

Calendar sync reads events directly from macOS Calendar.app via EventKit. It requires macOS — on Linux/Windows, this feature is simply unavailable (the rest of the app works fine).

See the "Set up Calendar sync" section in `CLAUDE.md` for setup instructions.

## Full Documentation

See `CLAUDE.md` for complete documentation including:
- All integrations (Linear, Granola, Calendar)
- AI features and context assembly
- Database schema details
- Deployment options (Docker, EC2)
- Migrating between machines
