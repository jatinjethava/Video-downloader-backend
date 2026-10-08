import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { downloadQueue } from '../services/jobQueue';
import { detectPlatform } from '../utils/urlValidator';

const tempDir = path.join(os.tmpdir(), 'vidfetch_downloads');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const purgeOldTempFiles = () => {
  try {
    if (!fs.existsSync(tempDir)) return;
    const now = Date.now();
    const maxAgeMs = 45 * 60 * 1000;
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      const fullPath = path.join(tempDir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
        }
      } catch {
      }
    }
  } catch {
  }
};

setInterval(purgeOldTempFiles, 10 * 60 * 1000);
purgeOldTempFiles();

import { getYtDlpBaseArgs, getPythonBin } from '../utils/ytdlpConfig';

downloadQueue.registerProcessor(async (job, updateProgress) => {
  const { url, formatId, title } = job.data as any;

  return new Promise((resolve, reject) => {
    updateProgress(10);
    const platform = detectPlatform(url);
    const isAudio = formatId === 'audio_mp3';
    const targetExt = isAudio ? 'mp3' : 'mp4';

    const uniqueId = `job_${job.id}_${Date.now()}`;
    const outTemplate = path.join(tempDir, `${uniqueId}.%(ext)s`);

    const args = [
      ...getYtDlpBaseArgs(),
      '--no-playlist',
      '--concurrent-fragments', '5',
      '--buffer-size', '1024K',
      '--no-mtime',
      '--no-part',
      '--retries', '5',
    ];

    if (isAudio) {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else {
      let formatSelector = 'bestvideo+bestaudio/best';
      if (formatId === '2160p' || formatId === '4k') {
        formatSelector =
          'bestvideo[height<=2160]+bestaudio/best[height<=2160]/best';
      } else if (formatId === '1440p' || formatId === '2k') {
        formatSelector =
          'bestvideo[height<=1440]+bestaudio/best[height<=1440]/best';
      } else if (formatId === '1080p') {
        formatSelector =
          'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best';
      } else if (formatId === '720p') {
        formatSelector =
          'bestvideo[height<=720]+bestaudio/best[height<=720]/best';
      } else if (formatId === '480p') {
        formatSelector =
          'bestvideo[height<=480]+bestaudio/best[height<=480]/best';
      } else if (formatId === '360p') {
        formatSelector =
          'bestvideo[height<=360]+bestaudio/best[height<=360]/best';
      }
      args.push('-f', formatSelector, '--merge-output-format', 'mp4');
    }

    args.push('--newline');
    args.push('-o', outTemplate, url);

    const pythonBin = getPythonBin();
    const child = execFile(pythonBin, args, { maxBuffer: 15 * 1024 * 1024, timeout: 300000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Download worker error:', error.message, stderr);
        const errDetails = (stderr || error.message || '').toString();
        let userMsg = 'Failed to process media download.';
        if (errDetails.includes('Requested format is not available')) {
          userMsg = 'Requested resolution not available on this stream.';
        } else if (errDetails.includes('not available') || errDetails.includes('Private video')) {
          userMsg = 'Video is restricted or private.';
        } else if (errDetails.includes('HTTP Error 429')) {
          userMsg = 'Rate limit reached. Please try again in a few moments.';
        } else {
          const lines = errDetails.split('\n').map(l => l.trim()).filter(l => l.startsWith('ERROR:'));
          if (lines.length > 0) {
            userMsg = lines[0].replace('ERROR:', '').trim();
          }
        }
        return reject(new Error(userMsg));
      }

      const matchingFiles = fs.readdirSync(tempDir).filter(f => f.startsWith(uniqueId));
      if (matchingFiles.length === 0) {
        return reject(new Error('Downloaded media file not found on server.'));
      }

      const filePath = path.join(tempDir, matchingFiles[0]);
      const fileExt = path.extname(filePath).replace('.', '') || targetExt;

      updateProgress(100);
      resolve({
        downloadUrl: `/api/video/file/${job.id}`,
        filePath,
        fileExt,
        title
      });
    });

    const progressRegex = /\[download\]\s+(\d+(?:\.\d+)?)%/;
    child.stdout?.on('data', (data) => {
      const text = data.toString();
      const match = text.match(progressRegex);
      if (match && match[1]) {
        const p = parseFloat(match[1]);
        if (!isNaN(p)) {

          const safeProgress = Math.max(10, Math.min(99, Math.floor(p)));
          updateProgress(safeProgress);
        }
      }
    });
  });
});

console.log('Background job processor registered.');