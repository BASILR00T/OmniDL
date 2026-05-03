import React, { useState } from 'react';
import {
  Download, Link as LinkIcon, Loader2, ArrowRight,
  Check, AlertCircle, ChevronDown, Copy, ExternalLink, X, Play,
  Sparkles, Video, Music, Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PlatformIcon, platformList, platformLabels } from './components/PlatformIcons';

interface ExtractionResult {
  platform: string;
  type: 'video' | 'image';
  title: string;
  thumbnail?: string;
  downloadUrl: string;
  sourceUrl?: string;
  duration?: number;
}

export default function App() {
  const [url, setUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPlatforms, setShowPlatforms] = useState(true);
  const [selectedFormat, setSelectedFormat] = useState<'video' | 'audio' | 'image'>('video');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text);
    } catch { /* ignore */ }
  };

  // Sanitize a title into a valid filename — keep spaces, strip only invalid OS chars
  const sanitizeFilename = (title: string) => {
    return title
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // strip Windows-invalid
      .replace(/\s+/g, ' ')                   // collapse whitespace
      .trim()
      .substring(0, 80) || 'download';
  };

  const proxyUrl = (mediaUrl: string, title: string, sourceUrl?: string, format?: string) => {
    const safe = sanitizeFilename(title);
    let q = `/api/download?url=${encodeURIComponent(mediaUrl)}&filename=${encodeURIComponent(safe)}`;
    if (sourceUrl) q += `&source=${encodeURIComponent(sourceUrl)}`;
    if (format) q += `&format=${format}`;
    return q;
  };

  const extract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || isExtracting) return;
    setIsExtracting(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to extract media');
      setResult(data);
      setSelectedFormat(data.type === 'image' ? 'image' : 'video');
      setShowPlatforms(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setUrl('');
    setShowPlatforms(true);
  };

  const fmtDuration = (s?: number) => {
    if (!s) return null;
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen w-full text-[var(--color-text)]">
      <div className="max-w-md md:max-w-2xl lg:max-w-3xl mx-auto px-5 md:px-8 pt-[max(env(safe-area-inset-top),28px)] md:pt-16 pb-16">

        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center justify-between mb-10 md:mb-14 pt-2"
        >
          <div className="flex items-center gap-2.5">
            <div className="relative w-8 h-8 rounded-xl bg-gradient-to-br from-[#8E73FF] to-[#6B4DFA] flex items-center justify-center shadow-[0_4px_16px_-4px_rgba(124,92,255,0.5)]">
              <Sparkles className="w-4 h-4 text-white" strokeWidth={2.5} fill="white" />
            </div>
            <div>
              <div className="text-[15px] font-semibold tracking-[-0.01em] leading-none">OmniDL</div>
              <div className="text-[10px] font-medium text-[var(--color-text-tertiary)] mt-0.5">Universal Downloader</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)]">
            <div className="relative">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <div className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping opacity-60" />
            </div>
            <span className="text-[10px] font-medium text-[var(--color-text-secondary)] tracking-wide">Online</span>
          </div>
        </motion.header>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="mb-7 md:mb-10"
        >
          <h1 className="text-[34px] md:text-[56px] lg:text-[64px] font-semibold leading-[1.02] tracking-[-0.04em] text-[var(--color-text)]">
            Save anything,<br/>
            <span className="bg-clip-text text-transparent bg-gradient-to-br from-[#A99CFF] via-[#8E73FF] to-[#6B4DFA]">
              from anywhere.
            </span>
          </h1>
          <p className="text-[14px] md:text-[17px] text-[var(--color-text-secondary)] mt-3 md:mt-5 leading-relaxed max-w-xl">
            Paste a link from any of 12 supported platforms. We'll do the rest — fast, free, no sign-up.
          </p>
        </motion.div>

        {/* Input */}
        <motion.form
          onSubmit={extract}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mb-3"
        >
          <div className="shimmer-border relative rounded-2xl md:rounded-[20px] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)]/40 transition-colors">
            <div className="flex items-center pl-4 md:pl-5 pr-1.5 md:pr-2 py-1.5 md:py-2">
              <LinkIcon className={`w-[18px] h-[18px] md:w-5 md:h-5 mr-3 md:mr-3.5 shrink-0 transition-colors ${
                result ? 'text-emerald-400' : error ? 'text-red-400' : url ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-tertiary)]'
              }`} strokeWidth={2.2} />
              <input
                type="text"
                inputMode="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); if (error) setError(null); }}
                placeholder="Paste a link from YouTube, TikTok, Instagram…"
                className="flex-1 bg-transparent text-[15px] md:text-[16px] font-medium text-[var(--color-text)] placeholder-[var(--color-text-tertiary)] focus:outline-none min-w-0 py-2 md:py-3"
                autoComplete="off" autoCorrect="off" spellCheck={false}
              />
              {!url && (
                <button
                  type="button" onClick={handlePaste}
                  className="text-[12px] md:text-[13px] text-[var(--color-text-secondary)] font-medium px-3 md:px-4 py-2 md:py-2.5 mr-1 rounded-lg hover:bg-white/5 transition-colors"
                >
                  Paste
                </button>
              )}
              {url && (
                <button
                  type="button" onClick={() => setUrl('')}
                  className="w-7 h-7 md:w-8 md:h-8 mr-1 rounded-lg flex items-center justify-center text-[var(--color-text-tertiary)] hover:bg-white/5 hover:text-[var(--color-text-secondary)] transition-colors"
                  aria-label="Clear"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                disabled={!url || isExtracting}
                className="btn-primary w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-[14px] flex items-center justify-center shrink-0"
                aria-label="Extract"
              >
                {isExtracting
                  ? <Loader2 className="w-[18px] h-[18px] md:w-5 md:h-5 animate-spin" />
                  : <ArrowRight className="w-[18px] h-[18px] md:w-5 md:h-5" strokeWidth={2.5} />}
              </button>
            </div>
          </div>
        </motion.form>

        {/* Quick examples */}
        {!url && !result && !isExtracting && !error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-2 mb-6 px-1"
          >
            <span className="text-[11px] text-[var(--color-text-tertiary)] font-medium">Try:</span>
            {(['youtube', 'tiktok', 'twitter'] as const).map((p) => (
              <div key={p} className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-tertiary)]">
                <PlatformIcon platform={p} size={11} className={p === 'tiktok' || p === 'twitter' ? 'text-[var(--color-text-secondary)]' : ''} />
                <span>{platformLabels[p]}</span>
              </div>
            ))}
          </motion.div>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-start gap-3 bg-red-500/[0.06] border border-red-500/20 rounded-2xl p-3.5 mb-5 mt-3"
            >
              <div className="w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0 mt-0.5">
                <AlertCircle className="w-4 h-4 text-red-400" strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-red-300 mb-0.5">Couldn't extract</p>
                <p className="text-[12.5px] text-red-300/70 leading-snug">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-red-400/50 hover:text-red-400 -mr-1 -mt-1 p-1">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading skeleton */}
        <AnimatePresence>
          {isExtracting && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="glass rounded-3xl overflow-hidden mb-5 mt-4"
            >
              <div className="aspect-video skeleton flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-6 h-6 text-[var(--color-accent)] animate-spin" />
                  <span className="text-[11px] text-[var(--color-text-tertiary)] font-medium tracking-wide">Extracting…</span>
                </div>
              </div>
              <div className="p-4 space-y-2.5">
                <div className="h-3.5 rounded-full skeleton w-3/4" />
                <div className="h-2.5 rounded-full skeleton w-1/3" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result card */}
        <AnimatePresence>
          {result && !isExtracting && (
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: 'spring', damping: 24, stiffness: 260 }}
              className="glass rounded-3xl overflow-hidden mb-6 mt-4"
            >
              <div className="relative aspect-video bg-[var(--color-bg-elevated)] overflow-hidden">
                {result.thumbnail ? (
                  <>
                    <img src={result.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <PlatformIcon platform={result.platform} size={56} className="opacity-30" />
                  </div>
                )}
                {result.type === 'video' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-14 h-14 rounded-full bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-2xl">
                      <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                    </div>
                  </div>
                )}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/55 backdrop-blur-md rounded-full pl-1.5 pr-2.5 py-1 border border-white/10">
                  <PlatformIcon platform={result.platform} size={13} className="shrink-0" />
                  <span className="text-[10.5px] font-semibold text-white tracking-wide capitalize">{result.platform}</span>
                </div>
                {fmtDuration(result.duration) && (
                  <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[11px] font-mono font-medium text-white tabular-nums">
                    {fmtDuration(result.duration)}
                  </div>
                )}
              </div>

              <div className="p-4 md:p-6">
                <div className="flex items-center gap-2 mb-2 md:mb-3">
                  <span className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]">{result.type}</span>
                  <span className="w-1 h-1 rounded-full bg-[var(--color-text-quaternary)]" />
                  <span className="text-[10px] md:text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" strokeWidth={3} /> Ready
                  </span>
                </div>
                <h3 className="text-[15px] md:text-[19px] font-semibold text-[var(--color-text)] leading-snug line-clamp-2 mb-4 md:mb-5 tracking-[-0.015em]">{result.title}</h3>

                {/* Format selector — only shown for video content */}
                {result.type === 'video' && (
                  <div className="flex gap-1.5 mb-3 p-1 bg-[var(--color-bg-elevated)] rounded-xl border border-[var(--color-border)]">
                    {([
                      { id: 'video' as const, label: 'Video', icon: Video, hint: 'MP4' },
                      { id: 'audio' as const, label: 'Audio', icon: Music, hint: 'MP3' },
                    ]).map(({ id, label, icon: Icon, hint }) => (
                      <button
                        key={id}
                        onClick={() => setSelectedFormat(id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 md:py-2.5 rounded-lg text-[12.5px] md:text-[13px] font-medium transition-all ${
                          selectedFormat === id
                            ? 'bg-[var(--color-bg-card)] text-[var(--color-text)] shadow-sm border border-[var(--color-border-strong)]'
                            : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                        }`}
                      >
                        <Icon className="w-[14px] h-[14px]" strokeWidth={2.2} />
                        {label}
                        <span className="text-[9.5px] font-mono opacity-60 ml-0.5">{hint}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 md:gap-2.5">
                  <a
                    href={proxyUrl(result.downloadUrl, result.title, result.sourceUrl, selectedFormat)}
                    className="btn-primary flex-1 h-11 md:h-12 rounded-xl flex items-center justify-center gap-2 text-[13.5px] md:text-[14.5px]"
                  >
                    {selectedFormat === 'audio'
                      ? <Music className="w-4 h-4 md:w-[18px] md:h-[18px]" strokeWidth={2.4} />
                      : selectedFormat === 'image'
                      ? <ImageIcon className="w-4 h-4 md:w-[18px] md:h-[18px]" strokeWidth={2.4} />
                      : <Download className="w-4 h-4 md:w-[18px] md:h-[18px]" strokeWidth={2.4} />}
                    {selectedFormat === 'audio' ? 'Save Audio' : selectedFormat === 'image' ? 'Save Image' : 'Save Video'}
                  </a>
                  <button
                    onClick={() => copyToClipboard(result.sourceUrl || result.downloadUrl)}
                    className="btn-secondary w-11 h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center"
                    aria-label="Copy original link"
                    title="Copy original link"
                  >
                    {copied
                      ? <Check className="w-[17px] h-[17px] md:w-5 md:h-5 text-emerald-400" strokeWidth={2.5} />
                      : <Copy className="w-[16px] h-[16px] md:w-[18px] md:h-[18px]" strokeWidth={2} />}
                  </button>
                  <a
                    href={result.sourceUrl || result.downloadUrl}
                    target="_blank" rel="noopener noreferrer"
                    className="btn-secondary w-11 h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center"
                    aria-label="Open original post"
                    title="Open original post"
                  >
                    <ExternalLink className="w-[16px] h-[16px] md:w-[18px] md:h-[18px]" strokeWidth={2} />
                  </a>
                </div>
                <button
                  onClick={reset}
                  className="w-full mt-3 md:mt-4 py-2 text-[12px] md:text-[13px] text-[var(--color-text-tertiary)] font-medium hover:text-[var(--color-text-secondary)] transition-colors"
                >
                  Download another
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Supported platforms dropdown */}
        <motion.details
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          open={showPlatforms}
          onToggle={(e) => setShowPlatforms((e.target as HTMLDetailsElement).open)}
          className="glass rounded-2xl overflow-hidden"
        >
          <summary className="flex items-center justify-between px-4 md:px-5 py-3.5 md:py-4 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {(['youtube', 'tiktok', 'instagram', 'twitter'] as const).map((p) => (
                  <div key={p} className="w-6 h-6 rounded-full bg-[var(--color-bg-card)] ring-2 ring-[var(--color-bg)] flex items-center justify-center">
                    <PlatformIcon platform={p} size={14} className={p === 'tiktok' || p === 'twitter' ? 'text-white' : ''} />
                  </div>
                ))}
              </div>
              <div>
                <div className="text-[13px] font-semibold text-[var(--color-text)]">12 platforms</div>
                <div className="text-[10.5px] text-[var(--color-text-tertiary)] mt-0.5">Tap to view all</div>
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-[var(--color-text-tertiary)] transition-transform duration-200 ${showPlatforms ? 'rotate-180' : ''}`}
              strokeWidth={2.4}
            />
          </summary>
          <div className="border-t border-[var(--color-border)] px-3 md:px-5 py-4 md:py-6">
            <div className="grid grid-cols-4 md:grid-cols-6 gap-1 md:gap-2">
              {platformList.map((p, i) => (
                <motion.div
                  key={p}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: showPlatforms ? i * 0.025 : 0, duration: 0.3 }}
                  className="flex flex-col items-center gap-2 md:gap-2.5 py-2.5 md:py-3.5 rounded-xl hover:bg-white/[0.03] transition-colors cursor-default"
                >
                  <div className={`w-9 h-9 md:w-11 md:h-11 flex items-center justify-center ${
                    p === 'tiktok' || p === 'twitter' || p === 'threads' ? 'text-white' : ''
                  }`}>
                    <PlatformIcon platform={p} size={28} />
                  </div>
                  <span className="text-[10px] md:text-[11px] text-[var(--color-text-secondary)] font-medium">{platformLabels[p]}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.details>

        {/* Footer */}
        <p className="text-center text-[10.5px] text-[var(--color-text-quaternary)] mt-8 font-medium tracking-wide">
          v3.0 · Powered by yt-dlp
        </p>
      </div>
    </div>
  );
}
