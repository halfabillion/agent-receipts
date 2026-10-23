FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist ./dist
COPY public ./public
COPY terms ./terms
ENV PORT=8787 NODE_ENV=production
EXPOSE 8787
USER node
CMD ["node", "dist/server.js"]
