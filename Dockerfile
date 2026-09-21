# API server image. Build from the repository root.
#
#   docker build -t clearbook-api .
#   docker run -p 8080:8080 -e PORT=8080 -e DATABASE_URL=postgres://... clearbook-api
#
# Railway, Render and Fly detect this file and build it as is. The web app is a static
# build served separately, see vercel.json and the Deploying section of the README.

FROM node:24-bookworm-slim AS build
RUN npm install -g pnpm@10.26.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @workspace/api-server...
RUN pnpm --filter @workspace/api-server run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/artifacts/api-server/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
