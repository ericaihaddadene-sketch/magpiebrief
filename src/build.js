// Build entry point: fetch -> parse -> rank -> render -> write dist/
//
// Design rule: a build must never fail because of someone else's server. Dead
// feeds are reported loudly and skipped; the site still ships.

import { mkdir, writeFile, readFile, rm, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import * as cfgModule from '../config.js';
import { parseFeed } from './feed-parser.js';
import { fetchFeed, pool } from './fetch.js';
import { rankStories } from './rank.js';
import {
  renderIndex, renderSection, renderAdvertise, renderAbout,
  renderArchiveDay, renderArchiveIndex,
  renderFeedXml, renderSitemap, renderRobots, renderAdsTxt,
  slugify, hostOf, dayPath
} from './render.js';
import { updateArchive, loadAll } from './archive.js';

const OUT = 'dist';
const cfg = {
  site: cfgModule.site,
  ranking: cfgModule.ranking,
  advertising: cfgModule.advertising,
  adNetwork: cfgModule.adNetwork,
  fetching: cfgModule.fetching
};

const gray = (s) => `\x1b[90m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

async function writePage(relPath, html) {
  const full = path.join(OUT, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, html, 'utf8');
}

async function copyDir(from, to) {
  let entries = [];
  try {
    entries = await readdir(from, { withFileTypes: true });
  } catch {
    return 0;
  }
  await mkdir(to, { recursive: true });
  let n = 0;
  for (const e of entries) {
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) n += await copyDir(src, dst);
    else { await copyFile(src, dst); n++; }
  }
  return n;
}

async function main() {
  const t0 = Date.now();
  const packName = cfgModule.activePack;
  const feeds = cfgModule.feedPacks[packName];
  if (!feeds?.length) {
    console.error(red(`No feeds found for pack "${packName}". Check activePack in config.js.`));
    process.exit(1);
  }

  let ads = { slots: {} };
  try {
    ads = JSON.parse(await readFile('ads.json', 'utf8'));
  } catch (err) {
    console.log(yellow(`! ads.json unreadable (${err.message}) — running with empty inventory`));
  }

  console.log(bold(`\n${cfg.site.name}`) + gray(` — pack "${packName}", ${feeds.length} feeds\n`));

  // ---- fetch -------------------------------------------------------------
  const results = await pool(feeds, cfg.fetching.concurrency, async (feed) => {
    const res = await fetchFeed(feed.url, {
      timeoutMs: cfg.fetching.timeoutMs,
      retries: cfg.fetching.retries,
      userAgent: cfg.fetching.userAgent
    });
    const items = res.ok ? parseFeed(res.body) : [];
    return { feed, res, items };
  });

  // ---- report + flatten --------------------------------------------------
  const all = [];
  let okCount = 0;
  const failures = [];

  for (const { feed, res, items } of results) {
    if (!res.ok) {
      failures.push({ feed, error: res.error });
      console.log(`  ${red('✗')} ${feed.name.padEnd(20)} ${gray(res.error)}`);
      continue;
    }
    if (items.length === 0) {
      // Not necessarily broken: some feeds legitimately go empty (arXiv skips
      // weekends). Worth flagging, but distinct from a fetch failure.
      failures.push({ feed, error: 'HTTP 200 but no items — feed may be empty or not RSS/Atom' });
      console.log(`  ${yellow('!')} ${feed.name.padEnd(21)} ${gray('responded, but contained no items')}`);
      continue;
    }
    okCount++;
    const tag = res.fromCache ? gray(res.stale ? ' (stale cache)' : ' (304 cached)') : '';
    console.log(`  ${green('✓')} ${feed.name.padEnd(20)} ${String(items.length).padStart(3)} items ${gray(res.ms + 'ms')}${tag}`);
    for (const it of items) {
      all.push({
        ...it,
        source: feed.name,
        section: feed.section,
        sourceWeight: feed.weight ?? 1,
        broad: feed.broad === true
      });
    }
  }

  if (all.length === 0) {
    console.error(red('\nNo items from any feed. Not writing an empty site.'));
    process.exit(1);
  }

  // ---- rank --------------------------------------------------------------
  const now = Date.now();
  const ranked = rankStories(all, cfg.ranking, now);

  const sections = [];
  for (const f of feeds) if (f.section && !sections.includes(f.section)) sections.push(f.section);

  // Count what actually reached the site, not how big each feed was. An archive
  // feed can carry 1,000+ entries while contributing two stories today, and
  // showing the raw number in the sidebar is just wrong.
  const publishedCounts = new Map();
  const bump = (name) => publishedCounts.set(name, (publishedCounts.get(name) || 0) + 1);
  for (const s of ranked) {
    bump(s.source);
    for (const r of s.related || []) bump(r.source);
  }

  const sources = feeds
    .map((f) => ({ name: f.name, host: hostOf(f.url), count: publishedCounts.get(f.name) || 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const buildTime = new Date().toLocaleString(cfg.site.locale || 'en-US', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC'
  }) + ' UTC';

  // ---- render ------------------------------------------------------------
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const front = ranked.slice(0, cfg.ranking.frontPageLimit);
  await writePage('index.html', renderIndex(cfg, ads, { stories: front, sections, sources, buildTime, now }));

  for (const section of sections) {
    const stories = ranked.filter((s) => s.section === section).slice(0, cfg.ranking.perSectionLimit);
    await writePage(path.join(slugify(section), 'index.html'),
      renderSection(cfg, ads, { section, stories, sections, sources, buildTime, now }));
  }

  await writePage('advertise/index.html',
    renderAdvertise(cfg, ads, { sections, buildTime, stats: { feedCount: okCount } }));
  await writePage('about/index.html',
    renderAbout(cfg, ads, { sections, buildTime, sources }));

  // ---- archive -----------------------------------------------------------
  // Fold this run into the durable archive, then render every day we hold.
  const changedDays = await updateArchive(ranked);
  const archive = await loadAll();

  for (let i = 0; i < archive.length; i++) {
    const record = archive[i];
    // archive is newest-first, so the *next* day chronologically is at i-1.
    await writePage(path.join(dayPath(record.date).replace(/^\/|\/$/g, ''), 'index.html'),
      renderArchiveDay(cfg, ads, {
        record,
        prev: archive[i + 1]?.date || null,
        next: archive[i - 1]?.date || null,
        sections,
        buildTime
      }));
  }
  await writePage('archive/index.html',
    renderArchiveIndex(cfg, ads, { days: archive, sections, buildTime }));

  await writePage('feed.xml', renderFeedXml(cfg, ranked));
  await writePage('sitemap.xml', renderSitemap(cfg, sections, archive.map((d) => d.date)));
  await writePage('robots.txt', renderRobots(cfg));
  await writePage('ads.txt', renderAdsTxt(cfg));

  const copied = await copyDir('public', OUT);

  // ---- summary -----------------------------------------------------------
  const clustered = ranked.reduce((n, s) => n + (s.related?.length || 0), 0);
  console.log('');
  console.log(`  ${bold('Sources')}    ${okCount}/${feeds.length} healthy${failures.length ? red(`, ${failures.length} failing`) : ''}`);
  console.log(`  ${bold('Items')}      ${all.length} fetched → ${ranked.length} unique (${clustered} folded into clusters)`);
  console.log(`  ${bold('Pages')}      ${sections.length + 4 + archive.length} html + feed.xml, sitemap.xml, robots.txt, ads.txt${copied ? `, ${copied} asset(s)` : ''}`);
  console.log(`  ${bold('Archive')}    ${archive.length} day(s) held${changedDays.length ? `, ${changedDays.length} updated this run (${changedDays.join(', ')})` : ', none changed this run'}`);
  console.log(`  ${bold('Sections')}   ${sections.join(', ')}`);
  console.log(`  ${bold('Built in')}   ${Date.now() - t0}ms → ${OUT}/\n`);

  // The contact address is published as a mailto: on /advertise, so a forgotten
  // placeholder means enquiries go nowhere. Cheap to check, expensive to miss.
  if (/example\.com$|yourdomain\.com$/i.test(cfg.site.contactEmail || '')) {
    console.log(yellow(`  ! site.contactEmail is still a placeholder (${cfg.site.contactEmail})`));
    console.log(gray('    /advertise links to it — set a real address before promoting the site.\n'));
  }

  if (failures.length) {
    console.log(yellow('  Failing feeds (remove or fix them in config.js):'));
    for (const f of failures) console.log(gray(`    ${f.feed.name} — ${f.feed.url}\n      ${f.error}`));
    console.log('');
  }
}

main().catch((err) => {
  console.error(red('\nBuild failed:'), err);
  process.exit(1);
});
