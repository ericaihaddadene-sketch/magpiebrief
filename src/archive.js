// Durable day-by-day archive.
//
// The build is otherwise amnesiac: it wipes dist/ and regenerates the same
// handful of URLs, so nothing accumulates and there is nothing stable to link
// to or index. This module keeps one JSON file per day under archive/, which is
// committed to the repo — CI runs on a fresh checkout every time, so anything
// not committed is gone on the next build.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

export const ARCHIVE_DIR = 'archive';

/** UTC calendar day for a Date, as YYYY-MM-DD. */
export const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

const fileFor = (date) => path.join(ARCHIVE_DIR, `${date}.json`);

/** Every archived date, newest first. */
export async function listDays() {
  try {
    const entries = await readdir(ARCHIVE_DIR);
    return entries
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export async function readDay(date) {
  try {
    return JSON.parse(await readFile(fileFor(date), 'utf8'));
  } catch {
    return null;
  }
}

async function writeDay(record) {
  await mkdir(ARCHIVE_DIR, { recursive: true });
  await writeFile(fileFor(record.date), JSON.stringify(record, null, 1) + '\n', 'utf8');
}

function canonical(link) {
  try {
    const u = new URL(link);
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|ref|fbclid|gclid|mc_|cmpid|smid)/i.test(p)) u.searchParams.delete(p);
    }
    u.hash = '';
    u.hostname = u.hostname.replace(/^www\./i, '');
    return u.toString().replace(/\/$/, '');
  } catch {
    return link;
  }
}

/** Compact record — these files are committed, so they stay small. */
function toRecord(story) {
  return {
    title: story.title,
    link: story.link,
    source: story.source,
    publisher: story.publisher || story.source,
    publisherDomain: story.publisherDomain || '',
    discoveredVia: story.discoveredVia || null,
    discussionUrl: story.discussionUrl || null,
    descriptionType: story.descriptionType || 'NONE',
    section: story.section || '',
    summary: (story.summary || '').slice(0, 240),
    published: story.date.toISOString(),
    peak: Math.round(story.score * 10) / 10,
    points: story.points || null,
    also: (story.related || []).slice(0, 5).map((r) => ({ source: r.source, link: r.link }))
  };
}

/**
 * Fold a build's ranked stories into the archive, grouped by publication day.
 *
 * Runs hourly, so the same story is seen many times. Entries are merged by
 * canonical URL and keep their PEAK score rather than the latest one: scores
 * decay with age, so ordering an archived day by current score would rank a
 * story by how late in the day it happened rather than how big it was.
 *
 * @returns {string[]} dates that changed
 */
export async function updateArchive(stories, { cap = 60, maxDays = 4 } = {}) {
  const cutoff = Date.now() - maxDays * 86_400_000;
  const byDay = new Map();

  for (const s of stories) {
    if (!s.date || s.date.getTime() < cutoff) continue;
    const key = dayKey(s.date);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(s);
  }

  const changed = [];

  for (const [date, dayStories] of byDay) {
    const existing = (await readDay(date)) || { date, summary: '', stories: [] };
    const merged = new Map();

    for (const rec of existing.stories) merged.set(canonical(rec.link), rec);

    let dirty = false;
    for (const s of dayStories) {
      const key = canonical(s.link);
      const rec = toRecord(s);
      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, rec);
        dirty = true;
      } else {
        // Keep the strongest version seen, and the widest corroboration.
        const peak = Math.max(prev.peak || 0, rec.peak);
        const also = rec.also.length > (prev.also || []).length ? rec.also : prev.also;
        if (peak !== prev.peak || also !== prev.also) dirty = true;
        merged.set(key, { ...prev, peak, also });
      }
    }

    const next = [...merged.values()].sort((a, b) => b.peak - a.peak).slice(0, cap);
    if (!dirty && next.length === existing.stories.length) continue;

    await writeDay({
      date,
      generated: new Date().toISOString(),
      // Reserved for a short written synthesis. Rendered when present; the
      // archive is useful without it, but thin for search until it exists.
      summary: existing.summary || '',
      stories: next
    });
    changed.push(date);
  }

  return changed;
}

/**
 * Re-apply the current rights policy to everything already archived.
 *
 * Runs every build, which is the point: if a publisher asks for excerpts to be
 * shortened or dropped, the change has to reach material published last week as
 * well as today. An archive that freezes yesterday's permissions would make the
 * takedown route on /rights a fiction. It also repairs records written before a
 * policy existed — backfilling publisher attribution from the canonical link.
 *
 * @returns {{changedDays: string[], excerptsTrimmed: number, excerptsRemoved: number, provenanceBackfilled: number}}
 */
export async function applyPolicyToArchive(feeds, cfg, { publisherFromUrl, trimWords }) {
  const bySource = new Map(feeds.map((f) => [f.name, f]));
  const changedDays = [];
  let excerptsTrimmed = 0, excerptsRemoved = 0, provenanceBackfilled = 0;

  for (const date of await listDays()) {
    const record = await readDay(date);
    if (!record) continue;
    let dirty = false;

    for (const s of record.stories) {
      const feed = bySource.get(s.source);
      const policy = feed?.excerpt === 'feed' ? 'feed' : 'none';
      const budget = feed?.excerptWords ?? cfg.ranking.excerptWords ?? 26;

      if (s.summary) {
        if (policy !== 'feed') {
          s.summary = '';
          s.descriptionType = 'NONE';
          excerptsRemoved++;
          dirty = true;
        } else {
          const trimmed = trimWords(s.summary, budget);
          if (trimmed !== s.summary) {
            s.summary = trimmed;
            excerptsTrimmed++;
            dirty = true;
          }
          if (s.descriptionType !== 'AUTHORIZED_FEED_SNIPPET') {
            s.descriptionType = 'AUTHORIZED_FEED_SNIPPET';
            dirty = true;
          }
        }
      } else if (!s.descriptionType) {
        s.descriptionType = 'NONE';
        dirty = true;
      }

      // Records written before provenance existed credit the discovery venue.
      if (!s.publisher) {
        const isDiscovery = feed?.role === 'discovery';
        const linkHost = (() => { try { return new URL(s.link).hostname.replace(/^www\./, ''); } catch { return ''; } })();
        const selfHosted = (feed?.selfHosts || []).includes(linkHost);
        s.publisher = isDiscovery && !selfHosted ? publisherFromUrl(s.link) : s.source;
        s.publisherDomain = linkHost;
        s.discoveredVia = isDiscovery && !selfHosted ? s.source : null;
        provenanceBackfilled++;
        dirty = true;
      }
    }

    if (dirty) {
      await writeDay({ ...record, generated: new Date().toISOString() });
      changedDays.push(date);
    }
  }

  return { changedDays, excerptsTrimmed, excerptsRemoved, provenanceBackfilled };
}

/** Load every archived day, newest first. Used to render index and day pages. */
export async function loadAll() {
  const days = await listDays();
  const out = [];
  for (const d of days) {
    const rec = await readDay(d);
    if (rec) out.push(rec);
  }
  return out;
}
