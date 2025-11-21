FROM node:16-alpine
WORKDIR /app
COPY package.json .
RUN npm ci --only=production
COPY app.js .
EXPOSE 3000
CMD ["node", "app.js"]