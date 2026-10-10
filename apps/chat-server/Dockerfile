# Build from the repository root, which is the workspace root with the lockfile:
#   docker build -f apps/chat-server/Dockerfile -t chatter-chat-server .
# The settings (REDIS_URL, PAYLOAD_URL, PAYLOAD_SERVICE_API_KEY, BAN_HASH_SALT, WEB_ORIGIN, ...) are environment
# variables at run time; see README.md.

FROM node:24-alpine AS build
WORKDIR /app
# npm checks the lockfile against every workspace, so all of their manifests have to be there.
COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/
COPY apps/chat-server/package.json apps/chat-server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/chat-server --ignore-scripts
COPY apps/chat-server apps/chat-server
RUN npm run build --workspace apps/chat-server

FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/
COPY apps/chat-server/package.json apps/chat-server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/chat-server --omit=dev --ignore-scripts

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
# The whole install, not just the root node_modules: a package whose version differs from the one another workspace
# needs is installed under apps/chat-server/node_modules instead.
COPY --from=dependencies /app ./
COPY --from=build /app/apps/chat-server/dist ./apps/chat-server/dist
WORKDIR /app/apps/chat-server
# Not root.
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# `node` itself, not `npm start`, so that SIGTERM reaches the server and it can shut down gracefully.
CMD ["node", "dist/index.js"]
