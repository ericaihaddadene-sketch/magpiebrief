// Minimal RSS 2.0 / Atom 1.0 parser. No dependencies.
// Deliberately tolerant: real-world feeds are full of malformed markup, and a
// strict XML parser would throw away otherwise-usable items.
//
// NOTE: dynamic patterns below are built with String.raw so that backslashes
// reach the RegExp constructor intact. A plain template literal would silently
// eat `\s` into `s`.

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  bull: '•', middot: '·', copy: '©', reg: '®', trade: '™',
  deg: '°', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç'
};

export function decodeEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-z][a-z0-9]*);/gi, (m, name) => {
      const v = NAMED_ENTITIES[name.toLowerCase()];
      return v !== undefined ? v : m;
    });
}

function safeCodePoint(n) {
  try {
    if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return '';
    return String.fromCodePoint(n);
  } catch { return ''; }
}

export function stripTags(str) {
  if (!str) return '';
  return str
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function unwrapCdata(s) {
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return m ? m[1] : s;
}

// Matches <title>, <dc:title>, <atom:title> etc. and returns raw inner content.
function tagContent(xml, name) {
  const pattern =
    String.raw`<(?:[A-Za-z0-9_-]+:)?` + name +
    String.raw`(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?` + name +
    String.raw`\s*>`;
  const m = xml.match(new RegExp(pattern, 'i'));
  return m ? unwrapCdata(m[1]) : '';
}

function text(xml, name) {
  // Alternate decoding and stripping until the value stops changing.
  //
  // Order matters: feed descriptions overwhelmingly carry entity-escaped HTML
  // (&lt;p&gt;...), so entities must be decoded BEFORE tags are stripped or the
  // markup survives as literal visible text. But a single decode->strip pass is
  // not enough either: feeds that have been syndicated more than once carry
  // double-escaped markup (&amp;lt;b&amp;gt;), where the first decode only
  // reveals a second layer of entities that then needs stripping in turn.
  //
  // Capped at 3 rounds so pathological input cannot spin.
  let out = tagContent(xml, name);
  for (let i = 0; i < 3; i++) {
    const next = stripTags(decodeEntities(out));
    if (next === out) break;
    out = next;
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Atom links are attributes on self-closing tags; RSS links are element text.
function extractLink(block) {
  const rssLink = tagContent(block, 'link').trim();
  if (rssLink && !rssLink.startsWith('<')) {
    const clean = decodeEntities(rssLink).trim();
    if (/^https?:\/\//i.test(clean)) return clean;
  }
  const tags = block.match(/<(?:[A-Za-z0-9_-]+:)?link\b[^>]*>/gi) || [];
  let alternate = null, fallback = null;
  for (const tag of tags) {
    const href = (tag.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    const rel = ((tag.match(/\brel\s*=\s*["']([^"']+)["']/i) || [])[1] || 'alternate').toLowerCase();
    if (rel === 'self' || rel === 'hub' || rel === 'replies') continue;
    if (!fallback) fallback = href;
    if (rel === 'alternate' && !alternate) alternate = href;
  }
  const chosen = alternate || fallback;
  if (chosen) return decodeEntities(chosen).trim();
  const guid = tagContent(block, 'guid').trim();
  return /^https?:\/\//i.test(guid) ? decodeEntities(guid) : '';
}

/**
 * The discussion thread for an item, where the feed distinguishes it from the
 * article. RSS has a <comments> element for exactly this; Hacker News also
 * spells it out in the description, which is the fallback.
 */
function extractCommentsUrl(block) {
  const el = text(block, 'comments').trim();
  if (/^https?:\/\//i.test(el)) return el;
  const raw = decodeEntities(tagContent(block, 'description') || '');
  const m = raw.match(/Comments URL:\s*(?:<[^>]*>)?\s*(https?:\/\/\S+)/i);
  if (m) return m[1].replace(/["'<].*$/, '');
  return null;
}

function extractDate(block) {
  for (const field of ['pubDate', 'published', 'updated', 'date', 'modified']) {
    const raw = text(block, field);
    if (!raw) continue;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function extractSummary(block) {
  for (const field of ['description', 'summary', 'subtitle']) {
    const v = text(block, field);
    if (v) return v;
  }
  // Fall back to content, but the renderer truncates hard — we never publish
  // a whole article, only enough to decide whether to click through.
  return text(block, 'encoded') || text(block, 'content') || '';
}

/**
 * Pull engagement counts out of a raw description.
 *
 * Hacker News (and some mirrors) put "Points: 82" and "# Comments: 45" in the
 * description instead of prose. cleanSummary strips these as plumbing, which
 * threw away the only direct measure of human attention in any of the feeds —
 * so read them here first.
 *
 * @returns {{points:number|null, comments:number|null}}
 */
export function extractEngagement(raw) {
  if (!raw) return { points: null, comments: null };
  const text = decodeEntities(String(raw));
  const points = text.match(/\bPoints:\s*(\d+)/i);
  const comments = text.match(/#\s*Comments:\s*(\d+)/i);
  return {
    points: points ? parseInt(points[1], 10) : null,
    comments: comments ? parseInt(comments[1], 10) : null
  };
}

/**
 * Strip boilerplate out of a summary and reject it if nothing useful is left.
 *
 * Aggregator-style feeds don't put prose in <description>; Hacker News puts
 * "Article URL: ... Comments URL: ... Points: 82 # Comments: 45", and Reddit-like
 * feeds put "submitted by /u/someone". Printing that under a headline looks
 * broken, so it's better to show no summary at all than to show plumbing.
 */
export function cleanSummary(summary, title = '') {
  if (!summary) return '';
  let s = summary
    .replace(/Article URL:\s*\S*/gi, ' ')
    .replace(/Comments URL:\s*\S*/gi, ' ')
    .replace(/#\s*Comments:\s*\d+/gi, ' ')
    .replace(/\bPoints:\s*\d+/gi, ' ')
    .replace(/submitted by\s+\/u\/\S+/gi, ' ')
    .replace(/\bhttps?:\/\/\S+/gi, ' ')   // bare URLs read as noise in a summary
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s\-–—:•|]+/, '')
    .trim();

  // Nothing meaningful survived, or it just restates the headline.
  if (s.length < 25) return '';
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ns = norm(s);
  const nt = norm(title);
  if (nt && (ns === nt || ns.startsWith(nt) || nt.startsWith(ns))) return '';
  return s;
}

/**
 * Parse an RSS or Atom document into normalized items.
 * @returns {{title:string,link:string,summary:string,date:Date|null,author:string}[]}
 */
export function parseFeed(xml) {
  if (!xml || typeof xml !== 'string') return [];
  const clean = xml.replace(/<!--[\s\S]*?-->/g, '');
  const items = [];
  const re = /<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const block = m[2];
    const title = text(block, 'title');
    const link = extractLink(block);
    if (!title || !link) continue;
    const rawSummary = extractSummary(block);
    const { points, comments } = extractEngagement(rawSummary);
    items.push({
      title,
      link,
      summary: cleanSummary(rawSummary, title),
      date: extractDate(block),
      author: text(block, 'creator') || text(block, 'author') || '',
      points,
      comments,
      // Aggregator feeds carry the thread separately from the article. Keeping
      // it lets the site credit the publisher for the work and the aggregator
      // for the discussion, instead of blurring the two.
      commentsUrl: extractCommentsUrl(block)
    });
  }
  return items;
}

export function feedTitle(xml) {
  if (!xml) return '';
  const head = xml.split(/<(?:item|entry)\b/i)[0];
  return text(head, 'title');
}
