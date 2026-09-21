/**
 * RepoVerse analysis API.
 *
 * In development this runs beside Vite (which proxies /api here). In production
 * the same process also serves the built SPA from `dist/`.
 */

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeRouter } from './routes/analyze';
import { config } from './config';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));

// The API is same-origin in production; CORS is only needed for the Vite dev
// server, so it is scoped to local origins.
app.use(
  cors({
    origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
  }),
);

/** Coarse per-IP throttle so one client cannot exhaust the GitHub quota. */
const buckets = new Map<string, { tokens: number; updatedAt: number }>();
const RATE_CAPACITY = 30;
const RATE_REFILL_PER_SEC = 0.5;

app.use('/api', (req, res, next) => {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const bucket = buckets.get(ip) ?? { tokens: RATE_CAPACITY, updatedAt: now };
  const elapsedSec = (now - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(RATE_CAPACITY, bucket.tokens + elapsedSec * RATE_REFILL_PER_SEC);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) {
    buckets.set(ip, bucket);
    res.status(429).json({
      error: { code: 'rate-limited', message: 'Too many analysis requests from this client. Try again in a moment.' },
    });
    return;
  }
  bucket.tokens -= 1;
  buckets.set(ip, bucket);
  next();
});

app.use('/api', analyzeRouter);

if (process.env.NODE_ENV === 'production') {
  const distDir = path.resolve(dirname, '..', 'dist');
  app.use(express.static(distDir, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(config.port, () => {
  const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  console.log(`[repoverse] analysis API listening on http://localhost:${config.port} (${mode})`);
  if (!config.githubToken) {
    console.log('[repoverse] no GITHUB_TOKEN set — GitHub allows 60 unauthenticated requests/hour.');
  }
});
