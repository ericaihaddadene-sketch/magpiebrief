// Dedupe, cluster, filter, and score stories.
//
// This is the actual product. Anyone can list RSS items in date order; what
// makes an aggregator worth visiting is that the important thing is at the top,
// you only see each story once, and nothing off-topic gets through.

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'for', 'to', 'in', 'on', 'at',
  'by', 'with', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'it',
  'its', 'this', 'that', 'these', 'those', 'has', 'have', 'had', 'will', 'would',
  'can', 'could', 'should', 'may', 'might', 'new', 'says', 'say', 'said', 'how',
  'why', 'what', 'when', 'who', 'you', 'your', 'we', 'our', 'they', 'their',
  'not', 'no', 'more', 'most', 'about', 'into', 'over', 'after', 'before', 'up',
  'out', 'now', 'just', 'also', 'than', 'then', 'them', 'were', 'via', 'get'
]);

/**
 * Very light stemmer. Not linguistically correct, and doesn't need to be — it
 * only has to make "agents"/"agent" and "escaping"/"escape" collide so that two
 * headlines about the same event actually match. Possessives matter a lot here:
 * "OpenAI's" and "OpenAI" appearing as different tokens was silently breaking
 * clustering on exactly the stories most likely to be covered twice.
 */
export function stem(word) {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  // Collapse a trailing 'e' so a stripped "escap(ing)" meets "escape".
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

/** Title -> set of meaningful, stemmed tokens. */
export function titleTokens(title) {
  const words = title
    .toLowerCase()
    .replace(/['’]s\b/g, '')        // possessives: "openai's" -> "openai"
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(stem);
  return new Set(words);
}

/**
 * IDF-weighted overlap, 0..1.
 *
 * Plain token overlap fails on a niche site: in an AI feed, "openai" and
 * "model" appear in a third of all headlines, so two unrelated stories can look
 * similar while two versions of the same story are pulled apart by wording. IDF
 * makes rare, story-defining words ("sandbox", "wiki", "rogue") carry the
 * decision and common ones count for almost nothing.
 */
export function similarity(a, b, idf) {
  if (a.size === 0 || b.size === 0) return 0;
  const weight = (set) => {
    let sum = 0;
    for (const t of set) sum += idf(t);
    return sum;
  };
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += idf(t);
  const denom = Math.min(weight(a), weight(b));
  return denom === 0 ? 0 : shared / denom;
}

function canonicalUrl(link) {
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

/**
 * Build a topic matcher. Short keywords ("ai", "ml") must match on word
 * boundaries or they hit "said", "again", "html" and let everything through.
 */
export function makeTopicMatcher(keywords) {
  if (!keywords?.length) return () => true;
  const escaped = keywords.map((k) => k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp('(^|[^a-z0-9])(' + escaped.join('|') + ')([^a-z0-9]|$)', 'i');
  return (item) => re.test(item.title) || re.test(item.summary || '');
}

/** Score a single item before clustering. */
export function scoreItem(item, now, ranking) {
  const ageHours = Math.max(0, (now - item.date.getTime()) / 3_600_000);
  const recency = Math.pow(0.5, ageHours / ranking.halfLifeHours);
  let score = recency * 100 * (item.sourceWeight ?? 1);

  const haystack = item.title.toLowerCase();
  for (const [word, boost] of Object.entries(ranking.boost || {})) {
    if (haystack.includes(word.toLowerCase())) score *= 1 + boost;
  }
  return score;
}

export function isBlocked(title, blocklist) {
  const t = title.toLowerCase();
  return (blocklist || []).some((b) => t.includes(b.toLowerCase()));
}

/**
 * Cap how many stories any one source can hold in a list, preserving order.
 * Without this the front page is decided by whoever publishes most often, not
 * by what matters — Lobsters and TechCrunch alone were taking a third of it.
 */
export function diversify(stories, maxPerSource) {
  if (!maxPerSource) return stories;
  const used = new Map();
  const kept = [];
  const overflow = [];
  for (const s of stories) {
    const n = used.get(s.source) || 0;
    if (n < maxPerSource) {
      used.set(s.source, n + 1);
      kept.push(s);
    } else {
      overflow.push(s);
    }
  }
  // Overflow isn't discarded — it just sits below everything that made the cut,
  // so a slow news day still fills the page.
  return kept.concat(overflow);
}

/**
 * Group items covering the same story. The strongest item becomes the primary
 * and the rest are attached as `related`.
 */
export function clusterStories(items, threshold) {
  const seenUrls = new Set();
  const unique = [];
  for (const item of items) {
    const key = canonicalUrl(item.link);
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    unique.push({ ...item, canonical: key, tokens: titleTokens(item.title) });
  }

  // Document frequency across today's corpus, for IDF.
  const df = new Map();
  for (const item of unique) for (const t of item.tokens) df.set(t, (df.get(t) || 0) + 1);
  const N = unique.length;
  const idfCache = new Map();
  const idf = (t) => {
    let v = idfCache.get(t);
    if (v === undefined) {
      v = Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1;
      idfCache.set(t, v);
    }
    return v;
  };

  unique.sort((a, b) => b.score - a.score);

  const clusters = [];
  for (const item of unique) {
    let home = null;
    for (const c of clusters) {
      const sim = similarity(item.tokens, c.primary.tokens, idf);
      // A ratio alone is jumpy on very short headlines, so also require a few
      // genuinely shared words before merging two stories.
      let sharedCount = 0;
      for (const t of item.tokens) if (c.primary.tokens.has(t)) sharedCount++;
      if (sim >= threshold && sharedCount >= 2) { home = c; break; }
    }
    if (home) {
      if (home.primary.source !== item.source && !home.related.some((r) => r.source === item.source)) {
        home.related.push(item);
      }
    } else {
      clusters.push({ primary: item, related: [] });
    }
  }
  return clusters;
}

/**
 * Full pipeline: filter -> score -> cluster -> corroboration bonus -> sort.
 */
export function rankStories(rawItems, ranking, now = Date.now()) {
  const cutoff = now - ranking.maxAgeHours * 3_600_000;
  const onTopic = makeTopicMatcher(ranking.topicFilter);

  const eligible = rawItems.filter((it) => {
    if (!it.title || !it.link || !it.date) return false;
    if (it.date.getTime() < cutoff) return false;
    // A feed with a bad clock can otherwise pin junk to the top forever.
    if (it.date.getTime() > now + 2 * 3_600_000) return false;
    if (isBlocked(it.title, ranking.blocklist)) return false;
    // General-interest feeds (HN, Lobsters) carry a lot that has nothing to do
    // with this site's subject. Dedicated feeds are trusted as already on-topic.
    if (it.broad && !onTopic(it)) return false;
    return true;
  });

  for (const it of eligible) it.score = scoreItem(it, now, ranking);

  const clusters = clusterStories(eligible, ranking.dupeThreshold);

  for (const c of clusters) {
    // Several outlets covering the same thing is the clearest signal that a
    // story is actually big, so it outranks a single loud headline.
    c.primary.score *= 1 + ranking.corroborationBonus * c.related.length;
    c.primary.related = c.related;
  }

  const sorted = clusters.map((c) => c.primary).sort((a, b) => b.score - a.score);
  return diversify(sorted, ranking.maxPerSource);
}
