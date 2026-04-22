FROM node:20-alpine
WORKDIR /app

# Install production deps only
COPY package*.json ./
RUN npm ci --production

# Copy pre-compiled JS (built locally or in CI with: npm run build)
COPY dist/ ./dist/

EXPOSE 3001
CMD ["node", "dist/index.js"]
