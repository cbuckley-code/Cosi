FROM node:20-alpine
# Install docker CLI for compose commands
RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
CMD ["node", "src/index.js"]
