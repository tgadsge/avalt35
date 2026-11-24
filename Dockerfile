FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json server.mjs cloud.mjs ./
COPY app ./app
COPY scripts ./scripts
COPY bot ./bot
CMD ["node", "cloud.mjs"]
