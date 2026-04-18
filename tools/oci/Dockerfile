FROM node:20-slim

# OCI CLI via pip
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
    && pip3 install --break-system-packages oci-cli \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
