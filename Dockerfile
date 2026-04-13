# ---- Stage 1: Dependencies ----
FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

# ---- Stage 2: Build ----
FROM node:18-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Dummy DB URL so Next.js build doesn't try to connect to a real database
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
# Give Node enough memory for the build
ENV NODE_OPTIONS="--max-old-space-size=4096"

RUN npm run build

# ---- Stage 3: Production runner ----
FROM node:18-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema + migrations for runtime migrate deploy
COPY --from=builder /app/prisma ./prisma
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma

# Entrypoint
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Uploads directory
RUN mkdir -p /opt/conductor/uploads && chown -R nextjs:nodejs /opt/conductor/uploads

# Fix Prisma engine permissions for non-root user
RUN chown -R nextjs:nodejs ./node_modules/.prisma ./node_modules/@prisma ./node_modules/prisma

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
