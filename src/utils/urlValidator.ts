import { PlatformInfo } from '../types';


export function isValidUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function detectPlatform(urlString: string): PlatformInfo {
  try {
    const url = new URL(urlString);
    const host = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();


    const directExtensions = ['.mp4', '.webm', '.mkv', '.mov', '.m4v', '.avi', '.flv', '.3gp', '.mp3', '.m4a'];
    if (directExtensions.some((ext) => pathname.endsWith(ext))) {
      return {
        id: 'direct',
        name: 'Direct Media File',
        icon: 'video',
        color: '#10b981',
      };
    }

    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      return {
        id: 'youtube',
        name: 'YouTube',
        icon: 'youtube',
        color: '#ff0000',
      };
    }

    if (host.includes('instagram.com')) {
      return {
        id: 'instagram',
        name: 'Instagram',
        icon: 'instagram',
        color: '#e1306c',
      };
    }

    if (host.includes('tiktok.com')) {
      return {
        id: 'tiktok',
        name: 'TikTok',
        icon: 'tiktok',
        color: '#00f2fe',
      };
    }

    if (host.includes('twitter.com') || host.includes('x.com')) {
      return {
        id: 'twitter',
        name: 'X (Twitter)',
        icon: 'twitter',
        color: '#1da1f2',
      };
    }

    if (host.includes('facebook.com') || host.includes('fb.watch')) {
      return {
        id: 'facebook',
        name: 'Facebook',
        icon: 'facebook',
        color: '#1877f2',
      };
    }

    if (host.includes('vimeo.com')) {
      return {
        id: 'vimeo',
        name: 'Vimeo',
        icon: 'vimeo',
        color: '#1ab7ea',
      };
    }

    if (host.includes('reddit.com') || host.includes('v.redd.it')) {
      return {
        id: 'reddit',
        name: 'Reddit',
        icon: 'reddit',
        color: '#ff4500',
      };
    }

    if (host.includes('pinterest.com') || host.includes('pin.it')) {
      return {
        id: 'pinterest',
        name: 'Pinterest',
        icon: 'pinterest',
        color: '#e60023',
      };
    }

    if (host.includes('dailymotion.com') || host.includes('dai.ly')) {
      return {
        id: 'dailymotion',
        name: 'Dailymotion',
        icon: 'dailymotion',
        color: '#0066dc',
      };
    }

    return {
      id: 'generic',
      name: 'Web Video Source',
      icon: 'globe',
      color: '#6366f1',
    };
  } catch {
    return {
      id: 'unknown',
      name: 'Unknown Source',
      icon: 'link',
      color: '#94a3b8',
    };
  }
}
