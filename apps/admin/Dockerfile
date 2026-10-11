# Build from the repository root, which is the workspace root with the lockfile:
#   docker build -f apps/admin/Dockerfile -t chatter-admin .
# The settings (DATABASE_URL, PAYLOAD_SECRET) are environment variables at run time. The schema is brought up to date by
# the migrations when the app starts (`prodMigrations` in payload.config.ts).
#
# The `tools` target has the whole workspace and is for one-off jobs, like the seed that creates the first super-admin:
#   docker build -f apps/admin/Dockerfile --target tools -t chatter-admin-tools .

FROM node:25-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
# npm checks the lockfile against every workspace, so all of their manifests have to be there.
COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/
COPY apps/chat-server/package.json apps/chat-server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/admin --ignore-scripts

FROM deps AS builder
COPY apps/admin apps/admin
ENV NEXT_TELEMETRY_DISABLED=1
# Placeholders for the build only: it loads the config, which checks them, but nothing connects to a database.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build \
    PAYLOAD_SECRET=build-only-placeholder-not-a-secret \
    npm run build --workspace apps/admin

FROM builder AS tools
WORKDIR /app/apps/admin
ENV NODE_ENV=production
CMD ["npm", "run", "seed"]

FROM node:25-alpine AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
# The traced server (with the node_modules it needs) is under apps/admin because the trace root is the workspace root.
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static
USER nextjs
WORKDIR /app/apps/admin
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://localhost:3000/admin/login').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# `node` itself, not `npm start`, so that SIGTERM reaches the server.
CMD ["node", "server.js"]
