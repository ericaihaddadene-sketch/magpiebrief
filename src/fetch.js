// Feed fetching with on-disk conditional-GET caching.
//
// Being a good citizen matters here: this hits other people's servers every
// build. We send ETag / If-Modified-Since so a publisher that hasn't posted
// anything new answers with a 304 and no body, and we identify ourselves with
// a real User-Agent that links back to the site.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const CACHE_DIR = '.cache';

const cacheKey = (url) => createHash('sha1').update(url).digest('hex').slice(0, 16);
const cachePath = (url) => path.join(CACHE_DIR, cacheKey(url) + '.json');

async function readCache(url) {
  try {
    return JSON.parse(await readFile(cachePath(url), 'utf8'));
  } catch {
    return null;
  }
}

async function writeCache(url, entry) {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cachePath(url), JSON.stringify(entry), 'utf8');
  } catch {
    // A cache write failure must never fail a build.
  }
}

/**
 * Fetch one feed. Never throws — failures come back as { ok:false, error }
 * so one dead feed can't take down the whole site.
 */
export async function fetchFeed(url, { timeoutMs = 12000, retries = 1, userAgent = 'NewswireBot/1.0' } = {}) {
  const started = Date.now();
  const cached = await readCache(url);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = {
        'user-agent': userAgent,
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        'accept-encoding': 'gzip, deflate'
      };
      if (cached?.etag) headers['if-none-match'] = cached.etag;
      if (cached?.lastModified) headers['if-modified-since'] = cached.lastModified;

      const res = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });

      if (res.status === 304 && cached?.body) {
        return { ok: true, status: 304, body: cached.body, fromCache: true, ms: Date.now() - started };
      }

      if (!res.ok) {
        // 5xx is worth one retry; 4xx is a real answer, don't hammer them.
        if (res.status >= 500 && attempt < retries) continue;
        if (cached?.body) {
          return { ok: true, status: res.status, body: cached.body, fromCache: true, stale: true, ms: Date.now() - started };
        }
        return { ok: false, status: res.status, error: `HTTP ${res.status}`, ms: Date.now() - started };
      }

      const body = await res.text();
      await writeCache(url, {
        etag: res.headers.get('etag') || null,
        lastModified: res.headers.get('last-modified') || null,
        fetchedAt: new Date().toISOString(),
        body
      });
      return { ok: true, status: res.status, body, fromCache: false, ms: Date.now() - started };
    } catch (err) {
      const isLast = attempt === retries;
      if (!isLast) continue;
      // Network died but we have an old copy — better a stale site than a blank one.
      if (cached?.body) {
        return { ok: true, status: 0, body: cached.body, fromCache: true, stale: true, ms: Date.now() - started };
      }
      const reason = err?.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : (err?.message || String(err));
      return { ok: false, status: 0, error: reason, ms: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: 0, error: 'exhausted retries', ms: Date.now() - started };
}

/** Run async tasks with a bounded number in flight. */
export async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}
