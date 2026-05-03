# ARG REGISTRY lets you redirect the base image to an internal mirror:
#   docker build --build-arg REGISTRY=my.registry.local/ .
ARG REGISTRY=""
FROM ${REGISTRY}node:20-alpine
ARG NPM_CONFIG_REGISTRY
# Install docker CLI for compose commands
RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
CMD ["node", "src/index.js"]
