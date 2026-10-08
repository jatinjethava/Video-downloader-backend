export interface PlatformInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface VideoFormat {
  formatId: string;
  quality: string;
  resolution: string;
  extension: string;
  filesize: number | null;
  formattedSize: string;
  downloadUrl: string;
  isDirect: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
}

export interface MediaExtractionResult {
  success: boolean;
  url: string;
  platform: PlatformInfo;
  title: string;
  description: string;
  author: string;
  thumbnail: string;
  duration: number | null;
  formattedDuration: string;
  formats: VideoFormat[];
}

export interface PlatformCatalogItem {
  id: string;
  name: string;
  badge: string;
  color: string;
  description: string;
  example: string;
}
