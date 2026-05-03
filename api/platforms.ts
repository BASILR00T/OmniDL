import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PLATFORM_PATTERNS } from '../lib/platforms';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.json({ platforms: PLATFORM_PATTERNS.map(p => p.key) });
}
