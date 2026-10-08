import path from 'path';
import fs from 'fs';
import os from 'os';

let cachedCookiesPath: string | null = null;

export function getPythonBin(): string {
  if (process.env.PYTHON_PATH) {
    return process.env.PYTHON_PATH;
  }
  if (process.platform === 'win32') {
    return 'python';
  }
  return 'python3';
}

export function getFFmpegPath(): string | null {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  const defaultImageio =
    'C:\\Users\\YASHDIP\\AppData\\Local\\Programs\\Python\\Python310\\lib\\site-packages\\imageio_ffmpeg\\binaries\\ffmpeg-win-x86_64-v7.1.exe';
  if (fs.existsSync(defaultImageio)) {
    return defaultImageio;
  }
  return null;
}

export function getCookiesPath(): string | null {
  if (cachedCookiesPath && fs.existsSync(cachedCookiesPath)) {
    return cachedCookiesPath;
  }

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

  if (process.env.YOUTUBE_COOKIES_PATH && fs.existsSync(process.env.YOUTUBE_COOKIES_PATH)) {
    cachedCookiesPath = process.env.YOUTUBE_COOKIES_PATH;
    return cachedCookiesPath;
  }

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
    'node',
  ];

  const ffmpeg = getFFmpegPath();
  if (ffmpeg) {
    args.push('--ffmpeg-location', ffmpeg);
  }

  const cookies = getCookiesPath();
  if (cookies) {
    args.push('--cookies', cookies);
    args.push('--extractor-args', 'youtube:player_client=web,web_embedded,android');
  } else {
    args.push('--extractor-args', 'youtube:player_client=web_embedded,android');
  }

  const proxyUrl = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  if (proxyUrl) {
    args.push('--proxy', proxyUrl);
  }

  if (process.env.YOUTUBE_POT_PROVIDER_URL) {
    args.push('--extractor-args', `youtubepot:provider=${process.env.YOUTUBE_POT_PROVIDER_URL}`);
  }

  return args;
}
