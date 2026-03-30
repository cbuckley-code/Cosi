FROM node:20-alpine
RUN apk add --no-cache openssh-client git \
    && mkdir -p /root/.ssh \
    && ssh-keyscan github.com >> /root/.ssh/known_hosts \
    && printf 'Host github.com\n  IdentityFile /root/.ssh/id_ed25519_github\n  StrictHostKeyChecking no\n' > /root/.ssh/config
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "src/index.js"]
