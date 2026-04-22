FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY src/ ./src/
EXPOSE 4444
CMD ["npx", "tsx", "src/server.ts"]
