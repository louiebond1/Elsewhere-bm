# Readable starting template. Pin the image digest after testing (see README).
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Dependencies are retained: the worker and migration scripts run with tsx at runtime.
COPY --from=build --chown=node:node /app /app
USER node
CMD ["npm", "run", "start"]
