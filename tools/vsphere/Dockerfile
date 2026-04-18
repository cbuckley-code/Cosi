FROM node:20-alpine

# govc (govmomi CLI)
RUN apk add --no-cache curl \
    && curl -fsSL "https://github.com/vmware/govmomi/releases/download/v0.38.0/govc_Linux_x86_64.tar.gz" \
       | tar -xz -C /usr/local/bin govc \
    && chmod +x /usr/local/bin/govc

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
