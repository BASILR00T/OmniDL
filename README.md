# OmniDL — All-in-One Social Downloader

A modern, mobile-first web app for downloading videos, audio, and images from any major social platform. Built with React 19, Vite, Express, and yt-dlp.

![OmniDL](https://img.shields.io/badge/yt--dlp-nightly-success) ![React](https://img.shields.io/badge/React-19-61dafb) ![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6) ![License](https://img.shields.io/badge/license-MIT-blue)

## Deploy

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2FBASILR00T%2FOmniDL)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FBASILR00T%2FOmniDL)

> **Recommended host: Railway.** It runs the Express server long-form (no timeouts) and includes the yt-dlp Python runtime out of the box. Vercel works for TikTok-only via the tikwm fallback but can't run yt-dlp for the other platforms.

## Supported Platforms

YouTube · TikTok · Instagram · Twitter / X · Facebook · Reddit · Pinterest · Snapchat · LinkedIn · Threads · SoundCloud · Vimeo

## Features

- **Universal extraction** — paste any link, get a direct download
- **Format selection** — Video (MP4) or Audio (MP3 / M4A)
- **Image download** — auto-detects and downloads images with proper extensions
- **Bot-detection bypass** — per-platform header profiles, iOS UA spoofing, Origin/Referer/Sec-Fetch headers
- **TikTok-specific path** — uses the public `tikwm.com` API as the primary source (yt-dlp as fallback) for the most reliable TikTok downloads
- **Hard-CDN handling** — for IP-bound CDNs (TikTok, Instagram, Snapchat, Threads, Facebook), the server streams via yt-dlp from its own IP rather than passing the signed URL to the browser
- **Modern dark UI** — Geist font, glass morphism, premium spacing, responsive desktop/mobile layouts
- **Self-update endpoint** — `POST /api/yt-dlp/update?channel=nightly` to refresh extractors without redeploying

## Stack

- **Frontend:** React 19, Vite 6, Tailwind CSS 4, Motion (Framer Motion fork), Lucide React, Geist
- **Backend:** Express 4, TypeScript, axios, cheerio, youtube-dl-exec (bundled yt-dlp binary)

## Run Locally

**Prerequisites:** Node.js 20+

```bash
git clone https://github.com/BASILR00T/OmniDL.git
cd OmniDL
npm install
npm run dev
```

The app runs at **[http://localhost:3000](http://localhost:3000)** — Express serves both the API and the Vite dev frontend.

## Deployment

### Railway *(recommended — full feature support)*

```bash
1. Visit https://railway.com/new
2. "Deploy from GitHub repo" → select BASILR00T/OmniDL
3. Done. Railway picks up nixpacks.toml automatically:
   - installs Node 20, Python 3, ffmpeg
   - runs `npm install && npm run build`
   - starts with `npm start`
4. Click "Generate Domain" in the service settings to get a public URL
```

Or click the [Deploy on Railway](https://railway.com/new/template?template=https%3A%2F%2Fgithub.com%2FBASILR00T%2FOmniDL) button at the top.

**Optional env vars:**
- `OMNIDL_COOKIES_FROM_BROWSER` — set to `chrome`/`firefox`/`edge` for authenticated downloads (only useful when running locally)
- `PORT` — Railway sets this automatically

### Vercel *(TikTok works fully; others limited)*

```bash
1. Click "Deploy with Vercel" above, or visit https://vercel.com/new
2. Import the BASILR00T/OmniDL repo
3. Vercel uses vercel.json — no extra config needed
```

**Limitations on Vercel:**
- 60s function timeout (10s on Hobby plan) → long videos will fail
- yt-dlp binary doesn't ship with serverless functions → Instagram, Snapchat, Threads, Facebook unsupported
- TikTok works fully via the tikwm.com API path

### Other hosts (Render, Fly.io, self-hosted)

Anything that runs Node 20+ as a long-lived process works. The only requirements are:
- `npm install && npm run build && npm start`
- Python 3 + ffmpeg available in the container (for yt-dlp's audio post-processing)
- Allow outbound HTTPS (yt-dlp + tikwm.com)

## Project Layout

```
.
├── server.ts                    # Express backend: extraction + download proxy + yt-dlp streaming
├── src/
│   ├── App.tsx                  # Main UI — input, result card, format selector, platforms grid
│   ├── components/
│   │   └── PlatformIcons.tsx    # 12 inline brand SVG icons
│   ├── index.css                # Theme tokens + glass / motion styles
│   └── main.tsx                 # React entry
├── index.html                   # HTML shell + Geist font, iOS web-app meta tags
└── package.json
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/extract` | Body `{ url }`. Returns `{ platform, type, title, thumbnail, downloadUrl, sourceUrl, duration }` |
| `GET`  | `/api/download` | Query `?url=&filename=&source=&format=video\|audio\|image`. Streams the file with proper attachment headers |
| `GET`  | `/api/platforms` | Returns the list of supported platform keys |
| `GET`  | `/api/health` | Health check |
| `GET`  | `/api/yt-dlp/version` | Returns the installed yt-dlp version + binary path |
| `POST` | `/api/yt-dlp/update?channel=nightly` | Self-updates yt-dlp from `nightly` / `stable` / `master` |

## How TikTok / Hard-CDN Downloads Work

Most platforms (YouTube, Reddit, Pinterest, etc.) sign their CDN URLs in a way that lets *anyone* fetch the URL. The browser can fetch it directly through the proxy.

**TikTok, Instagram, Snapchat, Threads, and Facebook** sign CDN URLs to the **IP that did the extraction**. If yt-dlp on the server signs a URL, then the browser tries to fetch it via the proxy from a *different* IP, the CDN returns **403 Forbidden** every time — no header tweaks fix this.

**The fix:** for these platforms, the proxy never returns the signed URL to the browser. Instead, it spawns yt-dlp (or hits the tikwm API for TikTok) and streams the bytes through Express. The browser never touches the CDN directly.

## Troubleshooting

**TikTok download fails / "status code 0":**
yt-dlp's TikTok extractor breaks every few weeks. Update yt-dlp:
```bash
curl -X POST http://localhost:3000/api/yt-dlp/update?channel=nightly
```
TikTok also has a tikwm.com fallback that handles most cases automatically.

**Instagram / Snapchat private content:**
Set `OMNIDL_COOKIES_FROM_BROWSER=chrome` (or `firefox`, `edge`, `brave`) in your environment before starting the server. yt-dlp will use your browser's cookies for authenticated requests.

**Some videos return only audio:**
This used to happen with TikTok HD URLs (which require a paid tikwm API key). Fixed in v3 — the app now prefers the standard `play` URL which is full no-watermark video.

## License

MIT — see [LICENSE](LICENSE)

---

Built with [yt-dlp](https://github.com/yt-dlp/yt-dlp) · UI powered by [Geist](https://vercel.com/font) and [Lucide Icons](https://lucide.dev)
