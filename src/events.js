// The event layer: the product's unit of content.
//
// An article is an input. An event is a development in the world that one or
// more articles report on. Twenty-three stories about one model release are one
// event with twenty-three sources, not twenty-three cards.
//
// This layer groups and attributes. It does not assess. There is no importance
// score, no confidence verdict, no claim about what matters — an aggregator
// earns trust by showing who reported what and letting the reader decide. The
// only ranking is mechanical (recency, source weight, reader attention) and it
// decides sequence, never merit.

import { extractEntities, keyEntities } from './entities.js';
import { titleTokens, similarity } from './rank.js';

export const EVENT_SCHEMA_VERSION = 2;

// --- source classification --------------------------------------------------

/**
 * What role a source plays for a given item.
 *
 * This is per-item, not per-feed: a Hacker News submission linking to
 * openai.com is a primary source that we happened to find on Hacker News.
 */
export function sourceKind(item, feed) {
  const host = (item.publisherDomain || '').toLowerCase();

  // Domains that publish their own work — the announcement itself.
  const PRIMARY_HOSTS = [
    'openai.com', 'anthropic.com', 'deepmind.google', 'blog.google', 'research.google',
    'ai.meta.com', 'microsoft.com', 'nvidia.com', 'huggingface.co', 'mistral.ai',
    'arxiv.org', 'github.com', 'x.ai', 'qwenlm.github.io', 'deepseek.com'
  ];
  const RESEARCH_HOSTS = ['arxiv.org', 'nature.com', 'science.org', 'alignmentforum.org'];

  if (PRIMARY_HOSTS.some((h) => host === h || host.endsWith('.' + h))) {
    return RESEARCH_HOSTS.some((h) => host === h || host.endsWith('.' + h)) ? 'research' : 'primary';
  }
  if (feed?.role === 'discovery') return 'discussion';
  if (feed?.kind === 'analysis') return 'analysis';
  if (feed?.kind === 'primary') return 'primary';
  return 'coverage';
}

const KIND_LABEL = {
  primary: 'Primary source',
  research: 'Research',
  coverage: 'Coverage',
  analysis: 'Analysis',
  discussion: 'Discussion'
};
export const kindLabel = (k) => KIND_LABEL[k] || 'Coverage';

// --- categorisation ---------------------------------------------------------

const CATEGORY_RULES = [
  { id: 'models', name: 'New Models', test: /\b(release[sd]?|launch(e[sd])?|introduc\w+|unveil\w+|announce[sd]?|ship(s|ped)?)\b.*\b(model|gpt|claude|gemini|llama|qwen|grok)\b|\b(model|gpt|claude|gemini|llama|qwen|grok)\b.*\b(release[sd]?|launch(e[sd])?|available)\b/i },
  { id: 'policy', name: 'Policy & Regulation', test: /\b(sue[sd]?|lawsuit|court|judge|regulat\w+|ai act|antitrust|ftc|subpoena|ruling|legal|copyright|ban(s|ned)?)\b/i },
  { id: 'business', name: 'Business', test: /\b(raise[sd]?|funding|valuation|acquir\w+|acquisition|ipo|series [a-e]\b|revenue|pricing|partnership|deal|invest\w+)\b/i },
  { id: 'research', name: 'Research', test: /\b(paper|study|researchers?|benchmark|evaluation|arxiv|findings?|experiment)\b/i },
  { id: 'security', name: 'Security', test: /\b(vulnerabilit\w+|exploit|breach|hack\w+|prompt injection|jailbreak|malware|attack)\b/i },
  { id: 'opensource', name: 'Open Source', test: /\b(open[- ]source|open[- ]weights?|github|repository|apache 2|mit licen[cs]e)\b/i },
  { id: 'tools', name: 'Tools & Products', test: /\b(tool|app|platform|api|sdk|plugin|integration|feature|update|extension)\b/i }
];

export function categorise(title, entities) {
  for (const rule of CATEGORY_RULES) {
    if (rule.test.test(title)) return { id: rule.id, name: rule.name };
  }
  // Names match CATEGORY_ORDER so the badge on an item and the menu entry it
  // links to read the same.
  if (entities.some((e) => e.kind === 'model')) return { id: 'models', name: 'Models' };
  return { id: 'general', name: 'Other' };
}

// --- clustering -------------------------------------------------------------

