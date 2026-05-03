// tikwm.com is a public TikTok downloader API. We use it as the primary path for TikTok
// because yt-dlp's TikTok extractor breaks frequently.
import axios from 'axios';

export async function tikwmGet(pageUrl: string, kind: 'video' | 'audio' = 'video'): Promise<string | null> {
  try {
    const r = await axios.get('https://www.tikwm.com/api/', {
      params: { url: pageUrl, hd: 1 },
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (r.data?.code === 0 && r.data?.data) {
      const url = kind === 'audio'
        ? (r.data.data.music || null)
        : (r.data.data.play || r.data.data.wmplay || r.data.data.hdplay);
      return url || null;
    }
    return null;
  } catch (e: any) {
    console.error('[tikwm] failed:', e.message);
    return null;
  }
}

export async function tikwmMeta(pageUrl: string) {
  try {
    const r = await axios.get('https://www.tikwm.com/api/', {
      params: { url: pageUrl, hd: 1 },
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (r.data?.code === 0 && r.data?.data) {
      const d = r.data.data;
      return {
        platform: 'tiktok' as const,
        type: 'video' as const,
        title: d.title || 'TikTok Video',
        thumbnail: d.cover || d.origin_cover,
        downloadUrl: d.play || d.wmplay,
        sourceUrl: pageUrl,
        duration: d.duration,
      };
    }
    return null;
  } catch (e: any) {
    console.error('[tikwm meta] failed:', e.message);
    return null;
  }
}
