FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY tools/jarvis/server.mjs ./server.mjs
RUN mkdir /workspace && chown -R node:node /workspace /app
USER node
ENV JARVIS_MODE=cloud JARVIS_PROJECT_ROOT=/workspace JARVIS_PORT=4318 JARVIS_NPM_CLI=/usr/local/lib/node_modules/npm/bin/npm-cli.js
EXPOSE 4318
CMD ["node", "server.mjs"]