/**
 * Group items into events.
 *
 * Two signals must agree: shared named entities AND headline similarity.
 * Entities alone would merge every OpenAI story into one; wording alone misses
 * the same announcement described differently by two outlets.
 */
export function buildEvents(items, { dupeThreshold = 0.42 } = {}) {
  const prepared = items.map((it) => {
    const entities = extractEntities(it.title);
    return {
      ...it,
      entities,
      tokens: titleTokens(it.title),
      kind: it.sourceKind
    };
  });

  // IDF over today's corpus so common words decide little.
  const df = new Map();
  for (const it of prepared) for (const t of it.tokens) df.set(t, (df.get(t) || 0) + 1);
  const N = prepared.length;
  const idfCache = new Map();
  const idf = (t) => {
    let v = idfCache.get(t);
    if (v === undefined) { v = Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1; idfCache.set(t, v); }
    return v;
  };

  // Strongest first so the anchor of each event is its best-supported report.
  prepared.sort((a, b) => (b.score || 0) - (a.score || 0));

  const events = [];
  for (const item of prepared) {
    const itemEntities = new Set(item.entities.map((e) => e.id));
    let home = null;

    for (const ev of events) {
      const anchor = ev.sources[0];
      const sharedEntities = [...itemEntities].filter((id) => ev.entityIds.has(id));
      const sim = similarity(item.tokens, anchor.tokens, idf);

      // Either strong wording overlap, or a shared specific entity plus
      // moderate overlap. The second catches "OpenAI launches X" / "X is now
      // available from OpenAI".
      const strong = sim >= dupeThreshold + 0.15;
      const entityBacked = sharedEntities.length > 0 && sim >= dupeThreshold * 0.72;
      let shared = 0;
      for (const t of item.tokens) if (anchor.tokens.has(t)) shared++;

      if ((strong || entityBacked) && shared >= 2) { home = ev; break; }
    }

    if (home) {
      home.sources.push(item);
      for (const e of item.entities) {
        home.entityIds.add(e.id);
        if (!home.entities.some((x) => x.id === e.id)) home.entities.push(e);
      }
    } else {
      events.push({
        sources: [item],
        entities: [...item.entities],
        entityIds: new Set(item.entities.map((e) => e.id))
      });
    }
  }

  return events.map((ev) => finaliseEvent(ev, idf));
}

/**
 * Pick the report that best represents the event.
 *
 * Not simply "the first primary source": a lab publishes its announcement
 * alongside customer case studies, and taking whichever sorted first labelled a
 * major launch with a marketing anecdote. Centrality — how much a headline
 * shares with the rest of the cluster — identifies the report the others are
 * actually about, because coverage echoes the announcement, not the case study.
 */
function pickAnchor(sources, idf) {
  if (sources.length === 1) return sources[0];
  const centrality = (s) =>
    sources.filter((o) => o !== s)
      .reduce((sum, o) => sum + similarity(s.tokens, o.tokens, idf), 0) / (sources.length - 1);

  return [...sources]
    .map((s) => ({
      s,
      isPrimary: s.kind === 'primary' || s.kind === 'research' ? 1 : 0,
      c: centrality(s)
    }))
    .sort((a, b) => b.isPrimary - a.isPrimary || b.c - a.c)[0].s;
}

/** A stable id so an event keeps its URL across builds. */
function eventId(anchor, entities) {
  const ents = keyEntities(entities).map((e) => e.id).join('-');
  const words = anchor.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 3)
    .slice(0, 4)
    .join('-');
  return [ents, words].filter(Boolean).join('-').replace(/^-|-$/g, '').slice(0, 70) || 'event';
}

function finaliseEvent(raw, idf) {
  const sources = raw.sources;

  // Order sources by how close they are to the development itself.
  const order = { primary: 0, research: 1, analysis: 2, coverage: 3, discussion: 4 };
  const ranked = [...sources].sort((a, b) => (order[a.kind] ?? 5) - (order[b.kind] ?? 5));
  const primary = ranked.find((s) => s.kind === 'primary' || s.kind === 'research') || null;

  // We do not rewrite headlines — that needs a model, and inventing one would
  // misattribute meaning. We choose the most representative existing one.
  const anchor = pickAnchor(sources, idf);

  const publishedAt = new Date(Math.min(...sources.map((s) => s.date.getTime())));
  const latestAt = new Date(Math.max(...sources.map((s) => s.date.getTime())));

  const independent = new Set(
    sources.filter((s) => s.kind !== 'discussion').map((s) => s.publisherDomain || s.publisher)
  );

  return {
    id: eventId(anchor, raw.entities),
    title: anchor.title,
    titleSource: anchor.publisher,
    category: categorise(anchor.title, raw.entities),
    entities: raw.entities,
    sources: ranked,
    primary,
    sourceCount: sources.length,
    independentCount: independent.size,
    publishedAt,
    latestAt
  };
}

