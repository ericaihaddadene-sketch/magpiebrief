// Who published a thing, versus where we happened to find it.
//
// These are different facts and the site was conflating them: a Hacker News
// submission linking to a Spotify engineering post rendered as
// "HACKER NEWS · engineering.atspotify.com", which credits the wrong party.
// Hacker News is a discovery venue; the publisher is whoever is at the link.

/** Domains whose display name isn't obvious from the hostname. */
const PUBLISHER_NAMES = {
  'arxiv.org': 'arXiv',
  'github.com': 'GitHub',
  'github.io': 'GitHub Pages',
  'youtube.com': 'YouTube',
  'x.com': 'X',
  'twitter.com': 'X',
  'news.ycombinator.com': 'Hacker News',
  'lobste.rs': 'Lobsters',
  'openai.com': 'OpenAI',
  'anthropic.com': 'Anthropic',
  'deepmind.google': 'Google DeepMind',
  'blog.google': 'Google',
  'research.google': 'Google Research',
  'huggingface.co': 'Hugging Face',
  'techcrunch.com': 'TechCrunch',
  'theverge.com': 'The Verge',
  'arstechnica.com': 'Ars Technica',
  'wired.com': 'WIRED',
  'technologyreview.com': 'MIT Technology Review',
  'spectrum.ieee.org': 'IEEE Spectrum',
  'news.mit.edu': 'MIT News',
  'microsoft.com': 'Microsoft',
  'scmp.com': 'SCMP',
  'news.crunchbase.com': 'Crunchbase News',
  'simonwillison.net': 'Simon Willison',
  'lesswrong.com': 'LessWrong',
  'alignmentforum.org': 'Alignment Forum',
  'eff.org': 'EFF',
  'nytimes.com': 'The New York Times',
  'bloomberg.com': 'Bloomberg',
  'reuters.com': 'Reuters',
  'ft.com': 'Financial Times',
  'wsj.com': 'The Wall Street Journal',
  'theinformation.com': 'The Information',
  'magazine.sebastianraschka.com': 'Ahead of AI',
  'nature.com': 'Nature',
  'science.org': 'Science'
};

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Best available publisher name for a link.
 * Falls back to the bare domain, which is honest rather than guessed.
 */
export function publisherFromUrl(url) {
  const host = domainOf(url);
  if (!host) return '';
  if (PUBLISHER_NAMES[host]) return PUBLISHER_NAMES[host];
  // Match a known registrable domain one level up (blog.eff.org -> EFF).
  const parts = host.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join('.');
    if (PUBLISHER_NAMES[candidate]) return PUBLISHER_NAMES[candidate];
  }
  return host;
}

/**
 * Resolve the provenance of one item.
 *
 * @param item  parsed feed item (has link, commentsUrl)
 * @param feed  the source config it came from
 * @returns {{publisher, publisherDomain, discoveredVia, discussionUrl, isSelfPost}}
 */
export function resolveProvenance(item, feed) {
  const linkDomain = domainOf(item.link);

  if (feed.role !== 'discovery') {
    // A publisher feed publishes its own work. Name it from the config rather
    // than the URL so redirects and CDN hosts don't rename the outlet.
    return {
      publisher: feed.name,
      publisherDomain: linkDomain,
      discoveredVia: null,
      discussionUrl: null,
      isSelfPost: true
    };
  }

  const feedDomain = domainOf(feed.url) || domainOf(feed.homepage || '');
  const sameHost = linkDomain && feedDomain && linkDomain === feedDomain;
  // Ask HN / self-posts genuinely originate on the discussion site; anything
  // else is someone else's work that merely surfaced there.
  const selfPost = sameHost || (feed.selfHosts || []).includes(linkDomain);

  if (selfPost) {
    return {
      publisher: feed.name,
      publisherDomain: linkDomain,
      discoveredVia: null,
      discussionUrl: item.commentsUrl || null,
      isSelfPost: true
    };
  }

  return {
    publisher: publisherFromUrl(item.link),
    publisherDomain: linkDomain,
    discoveredVia: feed.name,
    discussionUrl: item.commentsUrl || null,
    isSelfPost: false
  };
}

/**
 * Trim to a word budget. Excerpt limits are specified in words because that is
 * how the policy is written and reasoned about, not in characters.
 */
export function trimWords(text, maxWords) {
  const clean = String(text ?? '').trim();
  if (!clean) return '';
  const words = clean.split(/\s+/);
  if (words.length <= maxWords) return clean;
  return words.slice(0, maxWords).join(' ').replace(/[,;:.\-–—]$/, '') + '…';
}
