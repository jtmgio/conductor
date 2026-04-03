---
description: Deploy Conductor to EC2. Runs pre-flight checks, rsync, migrations, build, and health check.
allowed-tools: Bash, Read, Glob, Grep
---

# Deploy Conductor

Deploy to EC2 via rsync + SSH. Default target is the production EC2 instance.

## Pre-flight

1. **Check for uncommitted changes:**
   ```bash
   git status --short
   ```
   If dirty, STOP — run `/commit` first.

2. **Verify build passes locally:**
   ```bash
   npx tsc --noEmit && echo "Types OK" || echo "TYPE ERRORS — fix before deploying"
   ```

3. **Check for pending migrations:**
   ```bash
   npx prisma migrate status 2>&1 | tail -5
   ```

4. **Confirm the target:**
   ```bash
   echo "Deploying to: $DEPLOY_HOST (or ubuntu@<IP>)"
   ```

## Step 1: Rsync

```bash
DEPLOY_HOST="${DEPLOY_HOST:-ubuntu@YOUR_EC2_IP}"

rsync -avz --exclude=node_modules --exclude=.next --exclude=uploads --exclude=.env* --exclude=.git \
  ./ $DEPLOY_HOST:/opt/conductor/
```

## Step 2: Remote Setup

SSH into the instance and run:

```bash
ssh $DEPLOY_HOST "cd /opt/conductor && \
  npm install --production && \
  npx prisma migrate deploy && \
  npm run build && \
  pm2 restart conductor"
```

If PM2 process doesn't exist yet:
```bash
ssh $DEPLOY_HOST "cd /opt/conductor && pm2 start npm --name conductor -- start"
```

## Step 3: Health Check

```bash
# Wait for startup
sleep 5

# Check the app responds
ssh $DEPLOY_HOST "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000"
```

Should return 200 (or 302 redirect to login).

```bash
# Check PM2 status
ssh $DEPLOY_HOST "pm2 status conductor"
```

## Step 4: Verify

- Check that the login page loads via the public URL
- Verify the database has the latest schema (migrations applied)
- Check PM2 logs for any startup errors:
  ```bash
  ssh $DEPLOY_HOST "pm2 logs conductor --lines 20"
  ```

## Post-Deploy

Report:
```
## Deploy Complete

- Host: [IP/domain]
- Commit: [hash + message]
- Migrations: [applied N / none pending]
- Health: [200 OK / error]
- PM2: [online / errored]
```

If health check fails, check logs and report the error. Do NOT roll back without asking the user.
