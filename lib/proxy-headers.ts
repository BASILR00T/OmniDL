// Per-host header profiles to bypass CDN bot detection.
// Used by the download proxy when fetching CDN URLs directly.

const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

type HostProfile = { match: RegExp; ua?: string; referer?: string; origin?: string };

const HOST_PROFILES: HostProfile[] = [
  { match: /(tiktok\.com|tiktokcdn|muscdn|bytecdn|akamaized\.net|byteoversea)/i,
    ua: IOS_UA, referer: 'https://www.tiktok.com/', origin: 'https://www.tiktok.com' },
  { match: /(twimg\.com|video\.twimg\.com)/i,
    referer: 'https://twitter.com/', origin: 'https://twitter.com' },
  { match: /(instagram\.com|cdninstagram\.com|fbcdn\.net.*instagram)/i,
    ua: IOS_UA, referer: 'https://www.instagram.com/', origin: 'https://www.instagram.com' },
  { match: /threads\.net/i,
    ua: IOS_UA, referer: 'https://www.threads.net/', origin: 'https://www.threads.net' },
  { match: /(facebook\.com|fbcdn\.net|fbsbx\.com)/i,
    referer: 'https://www.facebook.com/', origin: 'https://www.facebook.com' },
  { match: /(redd\.it|reddit\.com|redditmedia\.com)/i,
    referer: 'https://www.reddit.com/', origin: 'https://www.reddit.com' },
  { match: /(pinimg\.com|pinterest\.com)/i,
    referer: 'https://www.pinterest.com/', origin: 'https://www.pinterest.com' },
  { match: /(snapchat\.com|sc-cdn\.net)/i,
    referer: 'https://www.snapchat.com/', origin: 'https://www.snapchat.com' },
  { match: /(linkedin\.com|licdn\.com)/i,
    referer: 'https://www.linkedin.com/', origin: 'https://www.linkedin.com' },
  { match: /(soundcloud\.com|sndcdn\.com)/i,
    referer: 'https://soundcloud.com/', origin: 'https://soundcloud.com' },
  { match: /(vimeo\.com|vimeocdn\.com)/i,
    referer: 'https://vimeo.com/', origin: 'https://vimeo.com' },
  { match: /(youtube\.com|googlevideo\.com|ytimg\.com)/i,
    referer: 'https://www.youtube.com/', origin: 'https://www.youtube.com' },
];

export function buildHeadersFor(rawUrl: string): Record<string, string> {
  const u = new URL(rawUrl);
  const profile = HOST_PROFILES.find(p => p.match.test(u.hostname));
  const headers: Record<string, string> = {
    'User-Agent': profile?.ua || DESKTOP_UA,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    'Range': 'bytes=0-',
    'Sec-Fetch-Dest': 'video',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
  };
  if (profile?.referer) headers['Referer'] = profile.referer;
  if (profile?.origin) headers['Origin'] = profile.origin;
  if (!profile) headers['Referer'] = u.origin;
  return headers;
}

export { DESKTOP_UA, IOS_UA };
