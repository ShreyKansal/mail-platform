FROM node:24.20.0-alpine
WORKDIR /app
RUN npm install --omit=dev --no-audit --no-fund smtp-server@3.20.2
COPY server.mjs ./
USER node
EXPOSE 2525
CMD ["node", "server.mjs"]
