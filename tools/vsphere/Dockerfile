ARG REGISTRY=""
FROM ${REGISTRY}node:20-alpine

# ARG GOVC_URL lets you serve the govc archive from an internal HTTP server.
ARG NPM_CONFIG_REGISTRY
ARG GOVC_URL=https://github.com/vmware/govmomi/releases/download/v0.38.0/govc_Linux_x86_64.tar.gz

# govc (govmomi CLI)
RUN apk add --no-cache curl \
    && curl -fsSL "${GOVC_URL}" | tar -xz -C /usr/local/bin govc \
    && chmod +x /usr/local/bin/govc

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
