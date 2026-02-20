# ================================================================
#  Multi-stage Docker build for the WYSIWYG Editor
#  Stage 1 – install deps & build
#  Stage 2 – slim production image that serves the demo
# ================================================================

# ---------- Stage 1: Build ----------
FROM node:20-alpine AS builder

# Create a non-root user for better security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy dependency manifests first (Docker layer cache optimisation)
COPY package.json package-lock.json* ./

# Install ALL dependencies (dev included – we need them to build)
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build the library (ESM + CJS + UMD + types + CSS)
RUN npm run build

# ---------- Stage 2: Production ----------
FROM node:20-alpine AS production

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy built artefacts and the demo server
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/demo ./demo
COPY --from=builder /app/package.json ./

# Install only production deps (express for the demo server)
RUN npm install express --save && \
    npm cache clean --force

# Switch to non-root user
USER appuser

# The demo server listens on port 3000
EXPOSE 3000

# Health-check: curl the root every 30 s
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "demo/server.js"]