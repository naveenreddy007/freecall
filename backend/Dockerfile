FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Railway provides PORT env variable
ENV PORT=8080

# Start the server
CMD ["node", "server.js"]
