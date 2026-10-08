# 🎥 VidFetch Backend API

High-performance Node.js & TypeScript backend service for multi-platform video analysis, metadata extraction, and Full HD media downloading with automated audio/video stream muxing.

---

## 🚀 Key Features

- **Multi-Platform Support:** Seamless extraction from YouTube, Instagram, TikTok, Twitter/X, Facebook, Vimeo, and direct video links (`.mp4`, `.webm`, `.mov`).
- **Full HD 1080p & 4K Downloads:** Automatic high-resolution video and audio stream muxing powered by `FFmpeg`.
- **Asynchronous Task Queue:** Background worker with real-time progress polling (0% to 100%) for heavy video processing.
- **YouTube Anti-Bot & SABR Bypasses:**
  - Automated Node.js JavaScript runtime challenge solver (`ejs:github`).
  - Auto-discovery of local cookies (`cookies.txt`, `www.youtube.com_cookies.txt`).
  - Cloud-ready Base64 cookies (`YOUTUBE_COOKIES_BASE64`) for serverless/PaaS deployments.
  - Proof-of-Origin (POT) token provider integration (`bgutil-ytdlp-pot-provider`).
  - Proxy support (`PROXY_URL`) to bypass cloud datacenter IP blocks.
- **Production Ready:** Pre-configured Dockerfile, rate limiting, and CORS protection.

---

## 🛠️ Tech Stack & Requirements

- **Runtime:** Node.js (v18+ or v20+)
- **Core Framework:** Express.js + TypeScript
- **Extraction Engine:** `yt-dlp` (nightly) + Python 3.10+
- **Media Processing:** FFmpeg
- **Task Management:** In-memory EventEmitter Queue (Redis/BullMQ compatible)

---

## 📦 Local Installation & Setup

### 1. Clone & Install Dependencies

```bash
cd backend
npm install
```

### 2. Install Python & Required Tools

Ensure Python 3 is installed, then install `yt-dlp` and its cryptographic components:

```bash
pip install -U yt-dlp yt-dlp-ejs bgutil-ytdlp-pot-provider websockets brotli requests pycryptodomex
```

### 3. Configure Environment Variables

Create a `.env` file in the `backend/` directory:

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Optional: Only needed if deploying to AWS/DigitalOcean and YouTube blocks datacenter IPs
# PROXY_URL=http://username:password@proxy.example.com:8080

# Optional: For cloud hosting (Render/Railway) where you cannot upload cookies.txt
# YOUTUBE_COOKIES_BASE64=
```

### 4. Start Development Server

```bash
npm run dev
```

The API will start at: `http://localhost:5000`

---

## 🔌 API Endpoints

### 1. Extract Video Info & Formats
- **Endpoint:** `POST /api/video/info`
- **Body:**
  ```json
  {
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "title": "Rick Astley - Never Gonna Give You Up",
    "duration": 213,
    "formattedDuration": "3:33",
    "thumbnail": "https://i.ytimg.com/...",
    "formats": [
      {
        "formatId": "1080p",
        "quality": "Full HD 1080p",
        "resolution": "1920x1080",
        "extension": "mp4"
      },
      {
        "formatId": "720p",
        "quality": "HD 720p",
        "resolution": "1280x720",
        "extension": "mp4"
      },
      {
        "formatId": "audio_mp3",
        "quality": "Audio Only (MP3)",
        "resolution": "320kbps Audio",
        "extension": "mp3"
      }
    ]
  }
  ```

---

### 2. Queue High-Quality Download
- **Endpoint:** `POST /api/video/queue-download`
- **Body:**
  ```json
  {
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "formatId": "1080p",
    "title": "Never Gonna Give You Up"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "jobId": "job_1791446675777_m94yyz9",
    "message": "Download queued successfully"
  }
  ```

---

### 3. Check Download Progress
- **Endpoint:** `GET /api/video/status/:jobId`
- **Response (Active):**
  ```json
  {
    "success": true,
    "job": {
      "id": "job_1791446675777_m94yyz9",
      "status": "active",
      "progress": 45
    }
  }
  ```
- **Response (Completed):**
  ```json
  {
    "success": true,
    "job": {
      "id": "job_1791446675777_m94yyz9",
      "status": "completed",
      "progress": 100,
      "result": {
        "downloadUrl": "/api/video/file/job_1791446675777_m94yyz9",
        "title": "Never Gonna Give You Up"
      }
    }
  }
  ```

---

### 4. Download Completed File
- **Endpoint:** `GET /api/video/file/:jobId`
- Streams the processed `.mp4` / `.mp3` file directly to the client browser.

---

### 5. Supported Platforms
- **Endpoint:** `GET /api/video/platforms`
- Returns the list of supported platforms and their configuration metadata.

---

## 🐳 Docker & Cloud Deployment

### Build and Run with Docker
```bash
docker build -t vidfetch-backend .
docker run -p 5000:5000 --env-file .env vidfetch-backend
```

### Deploying to Render / Railway
1. Choose **Deploy from Dockerfile**.
2. In the dashboard environment variables:
   - `PORT=5000`
   - `NODE_ENV=production`
   - `FRONTEND_URL=https://your-frontend-domain.com`
   - `YOUTUBE_COOKIES_BASE64=<your_base64_cookies_string>` (optional, for protected/VEVO videos)
   - `PROXY_URL=<your_proxy_url>` (optional, if cloud IP is rate-limited by YouTube)

---

## 📜 Scripts

| Command | Action |
| :--- | :--- |
| `npm run dev` | Start development server with live reload (`tsx`) |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm start` | Run compiled production build from `dist/server.js` |
| `npm run kill:port` | Windows helper to free up port 5000 if occupied |
