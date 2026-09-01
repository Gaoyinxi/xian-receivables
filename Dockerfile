FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN node scripts/build-selfhost.mjs

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# ps supports the existing supervisor's ownership check; no daemon or DB port.
RUN apt-get update && apt-get install --yes --no-install-recommends procps \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/.data /app/.selfhost \
    && chown -R node:node /app
COPY --from=build --chown=node:node /app/.selfhost-build ./.selfhost-build
COPY --chown=node:node scripts/selfhost.mjs ./scripts/selfhost.mjs
USER node
EXPOSE 4173
CMD ["node", "scripts/selfhost.mjs"]
