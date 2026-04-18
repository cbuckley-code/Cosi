FROM node:20-alpine

# kubectl
RUN apk add --no-cache curl \
    && curl -fsSL "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl" -o /usr/local/bin/kubectl \
    && chmod +x /usr/local/bin/kubectl

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
