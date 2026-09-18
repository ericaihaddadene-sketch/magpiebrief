// Event-first rendering: the brief, and living story pages.
//
// The job is to show the reader what was reported and by whom, once per
// development rather than once per article. The page states facts it can
// count — who published, how many independent outlets, whether the primary
// source is among them, when it last moved — and offers no opinion on any of
// it. A reader should be able to disagree with the ordering and still trust
// every line on the page.

import { esc, link, layout, adSlot, timeAgo, hostOf, truncate } from './render.js';
import { kindLabel } from './events.js';

export const eventPath = (id) => `/event/${id}/`;
export const briefPath = (date) => `/brief/${date}/`;
// Namespaced under /category/ so these never collide with the legacy article
// section pages, which still exist at /research/ and friends.
export const categoryPath = (id) => `/category/${id}/`;

export const CATEGORY_ORDER = [
  { id: 'models', name: 'Models' },
  { id: 'business', name: 'Business' },
  { id: 'research', name: 'Research' },
  { id: 'policy', name: 'Policy' },
  { id: 'security', name: 'Security' },
  { id: 'opensource', name: 'Open source' },
  { id: 'tools', name: 'Tools' },
  { id: 'general', name: 'Other' }
];

/** '2026-09-06' -> '6 September 2026' */
export function dayLabel(date, cfg) {
  return new Date(date + 'T12:00:00Z').toLocaleDateString(cfg?.site?.locale || 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  });
}

/** Reader attention, as reported by the venue that counts it. Not a verdict. */
function pointsOf(ev) {
  return Math.max(0, ...ev.sources.map((s) => s.points || 0));
}

function provenanceLine(cfg, ev) {
  const bits = [];
  // Name whoever is at the link. "No primary source yet" told the reader what
  // the page could not establish instead of the one thing it knows for certain:
  // who published this.
  const lead = ev.primary || ev.sources[0];
  const label = ev.primary ? 'Primary: ' : '';
  bits.push(`<span class="ev__primary">${label}<a href="${esc(lead.link)}" rel="noopener" target="_blank">${esc(lead.publisher)}</a></span>`);
  if (ev.sourceCount > 1) {
    bits.push(`<span>${ev.sourceCount} reports</span>`);
  }
  if (ev.independentCount > 1) bits.push(`<span>${ev.independentCount} independent</span>`);
  if (lead.discoveredVia) bits.push(`<span class="ev__via">via ${esc(lead.discoveredVia)}</span>`);
  return `<div class="ev__prov">${bits.join('')}</div>`;
}

function deltaBlock(ev) {
  if (!ev.deltas?.length) return '';
  return `<div class="ev__delta">
    <span class="ev__delta-label">Since yesterday</span>
    <ul>${ev.deltas.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
  </div>`;
}

function entityChips(cfg, ev) {
  if (!ev.entities.length) return '';
  return `<div class="ev__ents">${ev.entities
    .slice(0, 5)
    .map((e) => `<a class="chip chip--${esc(e.kind)}" href="${esc(link(cfg, `/topic/${e.id}/`))}">${esc(e.name)}</a>`)
    .join('')}</div>`;
}

/** A full item at the top of the page. No rank number, no verdict. */
export function leadEvent(cfg, ev, now) {
  const points = pointsOf(ev);
  return `<article class="ev ev--lead">
  <div class="ev__body">
    <div class="ev__meta">
      <span class="ev__cat">${esc(ev.category.name)}</span>
      <time datetime="${esc(ev.latestAt.toISOString())}">${esc(timeAgo(ev.latestAt, now))}</time>
      ${points >= 50 ? `<span class="ev__points">${points} points</span>` : ''}
    </div>
    <h2 class="ev__title"><a href="${esc(link(cfg, eventPath(ev.id)))}">${esc(ev.title)}</a></h2>
    ${deltaBlock(ev)}
    ${provenanceLine(cfg, ev)}
    ${alsoLine(ev)}
    ${entityChips(cfg, ev)}
  </div>
</article>`;
}

/** Who else carried it. The aggregator's whole point, stated plainly. */
function alsoLine(ev) {
  // Exclude whoever the provenance line already named, or a single-source item
  // ends up claiming it was "also covered by" its only publisher.
  const named = (ev.primary || ev.sources[0]).publisher;
  const others = [...new Set(ev.sources.map((s) => s.publisher))]
    .filter((p) => p !== named)
    .slice(0, 4);
  if (!others.length) return '';
  return `<p class="ev__also">Also covered by ${esc(others.join(', '))}</p>`;
}

