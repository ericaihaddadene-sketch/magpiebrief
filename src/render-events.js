// Event-first rendering: the brief, and living story pages.
//
// The test this has to pass: if every publication name and headline were
// stripped out, would the page still tell you something? So the dominant
// elements are the development, its importance and why that number, what
// changed since yesterday, and what is confirmed versus merely reported —
// not a stack of article cards.

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

const STATUS_LABEL = {
  emerging: 'Emerging',
  developing: 'Developing',
  confirmed: 'Confirmed',
  resolved: 'Resolved'
};

function importanceBand(score) {
  if (score >= 8) return 'major';
  if (score >= 6) return 'significant';
  if (score >= 4) return 'notable';
  return 'minor';
}

function scoreBlock(ev) {
  const factors = ev.importance.factors
    .map((f) => `${esc(f.label)} ${f.amount > 0 ? '+' : ''}${f.amount}`)
    .join(' · ');
  return `<div class="ev__score ev__score--${importanceBand(ev.importance.score)}">
    <span class="ev__num">${ev.importance.score.toFixed(1)}</span>
    <span class="ev__scale">/10</span>
    ${factors ? `<span class="ev__why" title="${esc(factors)}">why</span>` : ''}
  </div>`;
}

function provenanceLine(cfg, ev) {
  const bits = [];
  if (ev.primary) {
    bits.push(`<span class="ev__primary">Primary: <a href="${esc(ev.primary.link)}" rel="noopener" target="_blank">${esc(ev.primary.publisher)}</a></span>`);
  } else {
    bits.push('<span class="ev__noprimary">No primary source yet</span>');
  }
  bits.push(`<span>${ev.sourceCount} source${ev.sourceCount === 1 ? '' : 's'} analysed</span>`);
  if (ev.independentCount > 1) bits.push(`<span>${ev.independentCount} independent</span>`);
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

/** A lead item: the things that matter. Visually dominant, finite in number. */
export function leadEvent(cfg, ev, rank, now) {
  return `<article class="ev ev--lead">
  <div class="ev__rank">${rank}</div>
  <div class="ev__body">
    <div class="ev__meta">
      <span class="ev__cat">${esc(ev.category.name)}</span>
      <span class="ev__conf ev__conf--${esc(ev.confidence.level.toLowerCase().replace(/\s+/g, '-'))}" title="${esc(ev.confidence.why)}">${esc(ev.confidence.level)}</span>
      ${ev.status === 'emerging' || ev.status === 'developing'
        ? `<span class="ev__status">${esc(STATUS_LABEL[ev.status])}</span>` : ''}
      <time datetime="${esc(ev.latestAt.toISOString())}">${esc(timeAgo(ev.latestAt, now))}</time>
    </div>
    <h2 class="ev__title"><a href="${esc(link(cfg, eventPath(ev.id)))}">${esc(ev.title)}</a></h2>
    ${ev.whatChanged ? `<p class="ev__changed">${esc(ev.whatChanged)}</p>` : ''}
    ${ev.whyItMatters ? `<p class="ev__why-text">${esc(ev.whyItMatters)}</p>` : ''}
    ${deltaBlock(ev)}
    ${provenanceLine(cfg, ev)}
    ${entityChips(cfg, ev)}
  </div>
  ${scoreBlock(ev)}
</article>`;
}

/** A compact row for the sectioned modules below the lead. */
export function eventRow(cfg, ev, now) {
  return `<article class="ev ev--row">
  <div class="ev__body">
    <h3 class="ev__title ev__title--sm"><a href="${esc(link(cfg, eventPath(ev.id)))}">${esc(ev.title)}</a></h3>
    <div class="ev__prov">
      ${ev.primary ? `<span class="ev__primary">${esc(ev.primary.publisher)}</span>` : `<span>${esc(ev.sources[0].publisher)}</span>`}
      <span>${ev.sourceCount} source${ev.sourceCount === 1 ? '' : 's'}</span>
      <time datetime="${esc(ev.latestAt.toISOString())}">${esc(timeAgo(ev.latestAt, now))}</time>
    </div>
  </div>
  <span class="ev__num ev__num--sm">${ev.importance.score.toFixed(1)}</span>
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

  const byCategory = (id) => rest.filter((e) => e.category.id === id);

  // Quiet signal: a primary source published something real that almost nobody
  // picked up. Genuinely useful, and computable without judging significance.
  const quiet = rest.filter((e) => e.primary && e.independentCount <= 1 && e.importance.score >= 3.5);

  // High attention with thin sourcing — flagged neutrally, never as a verdict.
  const loud = rest.filter((e) => {
    const pts = Math.max(0, ...e.sources.map((s) => s.points || 0));
    return pts >= 150 && e.independentCount <= 1 && !e.primary;
  });

  // The brief keeps only what is genuinely editorial: the lead developments and
  // the two judgement calls a feed reader cannot make. Everything organised by
  // category now lives on its own page and in the menu — stacking eight
  // categories down the homepage turned a five-minute read into a scroll.
  const modules = [
    module(cfg, { id: 'quiet', title: 'Quiet developments', note: 'Published by a primary source, largely uncovered elsewhere.', events: quiet, now, limit: 4 }),
    module(cfg, { id: 'attention', title: 'Getting attention, thinly sourced', note: 'Heavily discussed but not yet independently corroborated.', events: loud, now, limit: 3 })
  ].filter(Boolean).join('\n');

  // A finite pointer to the rest, rather than the rest itself.
  const counts = CATEGORY_ORDER
    .map((c) => ({ ...c, n: events.filter((e) => e.category.id === c.id).length }))
    .filter((c) => c.n > 0);
  const strip = counts.length
    ? `<section class="catstrip">
    <h2 class="mod__title">The rest of the day</h2>
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
    <h1 class="brief-title">What changed in AI ${permanent ? `on ${esc(dayLabel(date, cfg))}` : 'today'}</h1>
    <p class="brief-line">${esc(headline)}</p>
    <p class="brief-stats">${esc(stats)}</p>
    ${permanent ? '' : `<p class="brief-perm"><a href="${esc(link(cfg, '/brief/'))}">Past briefs →</a></p>`}
  </section>

  ${changedBlock}

  <section class="leads">
    <h2 class="leads__title">The ${lead.length} things that matter</h2>
    ${lead.map((ev, i) => leadEvent(cfg, ev, i + 1, now)).join('\n')}
  </section>

  ${modules}
  ${strip}
</div>
${briefSidebar(cfg, ads, events)}`;

  const title = permanent
    ? `What changed in AI on ${dayLabel(date, cfg)} — ${cfg.site.name}`
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
    <p class="panel__text">Every item is a development, not an article. The number is how much it matters, and hovering “why” shows what produced it. Sources are listed so you can check.</p>
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
      <span class="ev__conf ev__conf--${esc(ev.confidence.level.toLowerCase().replace(/\s+/g, '-'))}">${esc(ev.confidence.level)}</span>
      ${ev.status === 'emerging' || ev.status === 'developing'
        ? `<span class="ev__status">${esc(STATUS_LABEL[ev.status])}</span>` : ''}
      <time datetime="${esc(ev.latestAt.toISOString())}">Updated ${esc(timeAgo(ev.latestAt, now))}</time>
    </div>

    <h1 class="story-page__title">${esc(ev.title)}</h1>

    <div class="story-page__score">
      <span class="ev__num">${ev.importance.score.toFixed(1)}</span><span class="ev__scale">/10 importance</span>
    </div>
    <ul class="factors">
      ${ev.importance.factors.map((f) => `<li><span>${esc(f.label)}</span><span class="factors__amt">${f.amount > 0 ? '+' : ''}${f.amount}</span></li>`).join('')}
    </ul>

    ${ev.whatChanged ? `<h2>What changed</h2><p>${esc(ev.whatChanged)}</p>` : ''}
    ${ev.whyItMatters ? `<h2>Why it matters</h2><p>${esc(ev.whyItMatters)}</p>` : ''}

    ${ev.deltas?.length ? `<h2>Since yesterday</h2><ul class="deltas">${ev.deltas.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}

    <h2>What we know</h2>
    <p class="known">${esc(ev.confidence.why)}. ${ev.sourceCount} source${ev.sourceCount === 1 ? '' : 's'} analysed, ${ev.independentCount} independent.${ev.primary ? ` The primary source is ${esc(ev.primary.publisher)}.` : ' No primary source has been identified yet, so this rests on reporting alone.'}</p>

    ${!ev.primary || ev.independentCount < 2 ? `<h2>What is still unclear</h2>
    <ul class="unclear">
      ${!ev.primary ? '<li>No primary source or official announcement has appeared. Details rest on reporting.</li>' : ''}
      ${ev.independentCount < 2 ? '<li>Only one outlet has reported this independently, so specifics may change.</li>' : ''}
    </ul>` : ''}

    ${primaries.length ? `<h2>Primary sources</h2><ul class="srcs">${sourceList(primaries)}</ul>` : ''}
    ${coverage.length ? `<h2>Coverage &amp; analysis</h2><ul class="srcs">${sourceList(coverage)}</ul>` : ''}
    ${discussion.length ? `<h2>Discussion</h2><ul class="srcs">${sourceList(discussion)}</ul>` : ''}

    <h2>Timeline</h2>
    <ol class="tl">${timeline}</ol>

    ${ev.entities.length ? `<h2>Entities</h2>${entityChips(cfg, ev)}` : ''}

    ${related?.length ? `<h2>Related developments</h2>
    <ul class="related">${related.map((r) => `<li><a href="${esc(link(cfg, eventPath(r.id)))}">${esc(r.title)}</a> <span class="muted">${r.importance.score.toFixed(1)}</span></li>`).join('')}</ul>` : ''}
  </article>
</div>
${briefSidebar(cfg, ads, [ev])}`;

  return layout(cfg, ads, {
    title: `${ev.title} — ${cfg.site.name}`,
    description: `${ev.category.name}. ${ev.sourceCount} sources analysed, ${ev.independentCount} independent. Confidence: ${ev.confidence.level}.`,
    canonical: cfg.site.url + eventPath(ev.id),
    sections,
    body,
    buildTime
  });
}

/** Persistent topic page: what is happening with one entity. */
export function renderTopicPage(cfg, ads, { entity, events, sections, buildTime, now }) {
  const ranked = [...events].sort((a, b) => b.importance.score - a.importance.score);
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
  const ranked = [...events].sort((a, b) => b.importance.score - a.importance.score);
  const withPrimary = ranked.filter((e) => e.primary).length;

  const body = `<div class="content">
  <h1 class="page-title">${esc(category.name)}</h1>
  <p class="lede">${ranked.length} development${ranked.length === 1 ? '' : 's'} tracked. ${withPrimary} with a primary source.</p>
  ${ranked.map((ev) => eventRow(cfg, ev, now)).join('')}
</div>
${briefSidebar(cfg, ads, ranked)}`;

  return layout(cfg, ads, {
    title: `${category.name} — ${cfg.site.name}`,
    description: `AI developments in ${category.name.toLowerCase()}, ranked by importance.`,
    canonical: cfg.site.url + categoryPath(category.id),
    sections,
    active: category.id,
    body,
    buildTime
  });
}
