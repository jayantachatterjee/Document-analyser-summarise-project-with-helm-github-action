FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
# Copy the source code along with the public directory assets
COPY server.js .
COPY public/ ./public/
EXPOSE 3000
CMD ["node", "server.js"]