/** A compact row for everything below the top group. */
export function eventRow(cfg, ev, now) {
  const points = pointsOf(ev);
  const lead = ev.primary || ev.sources[0];
  return `<article class="ev ev--row">
  <div class="ev__body">
    <h3 class="ev__title ev__title--sm"><a href="${esc(link(cfg, eventPath(ev.id)))}">${esc(ev.title)}</a></h3>
    <div class="ev__prov">
      <span class="ev__primary">${esc(lead.publisher)}</span>
      ${lead.discoveredVia ? `<span class="ev__via">via ${esc(lead.discoveredVia)}</span>` : ''}
      ${ev.sourceCount > 1 ? `<span>${ev.sourceCount} sources</span>` : ''}
      <time datetime="${esc(ev.latestAt.toISOString())}">${esc(timeAgo(ev.latestAt, now))}</time>
      ${points >= 50 ? `<span class="ev__points">${points} points</span>` : ''}
    </div>
  </div>
</article>`;
}

function module(cfg, { id, title, note, events, now, limit = 5 }) {
  if (!events.length) return '';
  return `<section class="mod" id="${esc(id)}">
  <h2 class="mod__title">${esc(title)}</h2>
  ${note ? `<p class="mod__note">${esc(note)}</p>` : ''}
  ${events.slice(0, limit).map((ev) => eventRow(cfg, ev, now)).join('\n')}
</section>`;
}

/**
 * The daily brief. Used for the homepage and for the permanent /brief/<date>/
 * record, which is the same document with a fixed date.
 */
