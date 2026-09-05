// ---------------------------------------------------------------------------
// The only file you need to edit to change what this site is about.
// Swap `activePack` to repoint every page, feed, and section.
// ---------------------------------------------------------------------------

export const site = {
  name: 'Magpie Brief',
  tagline: 'Everything that mattered in AI today, in one screen.',
  // Used for canonical URLs, sitemap.xml, and the RSS feed. No trailing slash.
  //
  // If this URL has a path (a GitHub project site serves from /<repo>/), that
  // path is used as the base for every internal link. Get this wrong and the
  // deployed site loads no CSS and has dead navigation, because root-absolute
  // hrefs resolve against the domain rather than the subdirectory.
  //
  // Root domain:      'https://magpiebrief.com'            -> links are /about/
  // Project subpath:  'https://you.github.io/magpiebrief'  -> links are /magpiebrief/about/
  //
  // Once magpiebrief.com is registered and pointed at Pages, change this single
  // line to 'https://magpiebrief.com' and every link, canonical tag, sitemap
  // entry and RSS URL follows automatically.
  url: 'https://ericaihaddadene-sketch.github.io/magpiebrief',
  // Published as a mailto: link on /advertise. Borrowed from another domain for
  // now; worth moving to a magpiebrief.com address once that domain is
  // registered, so enquiries don't arrive under an unrelated brand.
  contactEmail: 'hello@siteinthree.com',
  locale: 'en-US',
  // Shown in the footer. Keep it honest — it's what makes aggregation defensible.
  attribution: 'Headlines and short excerpts link to the original publisher. All rights remain with them.'
};

// ---------------------------------------------------------------------------
// FEED PACKS
// `weight` nudges a source up or down in ranking (1 = neutral).
// `section` groups it into a nav tab. Sections are created automatically.
// ---------------------------------------------------------------------------

