# Build from the repository root, which is the workspace root with the lockfile:
#   docker build -f apps/web/Dockerfile -t chatter-web .
# The chat-server's address is baked into the build (it is a Vite variable), and the browser is told to trust it at
# run time through CHAT_SERVER_SOURCES (see nginx.conf.template):
#   docker build -f apps/web/Dockerfile --build-arg VITE_CHAT_SERVER_URL=https://chat.example.com -t chatter-web .
#   docker run -p 8080:8080 -e CHAT_SERVER_SOURCES="https://chat.example.com wss://chat.example.com" chatter-web

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/
COPY apps/chat-server/package.json apps/chat-server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web --ignore-scripts
COPY apps/web apps/web
ARG VITE_CHAT_SERVER_URL
ENV VITE_CHAT_SERVER_URL=$VITE_CHAT_SERVER_URL
RUN npm run build --workspace apps/web

FROM nginxinc/nginx-unprivileged:stable-alpine
# This image runs the templates through envsubst at start, which is how CHAT_SERVER_SOURCES gets into the policy.
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
ENV CHAT_SERVER_SOURCES="http://localhost:4000 ws://localhost:4000"
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s CMD wget -q -O /dev/null http://localhost:8080/ || exit 1
