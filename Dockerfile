FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build \
  && npm prune --omit=dev \
  && mkdir -p server/uploads/cars

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared

RUN mkdir -p /app/server/uploads/cars

EXPOSE 3001

CMD ["npm", "start"]
