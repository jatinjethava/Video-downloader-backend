import { Request, Response, NextFunction } from 'express';
import videoExtractor from '../services/videoExtractor';
import { isValidUrl, detectPlatform } from '../utils/urlValidator';
import { sanitizeFilename } from '../utils/formatters';
import { PlatformCatalogItem } from '../types';

export class VideoController {
  async getVideoInfo(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const url = (req.body.url || req.query.url) as string | undefined;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Please provide a valid video URL.',
        });
      }

      const cleanUrl = url.trim();

      if (!isValidUrl(cleanUrl)) {
        return res.status(400).json({
          success: false,
          error: 'The provided link is not a valid HTTP/HTTPS URL.',
        });
      }

      const mediaInfo = await videoExtractor.extractVideoInfo(cleanUrl);

      return res.status(200).json(mediaInfo);
    } catch (error) {
      next(error);
    }
  }

  async downloadVideo(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const { url, title, formatId } = req.query as { url?: string; title?: string; formatId?: string };

      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'Missing required "url" parameter for download.',
        });
      }

      if (!isValidUrl(url)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid URL provided.',
        });
      }

      const platform = detectPlatform(url);
      const safeTitle = sanitizeFilename(title || `${platform.name}_video`);

      await videoExtractor.streamMedia(url, safeTitle, res, formatId);
    } catch (error) {
      next(error);
    }
  }

  async queueDownload(req: Request, res: Response, next: NextFunction): Promise<Response | void> {
    try {
      const url = (req.body.url || req.query.url) as string | undefined;
      const title = (req.body.title || req.query.title) as string | undefined;
      const formatId = (req.body.formatId || req.query.formatId) as string | undefined;

      if (!url || typeof url !== 'string') {
        return res.status(400).json({ success: false, error: 'Missing required "url" parameter.' });
      }

      const cleanUrl = url.trim();
      if (!isValidUrl(cleanUrl)) {
        return res.status(400).json({ success: false, error: 'Invalid URL provided.' });
      }

      const { downloadQueue } = await import('../services/jobQueue');
      const job = downloadQueue.addJob({ url: cleanUrl, formatId: formatId || '720p', title });

      return res.status(202).json({
        success: true,
        jobId: job.id,
        message: 'Download queued successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  async getJobStatus(req: Request, res: Response): Promise<Response> {
    const { jobId } = req.params;
    const { downloadQueue } = await import('../services/jobQueue');
    const job = downloadQueue.getJob(jobId as string);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }
    return res.status(200).json({ success: true, job });
  }

  async getJobFile(req: Request, res: Response): Promise<void> {
    const { jobId } = req.params;
    const { downloadQueue } = await import('../services/jobQueue');
    const job = downloadQueue.getJob(jobId as string);

    if (!job || job.status !== 'completed' || !job.result) {
      res.status(404).json({ success: false, error: 'File not found or job not completed' });
      return;
    }

    const { filePath, fileExt, title } = job.result as any;
    res.download(filePath, `${title || 'video'}.${fileExt}`);
  }

  getSupportedPlatforms(_req: Request, res: Response): Response {
    const platforms: PlatformCatalogItem[] = [
      {
        id: 'direct',
        name: 'Direct MP4 / WebM',
        badge: 'Direct Download',
        color: '#10b981',
        description: 'Direct video links from any CDN or server (.mp4, .webm, .mkv, .mov)',
        example: 'https://example.com/media/sample.mp4',
      },
      {
        id: 'youtube',
        name: 'YouTube',
        badge: 'Videos & Shorts',
        color: '#ff0000',
        description: 'Standard YouTube videos, Shorts, and clips',
        example: 'https://youtube.com/watch?v=...',
      },
      {
        id: 'instagram',
        name: 'Instagram',
        badge: 'Reels & Posts',
        color: '#e1306c',
        description: 'Instagram Reels, Stories, and IGTV videos',
        example: 'https://instagram.com/reel/...',
      },
      {
        id: 'tiktok',
        name: 'TikTok',
        badge: 'HD Videos',
        color: '#00f2fe',
        description: 'TikTok trending videos and creator content',
        example: 'https://tiktok.com/@user/video/...',
      },
      {
        id: 'twitter',
        name: 'X / Twitter',
        badge: 'Clips & Feeds',
        color: '#1da1f2',
        description: 'Videos posted on X/Twitter tweets',
        example: 'https://x.com/status/...',
      },
      {
        id: 'facebook',
        name: 'Facebook',
        badge: 'Watch & Reels',
        color: '#1877f2',
        description: 'Public Facebook videos and Watch reels',
        example: 'https://facebook.com/watch/?v=...',
      },
      {
        id: 'vimeo',
        name: 'Vimeo',
        badge: 'High Bitrate',
        color: '#1ab7ea',
        description: 'Vimeo creative showcase and portfolio videos',
        example: 'https://vimeo.com/...',
      },
      {
        id: 'reddit',
        name: 'Reddit',
        badge: 'Posts & Clips',
        color: '#ff4500',
        description: 'Reddit media and community uploads',
        example: 'https://reddit.com/r/...',
      },
      {
        id: 'pinterest',
        name: 'Pinterest',
        badge: 'Pins & Videos',
        color: '#e60023',
        description: 'Pinterest video pins, Idea pins, and stories',
        example: 'https://pinterest.com/pin/...',
      },
      {
        id: 'generic',
        name: 'Universal Web Video',
        badge: 'OpenGraph / HTML5',
        color: '#8b5cf6',
        description: 'Any public webpage with embedded HTML5 video or OpenGraph media',
        example: 'https://any-site.com/video-page',
      },
    ];

    return res.status(200).json({
      success: true,
      total: platforms.length,
      platforms,
    });
  }
}

export default new VideoController();