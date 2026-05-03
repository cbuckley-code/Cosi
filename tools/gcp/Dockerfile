ARG REGISTRY=""
FROM ${REGISTRY}node:20-slim

# ARG GCLOUD_APT_REPO lets you point to an internal mirror of packages.cloud.google.com.
ARG NPM_CONFIG_REGISTRY
ARG GCLOUD_APT_REPO=https://packages.cloud.google.com

# Google Cloud CLI
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates apt-transport-https gnupg \
    && curl -fsSL ${GCLOUD_APT_REPO}/apt/doc/apt-key.gpg | gpg --dearmor -o /etc/apt/keyrings/cloud.google.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/cloud.google.gpg] ${GCLOUD_APT_REPO}/apt cloud-sdk main" \
       > /etc/apt/sources.list.d/google-cloud-sdk.list \
    && apt-get update && apt-get install -y google-cloud-cli \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
