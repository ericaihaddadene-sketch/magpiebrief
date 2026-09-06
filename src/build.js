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
  renderMethodology, renderRights, renderSources,
  renderArchiveDay, renderArchiveIndex,
  renderFeedXml, renderSitemap, renderRobots, renderAdsTxt,
  slugify, hostOf, dayPath
} from './render.js';
import { updateArchive, loadAll, applyPolicyToArchive, readEventMemory, writeEventMemory } from './archive.js';
import {
  buildEvents, scoreImportance, assessConfidence, assessStatus,
  computeDelta, toMemory, sourceKind
} from './events.js';
import { renderBrief, renderEventPage, renderTopicPage, eventPath } from './render-events.js';
import { byId as entityById } from './entities.js';
import { resolveProvenance, trimWords, publisherFromUrl } from './provenance.js';
import { validate } from './policy.js';

const OUT = 'dist';
const cfg = {
  site: cfgModule.site,
  ranking: cfgModule.ranking,
  brief: cfgModule.brief,
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
      const prov = resolveProvenance(it, feed);
      // Conservative by default: a source only gets an excerpt shown if its
      // registry entry says `excerpt: 'feed'`. Anything unreviewed is link-only.
      const excerptPolicy = feed.excerpt === 'feed' ? 'feed' : 'none';
      const budget = feed.excerptWords ?? cfg.ranking.excerptWords ?? 26;
      const record = {
        ...it,
        source: feed.name,
        section: feed.section,
        sourceWeight: feed.weight ?? 1,
        broad: feed.broad === true,
        ...prov,
        excerptPolicy,
        descriptionType: excerptPolicy === 'feed' && it.summary ? 'AUTHORIZED_FEED_SNIPPET' : 'NONE',
        summary: excerptPolicy === 'feed' ? trimWords(it.summary, budget) : ''
      };
      // Classified per item, not per feed: a discussion-site submission linking
      // to openai.com is a primary source we happened to find there.
      record.sourceKind = sourceKind(record, feed);
      all.push(record);
    }
  }

  if (all.length === 0) {
    console.error(red('\nNo items from any feed. Not writing an empty site.'));
    process.exit(1);
  }

  // ---- rank --------------------------------------------------------------
  const now = Date.now();
  const ranked = rankStories(all, cfg.ranking, now);

  // ---- policy gate -------------------------------------------------------
  // Runs before anything is written. A hard violation exits non-zero, so the
  // workflow's deploy step never runs and the bad state cannot reach the site.
  const policy = validate({ stories: ranked, feeds, ads, cfg });

  console.log('');
  console.log(`  ${bold('Rights')}     ${policy.stats.linkOnly} link-only, ${policy.stats.withExcerpt} with authorised excerpt`);
  console.log(`  ${bold('Provenance')} ${policy.stats.distinctPublishers} publishers, ${policy.stats.discoveryAttributed} via discovery venues`);
  console.log(`  ${bold('Top source')} ${policy.stats.topPublisher}`);

  for (const w of policy.warnings) console.log(`  ${yellow('!')} ${w}`);

  if (policy.errors.length) {
    console.error(red(`\n  POLICY FAILURE — ${policy.errors.length} violation(s), refusing to publish:`));
    for (const e of policy.errors.slice(0, 20)) console.error(red(`    · ${e}`));
    if (policy.errors.length > 20) console.error(red(`    … and ${policy.errors.length - 20} more`));
    console.error('');
    process.exit(1);
  }

  const sections = [];
  for (const f of feeds) if (f.section && !sections.includes(f.section)) sections.push(f.section);

  // Slow-publishing sources (lab blogs, alignment forums) can leave a section
  // with nothing inside the freshness window, and a nav tab that leads to an
  // empty page is worse than no tab. Hide those from the nav — but still write
  // the page and keep it in the sitemap, so the URL never starts 404ing just
  // because a quiet week happened.
  const sectionCounts = new Map();
  for (const s of ranked) sectionCounts.set(s.section, (sectionCounts.get(s.section) || 0) + 1);
  const navSections = sections.filter((s) => (sectionCounts.get(s) || 0) > 0);

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

  // ---- event layer -------------------------------------------------------
  // Articles become developments here. Everything below this line is about
  // events; the article list survives only as section pages.
  const memory = await readEventMemory();
  let events = buildEvents(ranked, { dupeThreshold: cfg.ranking.dupeThreshold });

  for (const ev of events) {
    ev.importance = scoreImportance(ev, { now, categoryWeights: cfg.ranking.categoryWeights || {} });
    ev.confidence = assessConfidence(ev);
    const prior = memory[ev.id];
    ev.status = assessStatus(ev, prior, { now });
    ev.firstSeen = prior?.firstSeen || new Date(now).toISOString();
    ev.deltas = computeDelta(ev, prior);
  }

  events = events
    .filter((ev) => ev.importance.score >= cfg.brief.minImportance)
    .sort((a, b) => b.importance.score - a.importance.score);

  const nextMemory = {};
  for (const ev of events) nextMemory[ev.id] = toMemory(ev);
  await writeEventMemory(nextMemory);

  // A factual opening line. Not a synthesised insight — the system has no
  // model to produce one, and inventing an editorial voice it cannot back up
  // would be worse than stating what is measurably true.
  const top = events[0];
  const withPrimary = events.filter((e) => e.primary).length;
  const corroborated = events.filter((e) => e.independentCount >= 2).length;
  const headline = top
    ? `${events.length} developments today. The most significant is ${top.category.name.toLowerCase()}: ${top.title}`
    : 'No developments cleared the importance threshold today.';
  const briefStats = `${okCount} sources monitored · ${all.length} items read · ${ranked.length} on-topic · ${events.length} distinct developments · ${withPrimary} with a primary source · ${corroborated} independently corroborated`;

  // Nav no longer lists article sections: the brief's own modules cover that
  // ground, and tabs labelled by publication type pull the product back toward
  // a feed reader. Those pages still build and stay in the sitemap.
  const briefNav = [];

  await writePage('index.html', renderBrief(cfg, ads, {
    events, headline, stats: briefStats, sections: briefNav, buildTime, now
  }));

  // Living story pages.
  for (const ev of events) {
    const related = events
      .filter((o) => o !== ev && o.entities.some((e) => ev.entities.some((x) => x.id === e.id)))
      .slice(0, 5);
    await writePage(path.join(eventPath(ev.id).replace(/^\/|\/$/g, ''), 'index.html'),
      renderEventPage(cfg, ads, { event: ev, sections: briefNav, buildTime, now, related }));
  }

  // Topic pages, one per entity that actually has developments.
  const byEntity = new Map();
  for (const ev of events) {
    for (const e of ev.entities) {
      if (!byEntity.has(e.id)) byEntity.set(e.id, []);
      byEntity.get(e.id).push(ev);
    }
  }
  for (const [id, evs] of byEntity) {
    const entity = entityById.get(id);
    if (!entity) continue;
    await writePage(path.join('topic', id, 'index.html'),
      renderTopicPage(cfg, ads, { entity, events: evs, sections: briefNav, buildTime, now }));
  }

  const front = ranked.slice(0, cfg.ranking.frontPageLimit);

  for (const section of sections) {
    const stories = ranked.filter((s) => s.section === section).slice(0, cfg.ranking.perSectionLimit);
    await writePage(path.join(slugify(section), 'index.html'),
      renderSection(cfg, ads, { section, stories, sections: navSections, sources, buildTime, now }));
  }

  await writePage('advertise/index.html',
    renderAdvertise(cfg, ads, { sections: navSections, buildTime, stats: { feedCount: okCount } }));
  await writePage('about/index.html',
    renderAbout(cfg, ads, { sections: navSections, buildTime, sources }));

  // Transparency pages, generated from the same registry the pipeline enforces,
  // so what they claim and what the build does cannot drift apart.
  await writePage('methodology/index.html',
    renderMethodology(cfg, ads, { sections: navSections, buildTime, stats: { sourceCount: okCount } }));
  await writePage('rights/index.html',
    renderRights(cfg, ads, { sections: navSections, buildTime }));

  const sourceGroups = [];
  for (const section of sections) {
    const entries = feeds
      .filter((f) => f.section === section)
      .map((f) => ({
        name: f.name,
        host: hostOf(f.url),
        role: f.role || 'publisher',
        excerpt: f.excerpt === 'feed' ? 'feed' : 'none',
        count: publishedCounts.get(f.name) || 0
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    if (entries.length) sourceGroups.push({ section, entries });
  }
  await writePage('sources/index.html',
    renderSources(cfg, ads, { groups: sourceGroups, sections: navSections, buildTime }));

  // ---- archive -----------------------------------------------------------
  // Fold this run into the durable archive, then render every day we hold.
  const changedDays = await updateArchive(ranked);
  // Re-apply the current rights policy to everything already stored, so a
  // publisher's request reaches last week's material and not just today's.
  const migrated = await applyPolicyToArchive(feeds, cfg, { publisherFromUrl, trimWords });
  const archive = await loadAll();

  for (let i = 0; i < archive.length; i++) {
    const record = archive[i];
    // archive is newest-first, so the *next* day chronologically is at i-1.
    await writePage(path.join(dayPath(record.date).replace(/^\/|\/$/g, ''), 'index.html'),
      renderArchiveDay(cfg, ads, {
        record,
        prev: archive[i + 1]?.date || null,
        next: archive[i - 1]?.date || null,
        sections: navSections,
        buildTime
      }));
  }
  await writePage('archive/index.html',
    renderArchiveIndex(cfg, ads, { days: archive, sections: navSections, buildTime }));

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
  const migratedTotal = migrated.excerptsTrimmed + migrated.excerptsRemoved + migrated.provenanceBackfilled;
  if (migratedTotal) {
    console.log(`  ${bold('Migration')}  ${migrated.excerptsTrimmed} excerpt(s) trimmed, ${migrated.excerptsRemoved} removed, ${migrated.provenanceBackfilled} provenance record(s) backfilled`);
  }
  const hidden = sections.filter((x) => !navSections.includes(x));
  console.log(`  ${bold('Events')}     ${events.length} development(s) from ${ranked.length} reports; ${events.filter(e=>e.sourceCount>1).length} drew on multiple sources`);
  console.log(`  ${bold('Topics')}     ${byEntity.size} entity page(s)`);
  console.log(`  ${bold('Sections')}   ${navSections.join(', ')}${hidden.length ? gray(`  (empty, hidden from nav: ${hidden.join(', ')})`) : ''}`);
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
