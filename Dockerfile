# ---- Stage 1: Build ----
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install
# RUN npm install --omit=dev

COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app

COPY --from=builder /app/build ./build
COPY package*.json ./
RUN npm ci --omit=dev


ENV PORT=5173
ENV HOST=0.0.0.0

EXPOSE 5173
CMD ["node", "build"]
