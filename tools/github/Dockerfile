ARG REGISTRY=""
FROM ${REGISTRY}node:20-slim

# ARG GH_CLI_REPO lets you point to an internal mirror of cli.github.com packages.
ARG NPM_CONFIG_REGISTRY
ARG GH_CLI_REPO=https://cli.github.com

RUN apt-get update && apt-get install -y curl gnupg && \
    curl -fsSL ${GH_CLI_REPO}/packages/githubcli-archive-keyring.gpg \
      | gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] ${GH_CLI_REPO}/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && apt-get install -y gh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
