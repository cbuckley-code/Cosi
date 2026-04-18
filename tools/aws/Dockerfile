FROM node:20-slim

# AWS CLI v2
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates \
    && curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip \
    && unzip -q /tmp/awscliv2.zip -d /tmp \
    && /tmp/aws/install \
    && rm -rf /tmp/awscliv2.zip /tmp/aws \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
