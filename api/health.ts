import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), runtime: 'vercel' });
}
