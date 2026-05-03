# ARG REGISTRY lets you redirect the base image to an internal mirror:
#   docker build --build-arg REGISTRY=my.registry.local/ .
ARG REGISTRY=""
FROM ${REGISTRY}node:20-alpine
ARG NPM_CONFIG_REGISTRY
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "src/index.js"]
