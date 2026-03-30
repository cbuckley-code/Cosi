FROM node:20-alpine
# Install docker CLI for compose commands, plus SSH for git
RUN apk add --no-cache docker-cli docker-cli-compose openssh-client git \
    && mkdir -p /root/.ssh \
    && ssh-keyscan github.com >> /root/.ssh/known_hosts \
    && printf 'Host github.com\n  IdentityFile /root/.ssh/id_ed25519_github\n  StrictHostKeyChecking no\n' > /root/.ssh/config
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
CMD ["node", "src/index.js"]
