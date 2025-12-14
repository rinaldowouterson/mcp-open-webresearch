# Multi-Stage Dockerfile for mcp-open-webresearch (Alpine Optimized)
#
# Purpose: Optimized multi-stage build for smaller size (~1.5-2GB) and simplicity.
# - Builder: Handles full deps install, TS build, prune to prod.
# - Runtime: Alpine base; installs essential runtime deps; uses apk for Chromium installation.
# No manual libs list or browser copy from builder—installs directly in runtime for headless Chromium support.
#
# Usage: docker build -f launcher/multi/Dockerfile_alpine -t mcp-open-webresearch:alpine .
# Check size: docker images | grep mcp-open-webresearch
# Run: docker run -p 3000:3000 mcp-open-webresearch:alpine

# Stage 1: Builder - Full Node for deps and build (no browser install needed)
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files for caching
COPY package*.json ./
# Install all deps (incl. dev) for build
RUN npm ci --ignore-scripts && npm cache clean --force

# Copy source and build TS to JS
COPY . .
RUN npm run build

# Prune to prod deps only
RUN rm -rf node_modules && npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Stage 2: Runtime - Alpine Node with prod artifacts and Chromium install
FROM node:24-alpine

WORKDIR /app

# Install essential runtime deps with more aggressive cleanup
RUN apk add --no-cache \
    bash \
    ca-certificates \
    gosu \
    tini \
    chromium \
    nss-tools \
    openssl \
    && rm -rf /var/cache/apk/* /tmp/* /var/tmp/* /usr/local/share/.cache /root/.npm /root/.cache

# Create cert dirs
RUN mkdir -p /usr/local/share/ca-certificates/host_certs \
    /home/node/extra_certs

# Copy built code, prod node_modules, launcher.sh from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/docker_launcher.sh ./launcher.sh
# COPY local.fonts.conf /etc/fonts/local.conf

ENV PLAYWRIGHT_BROWSERS_PATH=0
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=true
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Create non-root user
# RUN addgroup -g 1000 node && \
#     adduser -u 1000 -G node -s /bin/sh -D node

# Chown app, certs dirs, and Playwright browsers to non-root user
RUN chown -R node:node /app /home/node

# Set tini as the init system
ENTRYPOINT ["/sbin/tini", "--"]

EXPOSE 3000

CMD ["./launcher.sh"]