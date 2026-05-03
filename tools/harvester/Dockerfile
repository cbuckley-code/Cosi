ARG REGISTRY=""
FROM ${REGISTRY}node:20-alpine

# ARG KUBECTL_URL lets you serve the kubectl binary from an internal HTTP server.
ARG NPM_CONFIG_REGISTRY
ARG KUBECTL_URL=https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl

# kubectl
RUN apk add --no-cache curl \
    && curl -fsSL "${KUBECTL_URL}" -o /usr/local/bin/kubectl \
    && chmod +x /usr/local/bin/kubectl

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
