import path from 'path';
import fs from 'fs';
import os from 'os';

let cachedCookiesPath: string | null = null;

export function getFFmpegPath(): string | null {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  // Common Windows imageio path
  const defaultImageio =
    'C:\\Users\\YASHDIP\\AppData\\Local\\Programs\\Python\\Python310\\lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
  if (fs.existsSync(defaultImageio)) {
    return defaultImageio;
  }
  // In Linux / Docker, ffmpeg is installed system-wide in PATH
  return null;
}

export function getCookiesPath(): string | null {
  if (cachedCookiesPath && fs.existsSync(cachedCookiesPath)) {
    return cachedCookiesPath;
  }

  // 1. Check for Base64 cookies string in env (ideal for cloud deployment: Render, Railway, AWS, DigitalOcean)
  if (process.env.YOUTUBE_COOKIES_BASE64) {
    try {
      const decoded = Buffer.from(process.env.YOUTUBE_COOKIES_BASE64, 'base64').toString('utf-8');
      const tempPath = path.join(os.tmpdir(), 'vidfetch_yt_cookies.txt');
      fs.writeFileSync(tempPath, decoded, { mode: 0o600 });
      cachedCookiesPath = tempPath;
      return cachedCookiesPath;
    } catch (e) {
      console.warn('Failed to decode YOUTUBE_COOKIES_BASE64 from environment:', e);
    }
  }

  // 2. Check explicitly configured path
  if (process.env.YOUTUBE_COOKIES_PATH && fs.existsSync(process.env.YOUTUBE_COOKIES_PATH)) {
    cachedCookiesPath = process.env.YOUTUBE_COOKIES_PATH;
    return cachedCookiesPath;
  }

  // 3. Check common cookie file names in current and parent directory
  const candidateNames = [
    'cookies.txt',
    'www.youtube.com_cookies.txt',
    'youtube_cookies.txt',
    'youtube-cookies.txt',
  ];

  const searchDirs = [
    process.cwd(),
    path.join(process.cwd(), '..'),
    path.join(__dirname, '..', '..'),
  ];

  for (const dir of searchDirs) {
    for (const name of candidateNames) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        cachedCookiesPath = candidate;
        return cachedCookiesPath;
      }
    }
  }

  return null;
}

export function getYtDlpBaseArgs(): string[] {
  const args = [
    '-m',
    'yt_dlp',
    '--no-playlist',
    '--remote-components',
    'ejs:github',
    '--js-runtimes',
    `node:${process.execPath}`,
  ];

  const ffmpeg = getFFmpegPath();
  if (ffmpeg) {
    args.push('--ffmpeg-location', ffmpeg);
  }

  const cookies = getCookiesPath();
  if (cookies) {
    args.push('--cookies', cookies);
  } else {
    // When unauthenticated, fallback to clients that don't immediately bot-block
    args.push('--extractor-args', 'youtube:player_client=visionos,android,ios,mweb');
  }

  // Support for proxy in deployment (crucial for Cloud / VPS / Datacenter IPs)
  const proxyUrl = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  if (proxyUrl) {
    args.push('--proxy', proxyUrl);
  }

  // Support for BotGuard PO Token Provider container (e.g. brainicism/bgutil-ytdlp-pot-provider)
  if (process.env.YOUTUBE_POT_PROVIDER_URL) {
    args.push('--extractor-args', `youtubepot:provider=${process.env.YOUTUBE_POT_PROVIDER_URL}`);
  }

  return args;
}