export const feedPacks = {
  // Every URL below was verified live with `npm run check`. Two obvious
  // candidates were deliberately left out: VentureBeat returns HTTP 429 to any
  // aggregator, and arXiv's RSS is a paper firehose that goes empty at weekends.
  ai: [
    // `broad: true` marks a general-interest feed. Those get filtered against
    // ranking.topicFilter, so Hacker News front-page stories about gold reserves
    // or guitar frets don't end up on an AI site. Dedicated feeds skip the check.
    // `role: 'discovery'` means the feed surfaces other people's work rather
    // than publishing its own. Those items are attributed to whoever is at the
    // link, with the aggregator credited separately for the discussion.
    // `selfHosts` lists domains that DO originate there (Ask HN, text posts).
    { name: 'Hacker News',      url: 'https://hnrss.org/frontpage',                             section: 'Discussion', weight: 1.1, broad: true, role: 'discovery', excerpt: 'none', selfHosts: ['news.ycombinator.com'] },
    { name: 'Lobsters',         url: 'https://lobste.rs/rss',                                   section: 'Discussion', weight: 0.9, broad: true, role: 'discovery', excerpt: 'none', selfHosts: ['lobste.rs'] },

    // These three publish across all of tech, so they get topic-filtered too.
    { name: 'TechCrunch',       url: 'https://techcrunch.com/feed/',                            section: 'Industry',   weight: 1.0,  broad: true, excerpt: 'feed' },
    { name: 'The Verge',        url: 'https://www.theverge.com/rss/index.xml',                  section: 'Industry',   weight: 1.0,  broad: true, excerpt: 'feed' },
    { name: 'MIT Tech Review',  url: 'https://www.technologyreview.com/feed/',                  section: 'Industry',   weight: 1.05, broad: true, excerpt: 'feed' },
    // Already AI-only at the source, so no filtering needed.
    { name: 'Ars Technica AI',  url: 'https://arstechnica.com/ai/feed/',                        section: 'Industry',   weight: 1.1,  excerpt: 'feed' },
    { name: 'Wired AI',         url: 'https://www.wired.com/feed/tag/ai/latest/rss',            section: 'Industry',   weight: 1.0,  excerpt: 'feed' },
    { name: 'IEEE Spectrum',    url: 'https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss', section: 'Industry', weight: 1.0, excerpt: 'feed' },

    { name: 'OpenAI',           url: 'https://openai.com/news/rss.xml',                         section: 'Labs',       weight: 1.3,  excerpt: 'feed' },
    { name: 'Google DeepMind',  url: 'https://deepmind.google/blog/rss.xml',                    section: 'Labs',       weight: 1.3,  excerpt: 'feed' },
    { name: 'Google AI',        url: 'https://blog.google/technology/ai/rss/',                  section: 'Labs',       weight: 1.2,  excerpt: 'feed' },
    { name: 'Hugging Face',     url: 'https://huggingface.co/blog/feed.xml',                    section: 'Labs',       weight: 1.15, excerpt: 'feed' },
    { name: 'Simon Willison',   url: 'https://simonwillison.net/atom/everything/',              section: 'Labs',       weight: 1.2,  excerpt: 'feed' },

    { name: 'Google Research',  url: 'https://research.google/blog/rss/',                       section: 'Research',   weight: 1.0,  excerpt: 'feed' },
    { name: 'Microsoft Research', url: 'https://www.microsoft.com/en-us/research/feed/',        section: 'Research',   weight: 1.0,  excerpt: 'feed' },
    { name: 'MIT News AI',      url: 'https://news.mit.edu/rss/topic/artificial-intelligence2', section: 'Research',   weight: 0.95, excerpt: 'feed' },
    { name: 'Ahead of AI',      url: 'https://magazine.sebastianraschka.com/feed',              section: 'Research',   weight: 1.05, excerpt: 'feed' },

    // Import AI was dropped here. It returns HTTP 403 to GitHub Actions runners
    // (Substack blocks datacenter IPs) while working fine from a laptop, so it
    // passed `npm run check` locally and contributed nothing to the live site.
    // If you re-add a Substack, confirm it in a CI log, not just locally.

    // China coverage — the single biggest hole in the old list. Broad, since
    // SCMP covers all of Chinese tech and business.
    { name: 'SCMP Tech',        url: 'https://www.scmp.com/rss/36/feed',                        section: 'Industry',   weight: 0.95, broad: true, excerpt: 'feed' },
    // Funding and deals. Broad — most rounds it covers have nothing to do with AI.
    { name: 'Crunchbase News',  url: 'https://news.crunchbase.com/feed/',                       section: 'Industry',   weight: 0.95, broad: true, excerpt: 'feed' },

    { name: 'Alignment Forum',  url: 'https://www.alignmentforum.org/feed.xml',                 section: 'Policy & Safety', weight: 1.05, excerpt: 'feed' },
    // EFF publishes across all digital rights, so the topic filter keeps it to
    // the AI-adjacent posts.
    { name: 'EFF',              url: 'https://www.eff.org/rss/updates.xml',                     section: 'Policy & Safety', weight: 1.0,  broad: true, excerpt: 'feed' },
    // LessWrong runs well beyond AI, hence broad; when it is on topic it is
    // often first. Weighted down hard: it posts constantly and its items are
    // always fresh, so at parity it took four of the top ten with essays rather
    // than news. The per-source cap alone wasn't enough.
    { name: 'LessWrong',        url: 'https://www.lesswrong.com/feed.xml',                      section: 'Discussion', weight: 0.7,  broad: true, excerpt: 'feed' }
  ],

  // A second pack, ready to go. Nonprofit/grants is a genuinely easier niche to
  // monetize: far less competition for search traffic, and the advertisers
  // (grant software, fiscal sponsors, consultants) are easy to name and reach.
  // All five verified live. Candid, Devex, Inside Philanthropy, Grants.gov and
  // SSIR were all tried and dropped — 404, 403, or an empty feed. If you extend
  // this pack, run `npm run check -- <url>` before adding anything.
  //
  // Remember to swap `ranking.topicFilter` too if you make this pack active and
  // later add any `broad: true` feeds to it.
  grants: [
    { name: 'Nonprofit Quarterly',       url: 'https://nonprofitquarterly.org/feed/', section: 'Sector',  weight: 1.1 },
    { name: 'NonProfit PRO',             url: 'https://www.nonprofitpro.com/feed/',   section: 'Sector',  weight: 0.9 },
    { name: 'Nonprofit AF',              url: 'https://nonprofitaf.com/feed/',        section: 'Sector',  weight: 1.0 },
    { name: 'Chronicle of Philanthropy', url: 'https://www.philanthropy.com/feed',    section: 'Funders', weight: 1.15 },
    { name: 'Alliance Magazine',         url: 'https://alliancemagazine.org/feed/',   section: 'Global',  weight: 1.0 }
  ]
};

// Sections, nav, section pages and the RSS feed all rebuild from whichever pack
// this names. When switching, also update site.name / site.tagline above and
// ranking.topicFilter below so the site describes and filters for its subject.
export const activePack = 'ai';

// ---------------------------------------------------------------------------
// RANKING
// ---------------------------------------------------------------------------

