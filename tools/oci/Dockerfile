ARG REGISTRY=""
FROM ${REGISTRY}node:20-slim

# ARG PIP_INDEX_URL lets you point to an internal PyPI mirror (e.g. Nexus, Artifactory).
ARG NPM_CONFIG_REGISTRY
ARG PIP_INDEX_URL=https://pypi.org/simple

# OCI CLI via pip
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
    && pip3 install --break-system-packages --index-url "${PIP_INDEX_URL}" oci-cli \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
