// OG meta-tag scraping fallback for platforms where yt-dlp may not be available (e.g. Vercel)
import axios from 'axios';
import * as cheerio from 'cheerio';
import type { PlatformKey } from './platforms';

export async function metaTagFallback(url: string, platform: PlatformKey) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
      },
      timeout: 10000,
    });
    const $ = cheerio.load(response.data);

    const title =
      $("meta[property='og:title']").attr('content') ||
      $("meta[name='twitter:title']").attr('content') ||
      $('title').text() ||
      'Social Media Content';

    const thumbnail =
      $("meta[property='og:image']").attr('content') ||
      $("meta[name='twitter:image']").attr('content');

    let downloadUrl =
      $("meta[property='og:video']").attr('content') ||
      $("meta[property='og:video:secure_url']").attr('content') ||
      $("meta[property='og:video:url']").attr('content') ||
      $("meta[name='twitter:player:stream']").attr('content');

    let type: 'video' | 'image' = 'video';
    if (!downloadUrl) {
      downloadUrl =
        $("meta[property='og:image']").attr('content') ||
        $("meta[property='og:image:secure_url']").attr('content') ||
        $("meta[name='twitter:image']").attr('content');
      type = 'image';
    }
    if (!downloadUrl) return null;
    return { platform, type, title, thumbnail, downloadUrl, sourceUrl: url } as const;
  } catch (err: any) {
    console.error(`Meta-tag fallback failed for ${platform}:`, err.message);
    return null;
  }
}
