// Feed health check. Run against the active pack, or pass URLs to test
// candidates before adding them to config.js:
//
//   node src/check-feeds.js
//   node src/check-feeds.js https://example.com/feed.xml https://other.com/rss

import * as cfgModule from '../config.js';
import { parseFeed, feedTitle } from './feed-parser.js';
import { fetchFeed, pool } from './fetch.js';

const args = process.argv.slice(2);
const targets = args.length
  ? args.map((url) => ({ name: new URL(url).hostname.replace(/^www\./, ''), url }))
  : cfgModule.feedPacks[cfgModule.activePack];

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const gray = (s) => `\x1b[90m${s}\x1b[0m`;

const results = await pool(targets, 5, async (feed) => {
  const res = await fetchFeed(feed.url, {
    timeoutMs: 15000,
    retries: 1,
    userAgent: cfgModule.fetching.userAgent
  });
  if (!res.ok) return { feed, status: 'fail', detail: res.error };

  const items = parseFeed(res.body);
  if (!items.length) return { feed, status: 'empty', detail: 'HTTP 200 but no items' };

  const dated = items.filter((i) => i.date);
  const newest = dated.length ? new Date(Math.max(...dated.map((i) => i.date.getTime()))) : null;
  const ageH = newest ? (Date.now() - newest.getTime()) / 3_600_000 : Infinity;

  return {
    feed,
    status: ageH > 24 * 14 ? 'stale' : 'ok',
    title: feedTitle(res.body),
    count: items.length,
    dated: dated.length,
    ageH,
    sample: items[0].title
  };
});

console.log('');
for (const r of results) {
  if (r.status === 'fail') {
    console.log(`${red('✗ FAIL ')} ${r.feed.name}\n         ${gray(r.feed.url)}\n         ${gray(r.detail)}`);
  } else if (r.status === 'empty') {
    console.log(`${yellow('! EMPTY')} ${r.feed.name}\n         ${gray(r.feed.url)}\n         ${gray(r.detail)}`);
  } else {
    const mark = r.status === 'stale' ? yellow('! STALE') : green('✓ OK   ');
    const age = r.ageH === Infinity ? 'no dates' : r.ageH < 48 ? `${Math.round(r.ageH)}h old` : `${Math.round(r.ageH / 24)}d old`;
    console.log(`${mark} ${r.feed.name}  ${gray(`${r.count} items, newest ${age}`)}`);
    console.log(`         ${gray(r.feed.url)}`);
    console.log(`         ${gray('"' + (r.sample || '').slice(0, 78) + '"')}`);
  }
}

const ok = results.filter((r) => r.status === 'ok').length;
console.log(`\n${ok}/${results.length} healthy\n`);