export function renderBrief(cfg, ads, { events, headline, stats, sections, buildTime, now, date, permanent }) {
  const lead = events.slice(0, cfg.brief.leadCount);
  const rest = events.slice(cfg.brief.leadCount);

  // Everything the feeds reported is on the page. The old build kept the rest
  // off the homepage behind an importance threshold, which meant the site was
  // deciding what you were allowed to see. An aggregator shows the list.
  const more = rest.length
    ? module(cfg, { id: 'more', title: 'More developments', events: rest, now, limit: rest.length })
    : '';

  // A finite pointer to the rest, rather than the rest itself.
  const counts = CATEGORY_ORDER
    .map((c) => ({ ...c, n: events.filter((e) => e.category.id === c.id).length }))
    .filter((c) => c.n > 0);
  const strip = counts.length
    ? `<section class="catstrip">
    <h2 class="mod__title">By category</h2>
    <ul class="catstrip__list">${counts
      .map((c) => `<li><a href="${esc(link(cfg, categoryPath(c.id)))}">${esc(c.name)}<span class="catstrip__n">${c.n}</span></a></li>`)
      .join('')}</ul>
  </section>`
    : '';

  // One consolidated view of every delta, so a returning reader can see what is
  // new without re-reading yesterday's items. Absent on a first run, which is
  // correct: nothing has changed when there is nothing to compare against.
  const moved = events.filter((e) => e.deltas?.length);
  const changedBlock = moved.length
    ? `<section class="changed">
    <h2 class="mod__title">What changed since yesterday</h2>
    <ul class="changed__list">
      ${moved.slice(0, 8).map((ev) => `<li>
        <a href="${esc(link(cfg, eventPath(ev.id)))}">${esc(ev.title)}</a>
        <ul>${ev.deltas.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
      </li>`).join('')}
    </ul>
  </section>`
    : '';

  const body = `<div class="content">
  <section class="brief-head">
    <h1 class="brief-title">AI news ${permanent ? `on ${esc(dayLabel(date, cfg))}` : 'today'}</h1>
    <p class="brief-line">${esc(headline)}</p>
    <p class="brief-stats">${esc(stats)}</p>
    ${permanent ? '' : `<p class="brief-perm"><a href="${esc(link(cfg, '/brief/'))}">Past days →</a></p>`}
  </section>

  ${changedBlock}

  <section class="leads">
    ${lead.map((ev) => leadEvent(cfg, ev, now)).join('\n')}
  </section>

  ${more}
  ${strip}
</div>
${briefSidebar(cfg, ads, events)}`;

  const title = permanent
    ? `AI news on ${dayLabel(date, cfg)} — ${cfg.site.name}`
    : `${cfg.site.name} — ${cfg.site.tagline}`;

  return layout(cfg, ads, {
    title,
    description: headline,
    canonical: cfg.site.url + (permanent ? `/brief/${date}/` : '/'),
    sections,
    active: null,
    body,
    buildTime
  });
}

function briefSidebar(cfg, ads, events) {
  const topics = new Map();
  for (const ev of events) {
    for (const e of ev.entities) {
      const cur = topics.get(e.id) || { ...e, n: 0 };
      cur.n++;
      topics.set(e.id, cur);
    }
  }
  const active = [...topics.values()].sort((a, b) => b.n - a.n).slice(0, 10);

  return `<aside class="sidebar">
  ${adSlot('sidebar', ads, cfg)}
  ${active.length ? `<section class="panel">
    <h3 class="panel__title">Active topics</h3>
    <ul class="sources">${active
      .map((t) => `<li><a href="${esc(link(cfg, `/topic/${t.id}/`))}">${esc(t.name)}</a><span class="count">${t.n}</span></li>`)
      .join('')}</ul>
  </section>` : ''}
  <section class="panel">
    <h3 class="panel__title">How to read this</h3>
    <p class="panel__text">One entry per development, not per article: when several outlets cover the same thing you see it once, with everyone who reported it listed underneath. Ordered by how recent it is and how much attention it is getting — never by our opinion of it.</p>
    <a class="btn" href="${esc(link(cfg, '/methodology/'))}">Methodology</a>
  </section>
</aside>`;
}

/**
 * Living story page: the canonical, evolving record of one development.
 */
export function renderEventPage(cfg, ads, { event: ev, sections, buildTime, now, related }) {
  const primaries = ev.sources.filter((s) => s.kind === 'primary' || s.kind === 'research');
  const coverage = ev.sources.filter((s) => s.kind === 'coverage' || s.kind === 'analysis');
  const discussion = ev.sources.filter((s) => s.kind === 'discussion');

  const sourceList = (list) => list.map((s) => `<li class="src">
      <a class="src__title" href="${esc(s.link)}" rel="noopener" target="_blank">${esc(s.title)}</a>
      <span class="src__meta">${esc(s.publisher)} · ${esc(hostOf(s.link))} · <time datetime="${esc(s.date.toISOString())}">${esc(timeAgo(s.date, now))}</time>${s.points ? ` · ${s.points} pts` : ''}</span>
      ${s.summary ? `<span class="src__excerpt">${esc(truncate(s.summary, 150))}</span>` : ''}
    </li>`).join('');

  // Timeline is real: it is when each source reported, in order.
  const timeline = [...ev.sources]
    .sort((a, b) => a.date - b.date)
    .map((s) => `<li class="tl__item">
      <time class="tl__when" datetime="${esc(s.date.toISOString())}">${esc(s.date.toISOString().slice(0, 16).replace('T', ' '))} UTC</time>
      <span class="tl__what"><strong>${esc(s.publisher)}</strong> <span class="tl__kind">${esc(kindLabel(s.kind))}</span><br>${esc(s.title)}</span>
    </li>`).join('');

  const body = `<div class="content">
  <article class="story-page">
    <div class="ev__meta">
      <span class="ev__cat">${esc(ev.category.name)}</span>
      <time datetime="${esc(ev.latestAt.toISOString())}">Updated ${esc(timeAgo(ev.latestAt, now))}</time>
      ${pointsOf(ev) >= 50 ? `<span class="ev__points">${pointsOf(ev)} points</span>` : ''}
    </div>

    <h1 class="story-page__title">${esc(ev.title)}</h1>

    ${ev.deltas?.length ? `<h2>Since yesterday</h2><ul class="deltas">${ev.deltas.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}

    <h2>Who reported this</h2>
    <p class="known">${ev.sourceCount} report${ev.sourceCount === 1 ? '' : 's'} from ${ev.independentCount} independent publisher${ev.independentCount === 1 ? '' : 's'}.${ev.primary ? ` ${esc(ev.primary.publisher)} is the primary source.` : ' No primary source is among them.'}</p>

    ${primaries.length ? `<h2>Primary sources</h2><ul class="srcs">${sourceList(primaries)}</ul>` : ''}
    ${coverage.length ? `<h2>Coverage &amp; analysis</h2><ul class="srcs">${sourceList(coverage)}</ul>` : ''}
    ${discussion.length ? `<h2>Discussion</h2><ul class="srcs">${sourceList(discussion)}</ul>` : ''}

    <h2>Timeline</h2>
    <ol class="tl">${timeline}</ol>

    ${ev.entities.length ? `<h2>Entities</h2>${entityChips(cfg, ev)}` : ''}

    ${related?.length ? `<h2>Related developments</h2>
    <ul class="related">${related.map((r) => `<li><a href="${esc(link(cfg, eventPath(r.id)))}">${esc(r.title)}</a></li>`).join('')}</ul>` : ''}
  </article>
</div>
${briefSidebar(cfg, ads, [ev])}`;

  return layout(cfg, ads, {
    title: `${ev.title} — ${cfg.site.name}`,
    description: `${ev.category.name}. ${ev.sourceCount} reports from ${ev.independentCount} independent publishers.`,
    canonical: cfg.site.url + eventPath(ev.id),
    sections,
    body,
    buildTime
  });
}

/** Persistent topic page: what is happening with one entity. */
export function renderTopicPage(cfg, ads, { entity, events, sections, buildTime, now }) {
  const ranked = [...events].sort((a, b) => (b.rank || 0) - (a.rank || 0));
  const withPrimary = ranked.filter((e) => e.primary).length;

  const body = `<div class="content">
  <h1 class="page-title">${esc(entity.name)}</h1>
  <p class="lede">${events.length} development${events.length === 1 ? '' : 's'} currently tracked. ${withPrimary} with a primary source.</p>

  <h2 class="mod__title">Latest developments</h2>
  ${ranked.map((ev) => eventRow(cfg, ev, now)).join('\n')}
</div>
${briefSidebar(cfg, ads, events)}`;

  return layout(cfg, ads, {
    title: `${entity.name} — ${cfg.site.name}`,
    description: `Tracked developments involving ${entity.name}.`,
    canonical: cfg.site.url + `/topic/${entity.id}/`,
    sections,
    body,
    buildTime
  });
}

/** Index of every permanent brief. */
export function renderBriefIndex(cfg, ads, { briefs, sections, buildTime }) {
  const months = new Map();
  for (const b of briefs) {
    const key = b.date.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(b);
  }

  const groups = [...months.entries()].map(([month, entries]) => {
    const label = new Date(month + '-01T12:00:00Z').toLocaleDateString(cfg.site.locale || 'en-GB', {
      month: 'long', year: 'numeric', timeZone: 'UTC'
    });
    const rows = entries.map((b) => `<li class="briefidx__row">
      <a class="briefidx__date" href="${esc(link(cfg, briefPath(b.date)))}">${esc(dayLabel(b.date, cfg))}</a>
      <span class="briefidx__lead">${esc(b.lead || '')}</span>
      <span class="briefidx__n">${b.count}</span>
    </li>`).join('');
    return `<section class="archive__month">
    <h2 class="archive__label">${esc(label)}</h2>
    <ul class="briefidx">${rows}</ul>
  </section>`;
  }).join('\n');

  const body = `<div class="content">
  <h1 class="page-title">Daily briefs</h1>
  <p class="lede">${briefs.length} ${briefs.length === 1 ? 'day' : 'days'} on record. Each brief is a snapshot of what was known that day, kept as it stood rather than recalculated later.</p>
  ${briefs.length ? groups : '<p class="empty">The first brief is written on the next build.</p>'}
</div>
${briefSidebar(cfg, ads, [])}`;

  return layout(cfg, ads, {
    title: `Daily briefs — ${cfg.site.name}`,
    description: `Every daily AI brief published by ${cfg.site.name}, kept at a permanent address.`,
    canonical: cfg.site.url + '/brief/',
    sections,
    active: 'brief',
    body,
    buildTime
  });
}

/** One category, as a real page rather than a slab of the homepage. */
export function renderCategoryPage(cfg, ads, { category, events, sections, buildTime, now }) {
  const ranked = [...events].sort((a, b) => (b.rank || 0) - (a.rank || 0));
  const withPrimary = ranked.filter((e) => e.primary).length;

  const body = `<div class="content">
  <h1 class="page-title">${esc(category.name)}</h1>
  <p class="lede">${ranked.length} development${ranked.length === 1 ? '' : 's'} tracked. ${withPrimary} with a primary source.</p>
  ${ranked.map((ev) => eventRow(cfg, ev, now)).join('')}
</div>
${briefSidebar(cfg, ads, ranked)}`;

  return layout(cfg, ads, {
    title: `${category.name} — ${cfg.site.name}`,
    description: `AI developments in ${category.name.toLowerCase()}, newest and most-read first.`,
    canonical: cfg.site.url + categoryPath(category.id),
    sections,
    active: category.id,
    body,
    buildTime
  });
}
