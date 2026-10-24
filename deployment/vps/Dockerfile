FROM node:24-bookworm-slim AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
ARG PUBLIC_ORIGIN=https://scalaris.com.ar
ENV PAGES_BASE_PATH=/burger-house-3/
ENV VITE_API_BASE_URL=${PUBLIC_ORIGIN}/burger-house-3-api
ENV VITE_CATALOG_PUBLISHER_URL=${PUBLIC_ORIGIN}/burger-house-3-editor
RUN node --input-type=module -e "import fs from 'node:fs'; const file='frontend.config.json'; const config=JSON.parse(fs.readFileSync(file,'utf8')); const origin=process.env.VITE_API_BASE_URL.replace('/burger-house-3-api',''); Object.assign(config,{publicUrl:origin+'/burger-house-3/',catalogUrl:origin+'/burger-house-3/catalog.json',upstreamCatalogUrl:origin+'/burger-house-3/catalog.json',apiBaseUrl:process.env.VITE_API_BASE_URL,publisherUrl:process.env.VITE_CATALOG_PUBLISHER_URL,managementUrl:origin+'/burger-house-3/admin/'}); fs.writeFileSync(file,JSON.stringify(config));"
RUN npm run build && npm run build:management
RUN ./node_modules/.bin/esbuild deployment/vps/server.ts --bundle --platform=node --format=esm --target=node24 --outfile=server.mjs --external:node:sqlite

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /build/server.mjs ./server.mjs
COPY --from=build /build/dist-pages ./public
COPY --from=build /build/dist-management ./management
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
USER node
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
