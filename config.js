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
    { name: 'Hacker News',      url: 'https://hnrss.org/frontpage',                             section: 'Discussion', weight: 1.1, broad: true },
    { name: 'Lobsters',         url: 'https://lobste.rs/rss',                                   section: 'Discussion', weight: 0.9, broad: true },

    // These three publish across all of tech, so they get topic-filtered too.
    { name: 'TechCrunch',       url: 'https://techcrunch.com/feed/',                            section: 'Industry',   weight: 1.0,  broad: true },
    { name: 'The Verge',        url: 'https://www.theverge.com/rss/index.xml',                  section: 'Industry',   weight: 1.0,  broad: true },
    { name: 'MIT Tech Review',  url: 'https://www.technologyreview.com/feed/',                  section: 'Industry',   weight: 1.05, broad: true },
    // Already AI-only at the source, so no filtering needed.
    { name: 'Ars Technica AI',  url: 'https://arstechnica.com/ai/feed/',                        section: 'Industry',   weight: 1.1 },
    { name: 'Wired AI',         url: 'https://www.wired.com/feed/tag/ai/latest/rss',            section: 'Industry',   weight: 1.0 },
    { name: 'IEEE Spectrum',    url: 'https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss', section: 'Industry', weight: 1.0 },

    { name: 'OpenAI',           url: 'https://openai.com/news/rss.xml',                         section: 'Labs',       weight: 1.3 },
    { name: 'Google DeepMind',  url: 'https://deepmind.google/blog/rss.xml',                    section: 'Labs',       weight: 1.3 },
    { name: 'Google AI',        url: 'https://blog.google/technology/ai/rss/',                  section: 'Labs',       weight: 1.2 },
    { name: 'Hugging Face',     url: 'https://huggingface.co/blog/feed.xml',                    section: 'Labs',       weight: 1.15 },
    { name: 'Simon Willison',   url: 'https://simonwillison.net/atom/everything/',              section: 'Labs',       weight: 1.2 },

    { name: 'Google Research',  url: 'https://research.google/blog/rss/',                       section: 'Research',   weight: 1.0 },
    { name: 'Microsoft Research', url: 'https://www.microsoft.com/en-us/research/feed/',        section: 'Research',   weight: 1.0 },
    { name: 'MIT News AI',      url: 'https://news.mit.edu/rss/topic/artificial-intelligence2', section: 'Research',   weight: 0.95 },
    { name: 'Import AI',        url: 'https://importai.substack.com/feed',                      section: 'Research',   weight: 1.1 },
    { name: 'Ahead of AI',      url: 'https://magazine.sebastianraschka.com/feed',              section: 'Research',   weight: 1.05 }
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
  // Title keyword multipliers. `claude: 0.5` means +50% score.
  boost: {
    claude: 0.5, anthropic: 0.5, openai: 0.35, gemini: 0.3, deepmind: 0.3,
    'open source': 0.25, benchmark: 0.2, funding: 0.2, acquisition: 0.25,
    lawsuit: 0.2, regulation: 0.2, release: 0.15, agent: 0.2
  },
  // Titles containing these are dropped. Aggregators live or die on noise control.
  blocklist: ['sponsored', 'advertisement', 'deals of the day', 'daily deals'],

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
    'gpu', 'tpu', 'cuda', 'datacenter', 'data center', 'robotics', 'humanoid'
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