export const ranking = {
  // A story loses half its score every N hours. Lower = more aggressively fresh.
  halfLifeHours: 10,
  // Drop anything older than this outright.
  maxAgeHours: 72,
  // How many stories on the front page.
  frontPageLimit: 45,
  perSectionLimit: 30,
  // No single outlet may hold more than this many of the top slots. Prevents
  // the highest-volume publisher from deciding what the front page looks like.
  maxPerSource: 4,
  // Two headlines whose IDF-weighted word overlap exceeds this are treated as
  // the same story; the strongest wins and the rest become "also covered by".
  // Weighted, so this is not simply "58% of words" — rare, story-defining words
  // dominate the comparison. Raise it if unrelated stories start merging.
  dupeThreshold: 0.42,
  // Each extra outlet covering a story multiplies its score by (1 + this).
  corroborationBonus: 0.18,

  // Vote counts, where a feed reports them (Hacker News puts "Points: 82" in
  // its description). This is the only direct measure of human attention in any
  // of the feeds — everything else is just "a publisher chose to publish it".
  //
  // Applied logarithmically: the gap between 20 and 200 points means something,
  // the gap between 1200 and 1400 does not. `reference` is roughly the score at
  // which a story counts as a genuine hit; `maxBoost` caps the multiplier so a
  // single viral thread cannot take over the front page, and so the one source
  // that reports points does not permanently outrank those that cannot.
  engagement: { weight: 0.7, reference: 500, maxBoost: 0.8 },
  // Title keyword multipliers. `claude: 0.5` means +50% score.
  boost: {
    claude: 0.5, anthropic: 0.5, openai: 0.35, gemini: 0.3, deepmind: 0.3,
    'open source': 0.25, benchmark: 0.2, funding: 0.2, acquisition: 0.25,
    lawsuit: 0.2, regulation: 0.2, release: 0.15, agent: 0.2
  },
  // Titles containing these are dropped. Aggregators live or die on noise control.
  blocklist: ['sponsored', 'advertisement', 'deals of the day', 'daily deals'],

  // Excerpt budget, in words. Excerpts exist to say why a link is worth
  // following, not to substitute for reading it. A source may set its own
  // `excerptWords`; a source without `excerpt: 'feed'` shows no excerpt at all,
  // and the build fails if one slips through.
  excerptWords: 26,

  // Warn (never silently re-weight) when one publisher dominates the day.
  concentrationWarning: 0.4,

  // Applied ONLY to feeds marked `broad: true`. An item must match at least one
  // of these (as a whole word, in the title or summary) to make it onto the
  // site. This is what keeps a general tech firehose on-subject — swap this list
  // when you swap feed packs.
  topicFilter: [
    'ai', 'a.i.', 'artificial intelligence', 'agi', 'llm', 'llms', 'ml',
    'machine learning', 'deep learning', 'neural', 'transformer', 'diffusion',
    'gpt', 'chatgpt', 'claude', 'gemini', 'llama', 'mistral', 'qwen', 'deepseek',
    'openai', 'anthropic', 'deepmind', 'hugging face', 'nvidia', 'perplexity',
    'model', 'models', 'inference', 'training', 'fine-tuning', 'finetuning',
    'prompt', 'prompting', 'rag', 'embedding', 'embeddings', 'tokenizer',
    'agent', 'agents', 'agentic', 'copilot', 'chatbot', 'benchmark',
    'alignment', 'interpretability', 'hallucination', 'context window',
    'tpu', 'cuda', 'datacenter', 'data center', 'robotics', 'humanoid',
    // Policy, chips and China terms, for the broad feeds added later. All are
    // AI-anchored on purpose: a bare 'regulation' or 'surveillance' would let
    // through most of EFF's output, which is about digital rights generally.
    'ai act', 'ai policy', 'ai regulation', 'ai safety', 'algorithmic',
    'deepfake', 'deepfakes', 'facial recognition', 'automated decision',
    'semiconductor', 'export controls'
    // 'gpu', 'chip', 'chips' and 'compute' were tried and removed: they are not
    // AI-specific enough on their own, and admitted things like "Rust SIMD on
    // the GPU". Genuine AI-hardware stories almost always say "AI" or "Nvidia".
  ]
};

// ---------------------------------------------------------------------------
// ADVERTISING
// Direct sponsor slots live in ads.json. This is the inventory you're selling.
// ---------------------------------------------------------------------------

export const advertising = {
  // Rendered on /advertise as your public rate card. Prices are placeholders —
  // do not publish numbers until you know your real monthly pageviews.
  inventory: [
    { slot: 'leaderboard', label: 'Top banner',      placement: 'Above the headlines, every page', size: '970x90 or text', monthly: 'TBD' },
    { slot: 'sidebar',     label: 'Sidebar unit',    placement: 'Right rail, sticky on desktop',   size: '300x250 or text', monthly: 'TBD' },
    { slot: 'inline',      label: 'In-feed native',  placement: 'Position 6 in the story list',    size: 'Text only',       monthly: 'TBD' },
    { slot: 'footer',      label: 'Footer mention',  placement: 'Bottom of every page',            size: 'Text only',       monthly: 'TBD' }
  ],
  // Appended to sponsor links so advertisers can prove the traffic came from you.
  utm: { source: 'magpiebrief', medium: 'sponsorship' }
};

export const adNetwork = {
  // Leave false until you have a live site with real traffic — AdSense and
  // Ezoic both require an existing, populated site to approve you at all.
  enabled: false,
  provider: 'adsense',            // 'adsense' | 'ezoic' | 'none'
  clientId: 'ca-pub-XXXXXXXXXXXXXXXX',
  slots: { leaderboard: '0000000000', sidebar: '0000000000' },
  // Lines written verbatim into /ads.txt. Required by most networks and by
  // any programmatic buyer. Format: domain, publisher-id, relationship
  adsTxt: [
    '# google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0'
  ]
};

export const fetching = {
  concurrency: 6,
  timeoutMs: 12000,
  retries: 1,
  // Points at a real page so a publisher checking their logs can find out who
  // is fetching them. It was pointing at example.com, which is worse than
  // sending no contact URL at all.
  userAgent: 'MagpieBriefBot/1.0 (+https://ericaihaddadene-sketch.github.io/magpiebrief/about/; RSS aggregator)'
};
