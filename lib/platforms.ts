// Shared platform detection — used by both Express server.ts and Vercel /api/*.ts

export type PlatformKey =
  | 'youtube' | 'tiktok' | 'instagram' | 'twitter' | 'facebook'
  | 'reddit' | 'pinterest' | 'snapchat' | 'linkedin' | 'threads'
  | 'soundcloud' | 'vimeo' | 'unknown';

export const PLATFORM_PATTERNS: Array<{ key: PlatformKey; test: RegExp }> = [
  { key: 'youtube',    test: /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i },
  { key: 'tiktok',     test: /tiktok\.com/i },
  { key: 'instagram',  test: /instagram\.com/i },
  { key: 'twitter',    test: /(?:twitter\.com|x\.com|t\.co)/i },
  { key: 'facebook',   test: /(?:facebook\.com|fb\.com|fb\.watch|m\.facebook\.com)/i },
  { key: 'reddit',     test: /(?:reddit\.com|redd\.it|v\.redd\.it|i\.redd\.it)/i },
  { key: 'pinterest',  test: /(?:pinterest\.com|pin\.it)/i },
  { key: 'snapchat',   test: /snapchat\.com/i },
  { key: 'linkedin',   test: /linkedin\.com/i },
  { key: 'threads',    test: /threads\.net/i },
  { key: 'soundcloud', test: /soundcloud\.com/i },
  { key: 'vimeo',      test: /vimeo\.com/i },
];

export function detectPlatform(url: string): PlatformKey {
  for (const p of PLATFORM_PATTERNS) if (p.test.test(url)) return p.key;
  return 'unknown';
}

export const HARD_CDN_PLATFORMS = new Set<PlatformKey>(
  ['tiktok', 'instagram', 'snapchat', 'threads', 'facebook']
);
