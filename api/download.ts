// GET /api/download — streaming proxy on Vercel
import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { detectPlatform, HARD_CDN_PLATFORMS } from '../lib/platforms';
import { tikwmGet } from '../lib/tikwm';
import { buildHeadersFor } from '../lib/proxy-headers';

export const config = {
  maxDuration: 60, // 10s on Hobby, 60s on Pro
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url, filename, source, format } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).send('URL required');
  }

  const fmt: 'video' | 'audio' | 'image' =
    format === 'audio' ? 'audio' : format === 'image' ? 'image' : 'video';
  const fname = typeof filename === 'string' ? filename : 'download';
  const sourceUrl = typeof source === 'string' ? source : null;

  // TikTok via tikwm (works on Vercel — no binary needed)
  if (sourceUrl && fmt !== 'image') {
    const sourcePlatform = detectPlatform(sourceUrl);
    if (sourcePlatform === 'tiktok') {
      const mediaUrl = await tikwmGet(sourceUrl, fmt === 'audio' ? 'audio' : 'video');
      if (mediaUrl) {
        try {
          const upstream = await axios({
            method: 'get',
            url: mediaUrl,
            responseType: 'stream',
            timeout: 30000,
            maxRedirects: 5,
            headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tikwm.com/' },
          });
          const ext = fmt === 'audio' ? 'mp3' : 'mp4';
          const ctype = fmt === 'audio' ? 'audio/mpeg' : 'video/mp4';
          res.setHeader('Content-Type', ctype);
          res.setHeader('Content-Disposition', `attachment; filename="${fname}.${ext}"`);
          if (upstream.headers['content-length']) {
            res.setHeader('Content-Length', String(upstream.headers['content-length']));
          }
          upstream.data.pipe(res);
          return;
        } catch (e: any) {
          console.error('[tiktok stream] failed:', e.message);
        }
      }
    }

    // Other hard-CDN platforms: warn user (no yt-dlp on Vercel)
    if (HARD_CDN_PLATFORMS.has(sourcePlatform)) {
      return res.status(501).send(
        `${sourcePlatform} downloads require a server with yt-dlp (Vercel doesn't bundle it). Try Railway/Render, or open the link directly.`
      );
    }
  }

  // Generic axios proxy with per-host header profiles
  try {
    const headers = buildHeadersFor(url);
    if (req.headers.range) headers['Range'] = req.headers.range as string;

    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream',
      headers,
      timeout: 30000,
      maxRedirects: 10,
      validateStatus: (s) => s < 400,
    });

    const contentType = response.headers['content-type'] as string | undefined;
    const extension =
      contentType?.includes('video/mp4') ? 'mp4' :
      contentType?.includes('video') ? (contentType.split('/')[1]?.split(';')[0] || 'mp4') :
      contentType?.includes('image/jpeg') ? 'jpg' :
      contentType?.includes('image/png') ? 'png' :
      contentType?.includes('image/webp') ? 'webp' :
      contentType?.includes('image/gif') ? 'gif' :
      contentType?.includes('image') ? (contentType.split('/')[1]?.split(';')[0] || 'jpg') :
      contentType?.includes('audio/mpeg') ? 'mp3' :
      contentType?.includes('audio') ? (contentType.split('/')[1]?.split(';')[0] || 'mp3') :
      'media';

    res.setHeader('Content-Disposition', `attachment; filename="${fname}.${extension}"`);
    if (contentType) res.setHeader('Content-Type', contentType);
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', String(response.headers['content-length']));
    }
    res.status(response.status);
    response.data.pipe(res);
  } catch (error: any) {
    console.error('[download] failed:', error.message, 'status:', error.response?.status);
    if (error.response?.status === 403) {
      return res.status(403).send(
        'This media link expired or is rate-limited. Re-paste the original page link to refresh it.'
      );
    }
    return res.status(500).send('Download failed: ' + error.message);
  }
}
