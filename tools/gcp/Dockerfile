FROM node:20-slim

# Google Cloud CLI
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates apt-transport-https gnupg \
    && curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /etc/apt/keyrings/cloud.google.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
       > /etc/apt/sources.list.d/google-cloud-sdk.list \
    && apt-get update && apt-get install -y google-cloud-cli \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