// --- ordering ----------------------------------------------------------------

/**
 * Where an event sits on the page.
 *
 * This is not a judgement about significance — it is the item ranking from
 * rank.js (recency, source weight, reader attention) lifted to the cluster.
 * An event ranks as well as its best-ranked report, so a development covered
 * by a fast, well-read source rises the way that source's article would have.
 * Nothing here is shown to the reader; it only decides sequence.
 */
/**
 * The venue holding the slot: the feed that surfaced this, not the publisher.
 *
 * These differ for a discovery feed, and the feed is the one that matters here.
 * Four Hacker News links to four different blogs read as four Hacker News
 * slots to anyone looking at the page, because "via Hacker News" is what is
 * printed under each of them.
 */
export function venueOf(event) {
  const lead = event.primary || event.sources[0];
  return lead.source || lead.publisher || 'unknown';
}

/**
 * Cap how many of the lead slots any one venue may hold.
 *
 * config.ranking.maxPerSource already does this for articles, but the rule was
 * being applied before clustering and then lost: the event list inherited four
 * consecutive Hacker News items at the top, so the freshest venue with vote
 * counts decided the whole lead block.
 *
 * Displaced events are not demoted — they keep their rank order and fall to the
 * front of everything below the lead, which is where the next-ranked item would
 * have been anyway. Nothing is hidden and nothing is pushed to the bottom.
 */
export function capLeadVenues(events, { leadCount, maxPerVenue }) {
  if (!leadCount || !maxPerVenue) return events;

  const lead = [];
  const rest = [];
  const used = new Map();

  for (const ev of events) {
    if (lead.length >= leadCount) { rest.push(ev); continue; }
    const venue = venueOf(ev);
    const held = used.get(venue) || 0;
    if (held >= maxPerVenue) { rest.push(ev); continue; }
    used.set(venue, held + 1);
    lead.push(ev);
  }

  return lead.concat(rest);
}

export function rankEvent(event, { corroborationBonus = 0 } = {}) {
  const best = Math.max(0, ...event.sources.map((s) => s.score || 0));
  // Each additional independent publisher lifts the event. This is counting,
  // not judging: rank.js already does the same for article-level clusters, and
  // without it a single link with a big vote count outranks a development four
  // newsrooms went out and covered.
  return best * (1 + corroborationBonus * Math.max(0, event.independentCount - 1));
}

// --- editorial memory: what changed since last time -------------------------

/**
 * Compare an event against the last time we saw it.
 *
 * Only observable facts: which outlets joined, and whether a primary source
 * turned up. Both are countable from the feeds — no view is taken on whether
 * the development got more or less important. Returns [] for a new event.
 */
export function computeDelta(event, prior) {
  if (!prior) return [];
  const deltas = [];

  const priorPublishers = new Set(prior.publishers || []);
  const added = [...new Set(event.sources.map((s) => s.publisher))].filter((p) => !priorPublishers.has(p));
  if (added.length) {
    deltas.push(
      added.length <= 3
        ? `Now also covered by ${added.join(', ')}.`
        : `${added.length} more outlets picked it up, including ${added.slice(0, 2).join(' and ')}.`
    );
  }

  if (event.primary && !prior.hadPrimary) {
    deltas.push(`A primary source appeared: ${event.primary.publisher}.`);
  }

  return deltas;
}

/** The compact shape persisted between builds, so deltas survive restarts. */
export function toMemory(event) {
  return {
    id: event.id,
    title: event.title,
    firstSeen: event.firstSeen,
    publishers: [...new Set(event.sources.map((s) => s.publisher))],
    sourceCount: event.sourceCount,
    independentCount: event.independentCount,
    hadPrimary: Boolean(event.primary),
    category: event.category.id
  };
}
