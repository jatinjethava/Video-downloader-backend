FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    python-is-python3 \
    ffmpeg \
    curl \
    ca-certificates \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp nightly and all necessary cryptographic / JS components
RUN pip3 install --no-cache-dir --break-system-packages \
    yt-dlp \
    yt-dlp-ejs \
    bgutil-ytdlp-pot-provider \
    websockets \
    brotli \
    requests \
    pycryptodomex

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy TypeScript configuration and source code
COPY tsconfig.json ./
COPY src ./src

# Build production TypeScript code
RUN npm run build

# Expose backend port
EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "dist/server.js"]
