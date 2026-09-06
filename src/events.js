// The event layer: the product's unit of content.
//
// An article is an input. An event is a development in the world that one or
// more articles report on. Twenty-three stories about one model release are one
// event with twenty-three sources, not twenty-three cards.
//
// Everything here is deterministic and explainable. Nothing is inferred by a
// language model, so nothing claims understanding the system does not have:
// scores carry the factors that produced them, and prose fields are left empty
// rather than filled with template text that would read as insight.

import { extractEntities, keyEntities } from './entities.js';
import { titleTokens, similarity } from './rank.js';

export const EVENT_SCHEMA_VERSION = 1;

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
  if (entities.some((e) => e.kind === 'model')) return { id: 'models', name: 'New Models' };
  return { id: 'general', name: 'Developments' };
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
    latestAt,
    // Filled by the synthesis layer when a model is available; rendered only
    // when non-empty, never templated.
    whatChanged: '',
    whyItMatters: ''
  };
}

// --- importance -------------------------------------------------------------

/**
 * Magpie Importance, 1.0–10.0, with the factors that produced it.
 *
 * Deliberately NOT article count: ten outlets rewriting one press release is
 * one weak signal, not ten. Independent outlets and the presence of a primary
 * source carry the weight. Every contribution is recorded so the number can be
 * explained rather than asserted.
 */
export function scoreImportance(event, { now = Date.now(), categoryWeights = {} } = {}) {
  const factors = [];
  let score = 2.5;
  const add = (label, amount) => {
    if (amount === 0) return;
    score += amount;
    factors.push({ label, amount: Math.round(amount * 10) / 10 });
  };

  // Independent corroboration — the strongest available signal that something
  // real happened. Logarithmic: the 2nd outlet matters far more than the 9th.
  if (event.independentCount > 1) {
    add(`${event.independentCount} independent outlets`, Math.min(3.5, 1.7 * Math.log2(event.independentCount)));
  }

  if (event.primary) {
    add(`Primary source (${event.primary.publisher})`, 1.5);
  } else if (event.sources.every((s) => s.kind === 'discussion')) {
    add('Discussion only, no reporting', -0.8);
  }

  // An announcement that the press then picked up is the signature of a
  // development that actually landed, as opposed to either a press release
  // nobody covered or coverage with no confirmable origin.
  if (event.primary && event.independentCount >= 3) {
    add('Announced and independently covered', 1.0);
  }

  const catWeight = categoryWeights[event.category.id] ?? 0;
  if (catWeight) add(`${event.category.name}`, catWeight);

  const orgs = event.entities.filter((e) => e.kind === 'org').length;
  const models = event.entities.filter((e) => e.kind === 'model').length;
  if (models) add('Names a specific model', 0.6);
  if (orgs >= 2) add('Involves multiple organisations', 0.4);

  const points = Math.max(0, ...event.sources.map((s) => s.points || 0));
  if (points >= 100) add(`${points} points of reader attention`, Math.min(1.0, 0.35 * Math.log10(points)));

  // Only genuinely stale items are penalised. A 36-hour rule was docking the
  // day's biggest launch, which is exactly backwards — big stories run long.
  const ageH = (now - event.publishedAt.getTime()) / 3_600_000;
  if (ageH > 60) add('Several days old', -0.5);

  const clamped = Math.max(1, Math.min(10, score));
  return {
    // One decimal only. The inputs do not justify more precision than that.
    score: Math.round(clamped * 10) / 10,
    factors
  };
}

// --- confidence and status ---------------------------------------------------

export function assessConfidence(event) {
  if (event.primary) {
    return { level: 'Confirmed', why: 'Reported by the primary source' };
  }
  if (event.independentCount >= 3) {
    return { level: 'Confirmed', why: `${event.independentCount} independent outlets agree` };
  }
  if (event.independentCount === 2) {
    return { level: 'Highly likely', why: 'Two independent outlets' };
  }
  if (event.independentCount === 1) {
    return { level: 'Developing', why: 'A single outlet so far' };
  }
  return { level: 'Unverified', why: 'Community discussion only, no reporting yet' };
}

export function assessStatus(event, prior, { now = Date.now() } = {}) {
  const ageH = (now - event.publishedAt.getTime()) / 3_600_000;
  if (!prior && ageH < 12) return 'emerging';
  if (prior && event.sourceCount > prior.sourceCount) return 'developing';
  if (event.independentCount >= 3 || event.primary) return 'confirmed';
  return 'developing';
}

// --- editorial memory: what changed since last time -------------------------

/**
 * Compare an event against the last time we saw it.
 *
 * This is the "Since Yesterday" layer, and it needs no model: which outlets
 * joined, whether a primary source appeared, and how the importance moved are
 * all facts we already hold. Returns [] for a genuinely new event.
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

  const moved = Math.round((event.importance.score - (prior.importance ?? 0)) * 10) / 10;
  if (Math.abs(moved) >= 0.5) {
    deltas.push(moved > 0
      ? `Importance rose ${moved} to ${event.importance.score}.`
      : `Importance fell ${Math.abs(moved)} to ${event.importance.score}.`);
  }

  if (prior.confidence && prior.confidence !== event.confidence.level) {
    deltas.push(`Confidence moved from ${prior.confidence} to ${event.confidence.level}.`);
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
    importance: event.importance.score,
    confidence: event.confidence.level,
    category: event.category.id
  };
}
