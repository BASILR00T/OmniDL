import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import cors from "cors";
import axios from "axios";
import * as cheerio from "cheerio";
import youtubedl from "youtube-dl-exec";
import { spawn } from "child_process";

// Resolve the actual yt-dlp binary path that youtube-dl-exec uses (bundled with the package)
const YT_DLP_BIN: string = (youtubedl as any).constants?.YOUTUBE_DL_PATH || 'yt-dlp';

// ---- Platform detection -------------------------------------------------
type PlatformKey =
  | 'youtube' | 'tiktok' | 'instagram' | 'twitter' | 'facebook'
  | 'reddit' | 'pinterest' | 'snapchat' | 'linkedin' | 'threads'
  | 'soundcloud' | 'vimeo' | 'unknown';

const PLATFORM_PATTERNS: Array<{ key: PlatformKey; test: RegExp }> = [
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

function detectPlatform(url: string): PlatformKey {
  for (const p of PLATFORM_PATTERNS) if (p.test.test(url)) return p.key;
  return 'unknown';
}

// Platforms where yt-dlp typically struggles — try meta-tag scraping early
const META_FALLBACK_PLATFORMS: PlatformKey[] = [
  'instagram', 'tiktok', 'twitter', 'pinterest',
  'snapchat', 'linkedin', 'threads', 'facebook'
];

async function metaTagFallback(url: string, platform: PlatformKey) {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1",
      },
      timeout: 10000,
    });
    const $ = cheerio.load(response.data);

    const title =
      $("meta[property='og:title']").attr("content") ||
      $("meta[name='twitter:title']").attr("content") ||
      $("title").text() ||
      "Social Media Content";

    const thumbnail =
      $("meta[property='og:image']").attr("content") ||
      $("meta[name='twitter:image']").attr("content");

    let downloadUrl =
      $("meta[property='og:video']").attr("content") ||
      $("meta[property='og:video:secure_url']").attr("content") ||
      $("meta[property='og:video:url']").attr("content") ||
      $("meta[name='twitter:player:stream']").attr("content");

    let type: 'video' | 'image' = 'video';
    if (!downloadUrl) {
      downloadUrl =
        $("meta[property='og:image']").attr("content") ||
        $("meta[property='og:image:secure_url']").attr("content") ||
        $("meta[name='twitter:image']").attr("content");
      type = 'image';
    }
    if (!downloadUrl) return null;
    return { platform, type, title, thumbnail, downloadUrl, sourceUrl: url } as const;
  } catch (err: any) {
    console.error(`Meta-tag fallback failed for ${platform}:`, err.message);
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(cors());
  app.use(express.json());

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // yt-dlp version + manual update endpoint (helpful when extractors break)
  app.get("/api/yt-dlp/version", (_req, res) => {
    const child = spawn(YT_DLP_BIN, ['--version']);
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.on('close', () => res.json({ version: out.trim(), bin: YT_DLP_BIN }));
    child.on('error', (e) => res.status(500).json({ error: e.message }));
  });

  app.post("/api/yt-dlp/update", (req, res) => {
    const channel = (req.query.channel as string) || 'nightly';
    console.log(`[yt-dlp update] channel=${channel}`);
    const child = spawn(YT_DLP_BIN, ['--update-to', channel]);
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { out += d.toString(); });
    child.on('close', (code) => res.status(code === 0 ? 200 : 500).json({ ok: code === 0, output: out.trim() }));
    child.on('error', (e) => res.status(500).json({ error: e.message }));
  });

  // Per-host request profiles (UA + Referer + Origin) to bypass CDN bot checks
  type HostProfile = { match: RegExp; ua?: string; referer?: string; origin?: string };
  const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

  const HOST_PROFILES: HostProfile[] = [
    // TikTok — needs iOS UA, real Referer, AND Origin to satisfy CDN signature checks
    { match: /(tiktok\.com|tiktokcdn|muscdn|bytecdn|akamaized\.net|byteoversea)/i,
      ua: IOS_UA, referer: 'https://www.tiktok.com/', origin: 'https://www.tiktok.com' },
    // Twitter/X — Referer enough; UA can be desktop
    { match: /(twimg\.com|video\.twimg\.com)/i,
      referer: 'https://twitter.com/', origin: 'https://twitter.com' },
    // Instagram + Threads (share CDN)
    { match: /(instagram\.com|cdninstagram\.com|fbcdn\.net.*instagram)/i,
      ua: IOS_UA, referer: 'https://www.instagram.com/', origin: 'https://www.instagram.com' },
    { match: /threads\.net/i,
      ua: IOS_UA, referer: 'https://www.threads.net/', origin: 'https://www.threads.net' },
    // Facebook
    { match: /(facebook\.com|fbcdn\.net|fbsbx\.com)/i,
      referer: 'https://www.facebook.com/', origin: 'https://www.facebook.com' },
    // Reddit
    { match: /(redd\.it|reddit\.com|redditmedia\.com)/i,
      referer: 'https://www.reddit.com/', origin: 'https://www.reddit.com' },
    // Pinterest
    { match: /(pinimg\.com|pinterest\.com)/i,
      referer: 'https://www.pinterest.com/', origin: 'https://www.pinterest.com' },
    // Snapchat
    { match: /(snapchat\.com|sc-cdn\.net)/i,
      referer: 'https://www.snapchat.com/', origin: 'https://www.snapchat.com' },
    // LinkedIn
    { match: /(linkedin\.com|licdn\.com)/i,
      referer: 'https://www.linkedin.com/', origin: 'https://www.linkedin.com' },
    // SoundCloud
    { match: /(soundcloud\.com|sndcdn\.com)/i,
      referer: 'https://soundcloud.com/', origin: 'https://soundcloud.com' },
    // Vimeo
    { match: /(vimeo\.com|vimeocdn\.com)/i,
      referer: 'https://vimeo.com/', origin: 'https://vimeo.com' },
    // YouTube — googlevideo URLs need no special headers
    { match: /(youtube\.com|googlevideo\.com|ytimg\.com)/i,
      referer: 'https://www.youtube.com/', origin: 'https://www.youtube.com' },
  ];

  function buildHeadersFor(rawUrl: string): Record<string, string> {
    const u = new URL(rawUrl);
    const profile = HOST_PROFILES.find(p => p.match.test(u.hostname));
    const headers: Record<string, string> = {
      'User-Agent': profile?.ua || DESKTOP_UA,
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity', // disable gzip so we can stream
      'Range': 'bytes=0-',           // many CDNs require Range to serve video
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
    };
    if (profile?.referer) headers['Referer'] = profile.referer;
    if (profile?.origin)  headers['Origin']  = profile.origin;
    if (!profile) {
      headers['Referer'] = u.origin;
    }
    return headers;
  }

  // Platforms whose CDN URLs are IP/session-bound and 403 from a different host.
  // For these we stream via yt-dlp using the original page URL instead of axios-fetching the CDN URL.
  const HARD_CDN_PLATFORMS = new Set<PlatformKey>(['tiktok', 'instagram', 'snapchat', 'threads', 'facebook']);

  // TikTok-specific: when yt-dlp's extractor breaks (frequent), fall back to the public tikwm.com API.
  // tikwm returns a no-watermark mp4 URL that's freely fetchable (no IP binding).
  async function tikwmGet(pageUrl: string, kind: 'video' | 'audio'): Promise<string | null> {
    try {
      console.log(`[tikwm] fetching ${kind} for ${pageUrl}`);
      const r = await axios.get('https://www.tikwm.com/api/', {
        params: { url: pageUrl, hd: 1 },
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (r.data?.code === 0 && r.data?.data) {
        const url = kind === 'audio'
          ? (r.data.data.music || null)
          : (r.data.data.play || r.data.data.wmplay || r.data.data.hdplay);
        if (url) {
          console.log(`[tikwm] got ${kind} url: ${url.slice(0, 80)}…`);
          return url;
        }
      }
      console.warn(`[tikwm] no ${kind} url returned:`, r.data?.msg || 'unknown');
      return null;
    } catch (e: any) {
      console.error(`[tikwm] failed:`, e.message);
      return null;
    }
  }

  async function streamFromTikwm(pageUrl: string, filename: string | undefined, format: 'video' | 'audio', res: express.Response): Promise<boolean> {
    const mediaUrl = await tikwmGet(pageUrl, format);
    if (!mediaUrl) return false;
    try {
      const upstream = await axios({
        method: 'get',
        url: mediaUrl,
        responseType: 'stream',
        timeout: 30000,
        maxRedirects: 5,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tikwm.com/' },
      });
      const ext = format === 'audio' ? 'mp3' : 'mp4';
      const ctype = format === 'audio' ? 'audio/mpeg' : 'video/mp4';
      res.setHeader('Content-Type', ctype);
      res.setHeader('Content-Disposition', `attachment; filename="${filename || 'tiktok'}.${ext}"`);
      if (upstream.headers['content-length']) res.setHeader('Content-Length', String(upstream.headers['content-length']));
      upstream.data.pipe(res);
      return true;
    } catch (e: any) {
      console.error('[tikwm stream] failed:', e.message);
      return false;
    }
  }

  function streamViaYtDlp(pageUrl: string, filename: string | undefined, req: express.Request, res: express.Response, format: 'video' | 'audio' = 'video') {
    console.log(`[yt-dlp stream] ${pageUrl}`);
    const platform = detectPlatform(pageUrl);

    // Build a full set of browser-mimicking headers (organic-looking traffic)
    const browserHeaders = [
      '--add-header', 'Accept-Language:en-US,en;q=0.9',
      '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      '--add-header', 'sec-ch-ua:"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      '--add-header', 'sec-ch-ua-mobile:?0',
      '--add-header', 'sec-ch-ua-platform:"Windows"',
      '--add-header', 'Sec-Fetch-Dest:document',
      '--add-header', 'Sec-Fetch-Mode:navigate',
      '--add-header', 'Sec-Fetch-Site:none',
      '--add-header', 'Sec-Fetch-User:?1',
      '--add-header', 'Upgrade-Insecure-Requests:1',
    ];

    // Per-platform extractor tweaks — only conservative flags that won't break on yt-dlp updates
    const extractorArgs: string[] = [];
    if (platform === 'youtube') {
      extractorArgs.push('--extractor-args', 'youtube:player_client=web_creator,mweb,android');
    } else if (platform === 'twitter') {
      extractorArgs.push('--extractor-args', 'twitter:api=syndication');
    }
    // TikTok: let yt-dlp use its default extractor — it's actively maintained for the TikTok API

    // Optional: load cookies from a browser if the user has one of these installed
    // Set OMNIDL_COOKIES_FROM_BROWSER=chrome|firefox|edge|brave in env to enable
    const cookieBrowser = process.env.OMNIDL_COOKIES_FROM_BROWSER;
    const cookieArgs = cookieBrowser ? ['--cookies-from-browser', cookieBrowser] : [];

    // Pick UA per platform
    const ua = platform === 'tiktok' || platform === 'instagram' || platform === 'threads' || platform === 'snapchat'
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    // Format selection: video → best mp4; audio → best audio (m4a/mp3)
    const formatArgs = format === 'audio'
      ? ['-f', 'bestaudio[ext=m4a]/bestaudio/best']
      : ['-f', 'best[ext=mp4]/best'];

    const args = [
      pageUrl,
      ...formatArgs,
      '-o', '-',
      '--no-warnings', '--quiet',
      '--no-playlist',
      '--no-check-certificates',
      '--retries', '5',
      '--socket-timeout', '20',
      '--force-ipv4',
      '--user-agent', ua,
      '--referer', `https://www.${platform}.com/`,
      ...browserHeaders,
      ...extractorArgs,
      ...cookieArgs,
    ];

    console.log(`[yt-dlp bin] ${YT_DLP_BIN}`);
    const child = spawn(YT_DLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let firstByteSeen = false;

    const ext = format === 'audio' ? 'm4a' : 'mp4';
    const ctype = format === 'audio' ? 'audio/mp4' : 'video/mp4';
    child.stdout.once('data', () => {
      firstByteSeen = true;
      if (!res.headersSent) {
        res.setHeader('Content-Type', ctype);
        res.setHeader('Content-Disposition', `attachment; filename="${filename || 'download'}.${ext}"`);
      }
    });

    child.stdout.pipe(res);

    let stderrBuf = '';
    child.stderr.on('data', (d) => { stderrBuf += d.toString(); });

    child.on('error', (err) => {
      console.error('[yt-dlp spawn error]', err.message);
      if (!res.headersSent) res.status(500).send(`yt-dlp could not start: ${err.message}. Verify the binary at ${YT_DLP_BIN}`);
      else res.end();
    });

    child.on('close', (code) => {
      if (code !== 0 && !firstByteSeen) {
        console.error(`[yt-dlp exited ${code}]`);
        console.error(stderrBuf);
        if (!res.headersSent) {
          // Surface a useful slice of stderr to the user
          const trimmed = stderrBuf.split('\n').filter(l => l.trim()).slice(-3).join(' | ');
          res.status(500).send(`Download failed (yt-dlp exit ${code}): ${trimmed.slice(0, 300) || 'unknown error'}`);
        }
      } else if (code !== 0) {
        console.error(`[yt-dlp exited ${code}] mid-stream`);
      }
    });

    // Kill the child if the client disconnects
    req.on('close', () => {
      if (!child.killed) child.kill('SIGKILL');
    });
  }

  // Endpoint to proxy downloads and force attachment header
  app.get("/api/download", async (req, res) => {
    const { url, filename, source, format } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).send("URL required");

    const fmt: 'video' | 'audio' | 'image' =
      format === 'audio' ? 'audio' : format === 'image' ? 'image' : 'video';
    const ytdlpFmt: 'video' | 'audio' = fmt === 'audio' ? 'audio' : 'video';
    const fname = typeof filename === 'string' ? filename : undefined;

    // If we have a source page URL on a hard-CDN platform, skip the axios attempt entirely.
    if (typeof source === 'string' && source && fmt !== 'image') {
      const sourcePlatform = detectPlatform(source);

      // TikTok: try the public tikwm.com API first (yt-dlp's TikTok extractor breaks frequently)
      if (sourcePlatform === 'tiktok') {
        const ok = await streamFromTikwm(source, fname, ytdlpFmt, res);
        if (ok) return;
        console.log('[tiktok] tikwm failed, falling back to yt-dlp');
        return streamViaYtDlp(source, fname, req, res, ytdlpFmt);
      }

      if (HARD_CDN_PLATFORMS.has(sourcePlatform)) {
        return streamViaYtDlp(source, fname, req, res, ytdlpFmt);
      }
    }

    // Pass-through Range header from the browser when present (resumable / partial downloads)
    const clientRange = req.headers.range;

    try {
      const headers = buildHeadersFor(url);
      if (clientRange) headers['Range'] = clientRange;

      const response = await axios({
        method: 'get',
        url,
        responseType: 'stream',
        headers,
        timeout: 30000,
        maxRedirects: 10,
        validateStatus: (status) => status < 400,
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
      const safeFilename = fname ? `${fname}.${extension}` : `download.${extension}`;

      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      if (contentType) res.setHeader('Content-Type', contentType);
      if (response.headers['content-length']) res.setHeader('Content-Length', String(response.headers['content-length']));
      // Mirror upstream status code (200 or 206 for partial)
      res.status(response.status);

      response.data.pipe(res);
    } catch (error: any) {
      console.error("Proxy download failed:", error.message, "status:", error.response?.status);

      // Single retry for 403 with a different UA combination (some CDNs flap)
      if (error.response?.status === 403) {
        try {
          const headers = buildHeadersFor(url);
          headers['User-Agent'] = headers['User-Agent'] === IOS_UA ? DESKTOP_UA : IOS_UA;
          if (clientRange) headers['Range'] = clientRange;

          const retry = await axios({
            method: 'get',
            url,
            responseType: 'stream',
            headers,
            timeout: 30000,
            maxRedirects: 10,
            validateStatus: (s) => s < 400,
          });
          const contentType = retry.headers['content-type'] as string | undefined;
          const ext = contentType?.split('/')[1]?.split(';')[0] || 'mp4';
          res.setHeader('Content-Disposition', `attachment; filename="${fname || 'download'}.${ext}"`);
          if (contentType) res.setHeader('Content-Type', contentType);
          if (retry.headers['content-length']) res.setHeader('Content-Length', String(retry.headers['content-length']));
          res.status(retry.status);
          return retry.data.pipe(res);
        } catch (retryErr: any) {
          console.error("Retry also failed:", retryErr.message);
          // Last resort: if we have a source page URL, stream via yt-dlp
          if (typeof source === 'string' && source) {
            console.log('[fallback] streaming via yt-dlp after axios 403');
            return streamViaYtDlp(source, fname, req, res, ytdlpFmt);
          }
          return res.status(403).send("This media link expired or is rate-limited. Re-paste the original page link to refresh it.");
        }
      }

      // Generic 5xx fallback: try yt-dlp if we have source
      if (typeof source === 'string' && source) {
        console.log('[fallback] streaming via yt-dlp after axios error');
        return streamViaYtDlp(source, fname, req, res, ytdlpFmt);
      }
      res.status(500).send("Failed to gateway download. You might need to open the link directly.");
    }
  });

  // List of supported platforms (for the UI)
  app.get("/api/platforms", (_req, res) => {
    res.json({
      platforms: PLATFORM_PATTERNS.map(p => p.key)
    });
  });

  // API Route for extraction
  app.post("/api/extract", async (req, res) => {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    const detectedPlatform = detectPlatform(url);
    console.log(`Attempting extraction for: ${url} (platform: ${detectedPlatform})`);

    try {
      // Use youtube-dl-exec which uses yt-dlp binary
      let info: any;
      try {
        info = await youtubedl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          noWarnings: true,
          preferFreeFormats: true,
          // Advanced flags to bypass bot detection and improve format selection
          extractorArgs: 'youtube:player_client=web_creator,mweb,android;twitter:api_key=default',
          addHeader: [
            'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'accept-language:en-US,en;q=0.9',
            'sec-ch-ua:"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            'sec-ch-ua-mobile:?0',
            'sec-ch-ua-platform:"Windows"',
          ]
        } as any) as any;
      } catch (e: any) {
        console.warn("youtube-dl extraction failed, trying fallback:", e.message);
        
        // Specialized Twitter fallback using fxtwitter and vxtwitter APIs
        if (url.includes("x.com") || url.includes("twitter.com")) {
          const tweetId = url.match(/\/status\/(\d+)/)?.[1];
          if (tweetId) {
            // Priority 1: fxtwitter
            try {
              const fxResponse = await axios.get(`https://api.fxtwitter.com/status/${tweetId}`, {
                timeout: 5000,
                headers: { 'User-Agent': 'OmniDL/1.0' }
              });
              
              const tweetData = fxResponse.data?.tweet || fxResponse.data;
              if (tweetData?.media?.all && tweetData.media.all.length > 0) {
                const media = tweetData.media.all[0];
                return res.json({
                  platform: "twitter",
                  type: (media.type === 'photo' || media.type === 'image' || media.url.match(/\.(jpg|jpeg|png|webp|gif)/)) ? 'image' : 'video',
                  title: tweetData.text || "Twitter Content",
                  thumbnail: media.thumbnail_url || media.url,
                  downloadUrl: media.url,
                  sourceUrl: url,
                  duration: media.duration ? Math.floor(media.duration) : undefined
                });
              }
            } catch (fxError: any) {
              console.error("Twitter FX Fallback failed:", fxError.message);
            }

            // Priority 2: vxtwitter / cofix (alternative)
            try {
              const vxResponse = await axios.get(`https://api.vxtwitter.com/status/${tweetId}`, {
                timeout: 5000
              });
              
              if (vxResponse.data?.media_urls && vxResponse.data.media_urls.length > 0) {
                const mediaUrl = vxResponse.data.media_urls[0];
                const isVideo = mediaUrl.includes('.mp4') || mediaUrl.includes('video');
                return res.json({
                  platform: "twitter",
                  type: isVideo ? 'video' : 'image',
                  title: vxResponse.data.text || "Twitter Content",
                  thumbnail: mediaUrl,
                  downloadUrl: mediaUrl,
                  sourceUrl: url,
                });
              }
            } catch (vxError: any) {
              console.error("Twitter VX Fallback failed:", vxError.message);
            }
          }
        }
        
        // General Meta-tag Fallback for platforms yt-dlp may struggle with
        if (META_FALLBACK_PLATFORMS.includes(detectedPlatform)) {
          console.log(`Attempting meta-tag scraping fallback for ${detectedPlatform}...`);
          const fallbackResult = await metaTagFallback(url, detectedPlatform);
          if (fallbackResult) {
            console.log(`Fallback found content via scraping: ${fallbackResult.type}`);
            return res.json(fallbackResult);
          }
        }
        throw e;
      }

      if (!info) {
        throw new Error("No data returned from extractor");
      }

      const title = info.title || "Social Media Content";
      const thumbnail = info.thumbnail || (info.thumbnails && info.thumbnails.length > 0 ? info.thumbnails[0].url : "");
      let downloadUrl = info.url;
      
      if (!downloadUrl && info.formats && info.formats.length > 0) {
        const combinedFormats = info.formats.filter((f: any) => 
          f.vcodec !== 'none' && f.acodec !== 'none' && f.url && !f.url.includes('manifest')
        );

        if (combinedFormats.length > 0) {
          combinedFormats.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
          downloadUrl = combinedFormats[0].url;
        } else {
          const anyFormat = info.formats.filter((f: any) => f.url && !f.url.includes('manifest'));
          if (anyFormat.length > 0) {
             anyFormat.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
             downloadUrl = anyFormat[0].url;
          }
        }
      }

      if (!downloadUrl && info.requested_formats && info.requested_formats.length > 0) {
        const bestReq = info.requested_formats.find((f: any) => f.vcodec !== 'none' && f.acodec !== 'none') || info.requested_formats[0];
        downloadUrl = bestReq.url;
      }

      if (!downloadUrl) {
          throw new Error("Could not find a direct download link.");
      }

      return res.json({
        platform: detectedPlatform !== 'unknown' ? detectedPlatform : (info.extractor_key || info.extractor || "unknown"),
        type: info.vcodec === 'none' && !info.formats?.some((f:any) => f.vcodec !== 'none') ? 'image' : 'video',
        title,
        thumbnail,
        downloadUrl,
        sourceUrl: url, // original page URL — used for yt-dlp streaming fallback on hard-CDN platforms
        duration: info.duration,
      });

    } catch (error: any) {
      console.error("Extraction error:", error.message);
      
      let clientMsg = "Failed to extract media. The link might be private, restricted, or the service is temporarily blocked.";
      
      if (error.message.includes("Sign in to confirm you’re not a bot")) {
        clientMsg = "YouTube detected bot-like behavior. This is common on cloud servers. Try a different platform or try again later.";
      } else if (error.message.includes("Unsupported URL")) {
        clientMsg = "This platform is not currently supported or the URL is invalid.";
      }

      return res.status(500).json({ error: clientMsg });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Fallback for SPA in dev
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = await fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Critical server startup error:", err);
  process.exit(1);
});
