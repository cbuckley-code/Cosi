ARG REGISTRY=""
FROM ${REGISTRY}node:20-alpine

ARG NPM_CONFIG_REGISTRY
RUN apk add --no-cache git openssh-client

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
