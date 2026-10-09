import axios from 'axios';
import * as cheerio from 'cheerio';
import { Response } from 'express';
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { detectPlatform, isValidUrl } from '../utils/urlValidator';
import { formatBytes, formatDuration, sanitizeFilename } from '../utils/formatters';
import { PlatformInfo, VideoFormat, MediaExtractionResult } from '../types';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';


import { getYtDlpBaseArgs, getFFmpegPath, getPythonBin } from '../utils/ytdlpConfig';

const FFMPEG_BIN = getFFmpegPath();

const infoCache = new Map<string, { data: MediaExtractionResult; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

export class VideoExtractorService {
  async extractVideoInfo(rawUrl: string): Promise<MediaExtractionResult> {
    const cleanUrl = rawUrl.trim();
    if (!isValidUrl(cleanUrl)) {
      throw new Error('Invalid URL provided. Please enter a valid web link.');
    }

    const cached = infoCache.get(cleanUrl);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const platform = detectPlatform(cleanUrl);
    let result: MediaExtractionResult;

    if (platform.id === 'direct') {
      result = await this.extractDirectMedia(cleanUrl, platform);
    } else {
      const ytDlpPlatforms = ['youtube', 'instagram', 'tiktok', 'twitter', 'facebook', 'vimeo', 'reddit', 'pinterest'];
      if (ytDlpPlatforms.includes(platform.id)) {
        try {
          result = await this.extractYtDlpMedia(cleanUrl, platform);
        } catch (err: unknown) {
          if (platform.id === 'youtube') {
            throw err;
          }
          const msg = err instanceof Error ? err.message : String(err);
          if (
            msg.includes('not available') ||
            msg.includes('restricted') ||
            msg.includes('Private video') ||
            msg.includes('sign-in') ||
            msg.includes('copyright')
          ) {
            throw err;
          }
          console.warn(`yt-dlp extraction failed for ${cleanUrl}, falling back to webpage parser:`, msg);
          result = await this.extractWebpageMedia(cleanUrl, platform);
        }
      } else {
        result = await this.extractWebpageMedia(cleanUrl, platform);
      }
    }

    infoCache.set(cleanUrl, { data: result, timestamp: Date.now() });
    if (infoCache.size > 500) {
      const oldest = infoCache.keys().next().value;
      if (oldest) infoCache.delete(oldest);
    }

    return result;
  }

  async extractYtDlpMedia(url: string, platform: PlatformInfo): Promise<MediaExtractionResult> {
    return new Promise((resolve, reject) => {
      const args = [
        ...getYtDlpBaseArgs(),
        '--no-playlist',
        '--dump-single-json',
        '--skip-download',
        url,
      ];

      execFile(
        getPythonBin(),
        args,
        { maxBuffer: 15 * 1024 * 1024, timeout: 25000 },
        (error, stdout, stderr) => {
          if (error) {
            const errOutput = (stderr || error.message || '').toString();

            if (errOutput.includes('HTTP Error 429') || errOutput.includes('Too Many Requests')) {
              return reject(
                new Error(
                  `YouTube is temporarily rate-limiting requests (HTTP 429). Please wait a few moments and try again.`
                )
              );
            }
            if (errOutput.includes('This video is not available') || errOutput.includes('Video unavailable')) {
              return reject(
                new Error(
                  `This video is not available on ${platform.name} (it may have been deleted, made private, or copyright-restricted). Please try a public video.`
                )
              );
            }
            if (errOutput.includes('Private video')) {
              return reject(new Error(`This video is private on ${platform.name} and cannot be accessed.`));
            }
            if (errOutput.includes('Sign in to confirm')) {
              return reject(
                new Error(`This video is age-restricted or requires account verification on ${platform.name}.`)
              );
            }

            return reject(new Error(`Extraction error: ${errOutput.slice(0, 200)}`));
          }

          try {
            const data = JSON.parse(stdout);
            const title = data.title || `${platform.name} Video`;
            const description = data.description ? data.description.slice(0, 300) : '';
            const thumbnail = data.thumbnail || '';
            const author = data.uploader || data.channel || platform.name;
            const duration = typeof data.duration === 'number' ? data.duration : null;

            const getEffectiveResolution = (f: any): number => {
              const w = typeof f.width === 'number' ? f.width : 0;
              const h = typeof f.height === 'number' ? f.height : 0;
              if (w > 0 && h > 0) {
                return Math.min(w, h);
              }
              return h || w || 0;
            };

            const availableResolutions = (data.formats || [])
              .map(getEffectiveResolution)
              .filter((r: number) => r > 0);
            const maxRes = availableResolutions.length > 0 ? Math.max(...availableResolutions) : 1080;

            const formats: VideoFormat[] = [];

            const findEstimatedSize = (targetRes: number, defaultLabel: string): { size: number | null; formatted: string } => {
              const match = (data.formats || []).find((f: any) => {
                const res = getEffectiveResolution(f);
                return res === targetRes && (f.filesize || f.filesize_approx);
              });
              if (match) {
                const bytes = match.filesize || match.filesize_approx;
                if (typeof bytes === 'number' && bytes > 0) {
                  return { size: bytes, formatted: formatBytes(bytes) };
                }
              }
              return { size: null, formatted: defaultLabel };
            };

            if (maxRes >= 2160) {
              const sz = findEstimatedSize(2160, '4K Ultra HD');
              formats.push({
                formatId: '2160p',
                quality: '4K Ultra HD 2160p',
                resolution: '3840x2160',
                extension: 'mp4',
                filesize: sz.size,
                formattedSize: sz.formatted,
                downloadUrl: url,
                isDirect: false,
                hasAudio: true,
                hasVideo: true,
              });
            }

            if (maxRes >= 1440) {
              const sz = findEstimatedSize(1440, '2K Quad HD');
              formats.push({
                formatId: '1440p',
                quality: '2K Quad HD 1440p',
                resolution: '2560x1440',
                extension: 'mp4',
                filesize: sz.size,
                formattedSize: sz.formatted,
                downloadUrl: url,
                isDirect: false,
                hasAudio: true,
                hasVideo: true,
              });
            }

            if (maxRes >= 1080) {
              const sz = findEstimatedSize(1080, 'Full HD');
              formats.push({
                formatId: '1080p',
                quality: 'Full HD 1080p',
                resolution: '1920x1080',
                extension: 'mp4',
                filesize: sz.size,
                formattedSize: sz.formatted,
                downloadUrl: url,
                isDirect: false,
                hasAudio: true,
                hasVideo: true,
              });
            }

            if (maxRes >= 720) {
              const sz = findEstimatedSize(720, 'HD Ready');
              formats.push({
                formatId: '720p',
                quality: 'HD 720p',
                resolution: '1280x720',
                extension: 'mp4',
                filesize: sz.size,
                formattedSize: sz.formatted,
                downloadUrl: url,
                isDirect: false,
                hasAudio: true,
                hasVideo: true,
              });
            }

            if (maxRes >= 480) {
              const sz = findEstimatedSize(480, 'Standard');
              formats.push({
                formatId: '480p',
                quality: 'Medium 480p',
                resolution: '854x480',
                extension: 'mp4',
                filesize: sz.size,
                formattedSize: sz.formatted,
                downloadUrl: url,
                isDirect: false,
                hasAudio: true,
                hasVideo: true,
              });
            }

            const sz360 = findEstimatedSize(360, 'Compact');
            formats.push({
              formatId: '360p',
              quality: 'Standard 360p',
              resolution: '640x360',
              extension: 'mp4',
              filesize: sz360.size,
              formattedSize: sz360.formatted,
              downloadUrl: url,
              isDirect: false,
              hasAudio: true,
              hasVideo: true,
            });

            formats.push({
              formatId: 'audio_mp3',
              quality: 'Audio Only (MP3)',
              resolution: '320kbps Audio',
              extension: 'mp3',
              filesize: null,
              formattedSize: 'Audio HQ',
              downloadUrl: url,
              isDirect: false,
              hasAudio: true,
              hasVideo: false,
            });

            resolve({
              success: true,
              url,
              platform,
              title,
              description,
              author,
              thumbnail,
              duration,
              formattedDuration: formatDuration(duration),
              formats,
            });
          } catch (parseErr: unknown) {
            reject(new Error(`Failed to parse metadata: ${String(parseErr)}`));
          }
        }
      );
    });
  }

  private extractDirectMediaMetadata(mediaUrl: string): Promise<{ thumbnail: string; duration: number | null }> {
    return new Promise((resolve) => {
      if (!FFMPEG_BIN) {
        return resolve({ thumbnail: '', duration: null });
      }

      const args = [
        '-ss', '00:00:00.5',
        '-i', mediaUrl,
        '-vframes', '1',
        '-f', 'image2',
        '-vcodec', 'mjpeg',
        'pipe:1',
      ];

      execFile(
        FFMPEG_BIN,
        args,
        {
          encoding: 'buffer',
          maxBuffer: 5 * 1024 * 1024,
          timeout: 6000,
        },
        (error, stdout, stderr) => {
          let thumbnail = '';
          let duration: number | null = null;

          if (stderr) {
            const stderrStr = stderr.toString();
            const match = stderrStr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
            if (match) {
              const hours = parseInt(match[1], 10);
              const minutes = parseInt(match[2], 10);
              const seconds = parseFloat(match[3]);
              duration = Math.round(hours * 3600 + minutes * 60 + seconds);
            }
          }

          if (!error && stdout && stdout.length > 0) {
            thumbnail = `data:image/jpeg;base64,${stdout.toString('base64')}`;
          }

          resolve({ thumbnail, duration });
        }
      );
    });
  }

  async extractDirectMedia(url: string, platform: PlatformInfo): Promise<MediaExtractionResult> {
    try {
      const parsed = new URL(url);
      const filename = sanitizeFilename(parsed.pathname.split('/').pop() || 'video.mp4');
      const ext = filename.split('.').pop() || 'mp4';

      let sizeBytes = 0;

      try {
        // A HEAD request asks the server for response headers without requesting the response body.
        const headRes = await axios.head(url, {
          headers: { 'User-Agent': USER_AGENT },
          timeout: 8000,
          validateStatus: (status) => status < 400,
        });
        const rawContentLength = headRes.headers['content-length'];
        sizeBytes = rawContentLength ? parseInt(String(rawContentLength), 10) : 0;
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          if (err.response?.status === 403) {
            throw new Error(
              'Access Denied by remote host (HTTP 403): This video link is private, restricted, or requires authorization.'
            );
          }
          if (err.response?.status === 404) {
            throw new Error('Media not found (HTTP 404): The requested video file does not exist at this link.');
          }
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('HEAD request failed for direct link, continuing without content-length:', msg);
      }

      const isAudioOnly = ['mp3', 'm4a', 'wav'].includes(ext.toLowerCase());
      let thumbnail = '';
      let duration: number | null = null;

      if (!isAudioOnly) {
        try {
          const meta = await this.extractDirectMediaMetadata(url);
          thumbnail = meta.thumbnail;
          duration = meta.duration;
        } catch (metaErr) {
          console.warn('Failed to extract direct media metadata with FFmpeg:', metaErr);
        }
      }

      return {
        success: true,
        url,
        platform,
        title: filename.replace(/_/g, ' '),
        description: `Direct media stream (${ext.toUpperCase()})`,
        author: parsed.hostname,
        thumbnail,
        duration,
        formattedDuration: duration ? formatDuration(duration) : '--:--',
        formats: [
          {
            formatId: 'original',
            quality: 'Original Quality',
            resolution: 'Direct Source',
            extension: ext,
            filesize: sizeBytes,
            formattedSize: formatBytes(sizeBytes),
            downloadUrl: url,
            isDirect: true,
            hasAudio: true,
            hasVideo: !isAudioOnly,
          },
        ],
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to inspect direct media link: ${msg}`);
    }
  }

  async extractWebpageMedia(url: string, platform: PlatformInfo): Promise<MediaExtractionResult> {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 12000,
        maxRedirects: 5,
      });

      const html = response.data;
      const $ = cheerio.load(html);

      const title =
        $('meta[property="og:title"]').attr('content') ||
        $('meta[name="twitter:title"]').attr('content') ||
        $('title').text().trim() ||
        `${platform.name} Video`;

      const thumbnail =
        $('meta[property="og:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content') ||
        $('link[rel="image_src"]').attr('href') ||
        '';

      const description =
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        '';

      const author =
        $('meta[name="author"]').attr('content') ||
        $('meta[property="og:site_name"]').attr('content') ||
        new URL(url).hostname;

      const candidateVideoUrls: Array<{ url: string; label: string }> = [];

      const ogVideo =
        $('meta[property="og:video:secure_url"]').attr('content') ||
        $('meta[property="og:video"]').attr('content') ||
        $('meta[property="og:video:url"]').attr('content');
      if (ogVideo && isValidUrl(ogVideo)) {
        candidateVideoUrls.push({ url: ogVideo, label: 'Standard Web (MP4)' });
      }

      $('video source').each((_, el) => {
        const src = $(el).attr('src');
        const type = $(el).attr('type') || '';
        if (src) {
          const resolvedSrc = src.startsWith('http') ? src : new URL(src, url).href;
          candidateVideoUrls.push({ url: resolvedSrc, label: type || 'HTML5 Source' });
        }
      });

      $('video[src]').each((_, el) => {
        const src = $(el).attr('src');
        if (src) {
          const resolvedSrc = src.startsWith('http') ? src : new URL(src, url).href;
          candidateVideoUrls.push({ url: resolvedSrc, label: 'HTML5 Video' });
        }
      });

      const uniqueMap = new Map<string, { url: string; label: string }>();
      candidateVideoUrls.forEach((item) => {
        if (!uniqueMap.has(item.url)) {
          uniqueMap.set(item.url, item);
        }
      });

      let formats: VideoFormat[] = [];

      if (uniqueMap.size > 0) {
        let index = 1;
        for (const [vUrl, item] of uniqueMap.entries()) {
          formats.push({
            formatId: `web_${index++}`,
            quality: item.label || 'Web Video',
            resolution: 'Auto / Adaptive',
            extension: 'mp4',
            filesize: null,
            formattedSize: 'Stream',
            downloadUrl: vUrl,
            isDirect: true,
            hasAudio: true,
            hasVideo: true,
          });
        }
      } else {
        formats = [
          {
            formatId: '720p',
            quality: 'HD 720p',
            resolution: '1280x720',
            extension: 'mp4',
            filesize: null,
            formattedSize: 'HD',
            downloadUrl: url,
            isDirect: false,
            hasAudio: true,
            hasVideo: true,
          },
          {
            formatId: 'audio_mp3',
            quality: 'Audio (MP3)',
            resolution: 'Audio Stream',
            extension: 'mp3',
            filesize: null,
            formattedSize: 'MP3',
            downloadUrl: url,
            isDirect: false,
            hasAudio: true,
            hasVideo: false,
          },
        ];
      }

      return {
        success: true,
        url,
        platform,
        title: title || `${platform.name} Video`,
        description: description || `Extracted media from ${platform.name}`,
        author,
        thumbnail,
        duration: null,
        formattedDuration: '--:--',
        formats,
      };
    } catch {
      return {
        success: true,
        url,
        platform,
        title: `${platform.name} Media`,
        description: `Link parsed from ${platform.name}.`,
        author: platform.name,
        thumbnail: '',
        duration: null,
        formattedDuration: '--:--',
        formats: [
          {
            formatId: '720p',
            quality: 'Best Available (MP4)',
            resolution: 'Auto HD',
            extension: 'mp4',
            filesize: null,
            formattedSize: 'HD',
            downloadUrl: url,
            isDirect: false,
            hasAudio: true,
            hasVideo: true,
          },
        ],
      };
    }
  }

  // download video through yt-dlp
  async streamMedia(targetUrl: string, filename: string, res: Response, formatId?: string): Promise<void> {
    const platform = detectPlatform(targetUrl);
    const safeFilename = sanitizeFilename(filename || 'video');


    if (platform.id !== 'direct') {
      return await this.streamYtDlpMedia(targetUrl, safeFilename, res, formatId);
    }


    try {
      const streamResponse = await axios({
        method: 'GET',
        url: targetUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': USER_AGENT,
        },
        timeout: 30000,
      });

      const contentType = String(streamResponse.headers['content-type'] || 'application/octet-stream');
      const contentLength = streamResponse.headers['content-length'];

      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.mp4"`);
      res.setHeader('Content-Type', contentType);
      if (contentLength) {
        res.setHeader('Content-Length', String(contentLength));
      }

      streamResponse.data.pipe(res);

      streamResponse.data.on('error', (err: unknown) => {
        console.error('Error during media pipe:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream interrupted during download' });
        }
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn('Proxy streaming error:', msg);
      if (!res.headersSent) {
        if (axios.isAxiosError(error) && error.response?.status === 403) {
          res.status(403).json({
            success: false,
            error: 'Access Denied: The remote storage host has restricted public access to this video file (HTTP 403).',
          });
          return;
        }
        res.status(500).json({
          success: false,
          error: `Stream error: Unable to fetch video from remote server (${msg}).`,
        });
      }
    }
  }

  async streamYtDlpMedia(
    targetUrl: string,
    filename: string,
    res: Response,
    formatId?: string
  ): Promise<void> {

    const tempDir = path.join(os.tmpdir(), 'vidfetch_downloads');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const uniqueId = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const isAudio = formatId === 'audio_mp3';
    const targetExt = isAudio ? 'mp3' : 'mp4';
    const outTemplate = path.join(tempDir, `${uniqueId}.%(ext)s`);

    const args = [
      ...getYtDlpBaseArgs(),
      '--concurrent-fragments',
      '5',
      '--buffer-size',
      '1024K',
      '--no-mtime',
      '--no-part',
      '--retries',
      '5',
    ];

    if (isAudio) {
      args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
    } else {
      let targetRes = 720;
      if (formatId === '2160p' || formatId === '4k') targetRes = 2160;
      else if (formatId === '1440p' || formatId === '2k') targetRes = 1440;
      else if (formatId === '1080p') targetRes = 1080;
      else if (formatId === '720p') targetRes = 720;
      else if (formatId === '480p') targetRes = 480;
      else if (formatId === '360p') targetRes = 360;

      args.push('-S', `res:${targetRes},ext:mp4:m4a`, '-f', 'bv*+ba/b', '--merge-output-format', 'mp4');
    }

    args.push('-o', outTemplate, targetUrl);

    execFile(getPythonBin(), args, { maxBuffer: 15 * 1024 * 1024, timeout: 180000 }, (error, _stdout, stderr) => {
      if (error) {
        const errDetails = stderr || error.message || '';
        console.error('yt-dlp download execution error:', errDetails);
        if (!res.headersSent) {
          let userMsg = 'Failed to process media download. The requested stream may be restricted.';
          if (errDetails.includes('Requested format is not available')) {
            userMsg = 'The requested resolution is not available for this video. Please select another quality tier.';
          } else if (errDetails.includes('This video is not available') || errDetails.includes('Private video')) {
            userMsg = 'This video is restricted or unavailable on the remote platform.';
          }
          res.status(500).json({
            success: false,
            error: userMsg,
          });
        }
        return;
      }


      const matchingFiles = fs.readdirSync(tempDir).filter((f) => f.startsWith(uniqueId));
      if (matchingFiles.length === 0) {
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: 'Downloaded media file not found on server.' });
        }
        return;
      }

      const filePath = path.join(tempDir, matchingFiles[0]);
      const fileExt = path.extname(filePath).replace('.', '') || targetExt;
      const stats = fs.statSync(filePath);

      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Disposition');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.${fileExt}"`);
      res.setHeader('Content-Type', fileExt === 'mp3' ? 'audio/mpeg' : 'video/mp4');
      res.setHeader('Content-Length', String(stats.size));

      const readStream = fs.createReadStream(filePath);
      readStream.pipe(res);

      const cleanup = () => {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch {
          console.log("cleanup error")
        }
      };

      res.on('finish', cleanup);
      res.on('close', cleanup);
      readStream.on('error', (streamErr) => {
        console.error('File stream error:', streamErr);
        cleanup();
      });
    });
  }
}

export default new VideoExtractorService();
