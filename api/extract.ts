// POST /api/extract — Vercel serverless function
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { detectPlatform, PLATFORM_PATTERNS } from '../lib/platforms';
import { tikwmMeta } from '../lib/tikwm';
import { metaTagFallback } from '../lib/meta-fallback';

// Try to load yt-dlp dynamically — it may or may not be available on Vercel
let youtubedl: any = null;
try {
  youtubedl = require('youtube-dl-exec');
} catch {
  console.warn('[extract] youtube-dl-exec not available — using meta-tag fallback only');
}

export const config = {
  maxDuration: 60, // up to 60s on Pro plan; 10s on Hobby
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  const platform = detectPlatform(url);
  console.log(`[extract] ${url} (platform: ${platform})`);

  try {
    // TikTok: use tikwm directly — fastest and most reliable, no binary needed
    if (platform === 'tiktok') {
      const tikwmResult = await tikwmMeta(url);
      if (tikwmResult) return res.json(tikwmResult);
    }

    // Try yt-dlp if it's available (won't be on Vercel unless we bundle it)
    if (youtubedl) {
      try {
        const info: any = await youtubedl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          preferFreeFormats: true,
          extractorArgs: 'youtube:player_client=web_creator,mweb,android',
        } as any);

        if (info) {
          const downloadUrl = info.url || (info.formats?.find((f: any) =>
            f.vcodec !== 'none' && f.acodec !== 'none' && f.url
          )?.url) || info.formats?.[0]?.url;

          if (downloadUrl) {
            return res.json({
              platform,
              type: info.vcodec === 'none' ? 'image' : 'video',
              title: info.title || 'Social Media Content',
              thumbnail: info.thumbnail || info.thumbnails?.[0]?.url,
              downloadUrl,
              sourceUrl: url,
              duration: info.duration,
            });
          }
        }
      } catch (ytErr: any) {
        console.warn('[extract] yt-dlp failed, trying meta fallback:', ytErr.message);
      }
    }

    // Meta-tag fallback for any platform that supports OG tags
    const fallback = await metaTagFallback(url, platform);
    if (fallback) return res.json(fallback);

    return res.status(500).json({
      error: `Could not extract media from ${platform}. The site may require a server with yt-dlp installed (use Railway or Render for full support).`,
    });
  } catch (error: any) {
    console.error('[extract] error:', error.message);
    return res.status(500).json({ error: error.message || 'Extraction failed' });
  }
}
