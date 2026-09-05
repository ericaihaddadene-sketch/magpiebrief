// Publication guardrails, checked at build time.
//
// The point is that these are enforced by the pipeline rather than described in
// a disclaimer. A hard violation fails the build, so a broken rights decision
// cannot reach the deployed site — the deploy step never runs.

/** Policy version, recorded with archived items so a decision can be traced. */
export const POLICY_VERSION = '1.0';

const isHttpUrl = (u) => {
  try {
    const { protocol } = new URL(u);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * @returns {{errors: string[], warnings: string[], stats: object}}
 */
export function validate({ stories, feeds, ads, cfg }) {
  const errors = [];
  const warnings = [];
  const bySource = new Map(feeds.map((f) => [f.name, f]));

  let linkOnly = 0;
  let withExcerpt = 0;
  let discoveryAttributed = 0;

  for (const s of stories) {
    const label = `"${(s.title || '(untitled)').slice(0, 60)}"`;

    // --- provenance: nothing publishes without a real canonical link ---
    if (!isHttpUrl(s.link)) {
      errors.push(`${label} has no usable canonical URL (${s.link || 'missing'})`);
    }
    if (!s.publisher) {
      errors.push(`${label} has no publisher attributed`);
    }

    // --- excerpts: only from sources whose policy permits it ---
    const feed = bySource.get(s.discoveredVia || s.source);
    const declared = s.excerptPolicy;
    if (s.summary) {
      withExcerpt++;
      if (declared !== 'feed') {
        errors.push(
          `${label} carries an excerpt but its source policy is "${declared || 'none'}" ` +
          `(source: ${s.source})`
        );
      }
      const words = s.summary.trim().split(/\s+/).length;
      const cap = (feed?.excerptWords ?? cfg.ranking.excerptWords ?? 28) + 2;
      if (words > cap) {
        errors.push(`${label} excerpt is ${words} words, over the ${cap}-word cap`);
      }
    } else {
      linkOnly++;
    }

    // --- discovery venues must not be presented as publishers ---
    if (s.discoveredVia) {
      discoveryAttributed++;
      if (s.publisher === s.discoveredVia) {
        errors.push(`${label} names ${s.discoveredVia} as both publisher and discovery source`);
      }
    }
  }

  // --- advertising: anything shown as an ad must be labelled and disclosed ---
  const today = new Date().toISOString().slice(0, 10);
  for (const [name, slot] of Object.entries(ads?.slots || {})) {
    if (!slot?.sold) continue;
    const live =
      slot.headline && slot.url &&
      (!slot.startDate || slot.startDate <= today) &&
      (!slot.endDate || slot.endDate >= today);
    if (!live) continue;
    if (!slot.advertiser) {
      errors.push(`ad slot "${name}" is sold but names no advertiser, so it cannot be disclosed`);
    }
    if (!isHttpUrl(slot.url)) {
      errors.push(`ad slot "${name}" has an invalid destination URL`);
    }
  }

  // --- source concentration: a warning, deliberately not a quota ---
  const counts = new Map();
  for (const s of stories) counts.set(s.publisher, (counts.get(s.publisher) || 0) + 1);
  let top = null;
  for (const [name, n] of counts) if (!top || n > top.n) top = { name, n };
  const share = stories.length ? (top?.n || 0) / stories.length : 0;
  const threshold = cfg.ranking.concentrationWarning ?? 0.4;
  if (share > threshold) {
    warnings.push(
      `${Math.round(share * 100)}% of published stories come from ${top.name}. ` +
      `Worth checking source coverage — this is a prompt to review, not a quota.`
    );
  }

  return {
    errors,
    warnings,
    stats: {
      published: stories.length,
      withExcerpt,
      linkOnly,
      discoveryAttributed,
      distinctPublishers: counts.size,
      topPublisher: top ? `${top.name} (${Math.round(share * 100)}%)` : 'n/a'
    }
  };
}
