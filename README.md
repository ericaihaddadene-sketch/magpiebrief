# Magpie Brief

A static news aggregator with ad inventory built in. Reads RSS/Atom feeds,
clusters duplicate coverage, ranks what's left, and writes plain HTML.

**Zero npm dependencies.** Node 18+ and nothing else.

```bash
npm run build     # fetch feeds, write dist/
npm start         # build, then preview at http://localhost:4321
npm run check     # feed health report
npm test          # parser unit tests
```

---

## Changing what the site is about

Everything lives in `config.js`.

```js
export const activePack = 'ai';   // or 'grants'
```

Two packs ship with it. `ai` is the default (18 verified feeds across
Discussion / Industry / Labs / Research). `grants` is a starter pack for
nonprofit funding news — a much less competitive niche where direct ad sales
are easier, because you can name the ten companies who'd want the slot.

To build your own pack, add feeds to `feedPacks` and point `activePack` at it:

```js
{ name: 'Some Blog', url: 'https://…/feed', section: 'Industry', weight: 1.1, broad: true }
```

| Field | Meaning |
|---|---|
| `section` | Nav tab. Sections are created automatically from whatever you use. |
| `weight` | Ranking multiplier. `1` is neutral; `1.3` favours a source, `0.9` demotes it. |
| `broad` | Mark general-interest feeds. They get filtered against `ranking.topicFilter`. |

**Always run `npm run check` after editing feeds.** It fetches each URL and
reports item counts and freshness, so you catch a dead feed before it's live:

```bash
npm run check                                  # check the active pack
npm run check -- https://example.com/feed.xml  # test a candidate first
```

### About `broad`

A niche site can't just dump a general tech feed onto the front page. Hacker
News will happily hand you stories about gold reserves and guitar frets. Any
feed marked `broad: true` must match at least one `ranking.topicFilter` keyword
(whole-word, title or summary) to be published. Feeds that are already
subject-specific — Ars Technica's AI section, a lab's own blog — skip the check.

**If you change packs, change `topicFilter` to match**, or your broad feeds will
be filtered against the wrong subject.

---

## How ranking works

1. **Filter** — drop anything older than `maxAgeHours`, blocklisted, future-dated
   (a feed with a broken clock would otherwise pin junk to the top forever), or
   off-topic from a `broad` feed.
2. **Score** — `recency × sourceWeight × keyword boosts`, where recency halves
   every `halfLifeHours`.
3. **Cluster** — headlines are stemmed and compared by **IDF-weighted** overlap.
   Plain word overlap doesn't work on a niche site: "openai" appears in a third
   of AI headlines, so it carries almost no signal, while "sandbox" or "rogue"
   nearly identifies a story on its own. Weighting by rarity is what lets three
   outlets covering one event collapse into a single entry with "also covered by".
4. **Corroborate** — each additional outlet multiplies the score. Several
   newsrooms covering the same thing is the best available signal that it matters.
5. **Diversify** — no source may hold more than `maxPerSource` of the top slots.
   Without this the front page is decided by whoever publishes most often.

Tuning: raise `dupeThreshold` if unrelated stories merge, lower it if obvious
duplicates slip through. Lower `halfLifeHours` for a faster-moving site.

---

## The archive

Every build folds its ranked stories into `archive/<date>.json`, one file per
day, and renders a permanent page at `/YYYY/MM/DD/` plus an index at
`/archive/`.

This exists because the build is otherwise amnesiac. It wipes `dist/` and
regenerates the same seven URLs, so nothing accumulates: there is no stable
address to link to, nothing for search engines to index beyond a single page
that changes hourly, and a reader who misses a day has missed it permanently.
The archive turns a disposable page into something that compounds.

Two details that matter:

- **The archive is committed to the repo, by a job that only runs on the
  schedule.** CI checks out fresh on every run, so anything not committed is
  gone next build. The commit carries `[skip ci]`, without which each build
  would trigger another build forever.

  The commit is a separate job on purpose. When it lived in the build job it
  ran on every trigger including `push`, so pushing to main caused CI to
  commit seconds later and leave your local branch behind immediately —
  every push then needed a rebase. A push now only builds and deploys. The
  archive job reuses the build’s output rather than rebuilding, so what gets
  committed is exactly what was deployed and the feeds are not fetched twice.
- **Entries keep their peak score, not their latest one.** Scores decay with
  age, and the build runs hourly. Ordering an archived day by current score
  would rank stories by how late in the day they broke rather than how big they
  got.

Each day record has an empty `summary` field, rendered when non-empty. Filling
it with a few sentences of real synthesis is what would make these pages worth
indexing — a page of headlines and excerpts is thin content, and search engines
have spent a decade learning to ignore exactly that. The archive is useful to
readers without it; it is not competitive in search until it exists.

## Selling advertising

Four slots: `leaderboard`, `sidebar`, `inline` (position 6 in the story list),
and `footer`. Each renders in this order of preference:

1. **A sold direct sponsor** from `ads.json`
2. **An ad-network unit**, if `adNetwork.enabled` is true in `config.js`
3. **A house ad** selling the slot itself, linking to `/advertise`

That third case matters: an empty slot still does work by advertising your
inventory. `/advertise` is generated from `config.js` and shows live
Booked/Available status pulled from `ads.json`.

To run a campaign, edit `ads.json` and rebuild:

```json
{ "sold": true, "advertiser": "Example Co", "headline": "…",
  "body": "…", "cta": "Start building", "url": "https://example.com",
  "startDate": "2026-09-01", "endDate": "2026-09-30" }
```

Dates are honoured — a slot outside its window falls back to the house ad
automatically, so a campaign can't overrun what the advertiser paid for.

Sponsor links get UTM parameters (so the advertiser can verify traffic in their
own analytics) and `rel="sponsored"`, which Google requires on paid links.
Omitting that risks the site's search ranking, which is the whole business.

### Turning on an ad network

Set `adNetwork.enabled = true` and fill in `clientId` and `slots`. Then edit
`adNetwork.adsTxt` — networks and programmatic buyers won't transact without a
valid `/ads.txt`.

Note that **AdSense and Ezoic both require an existing site with real traffic**
before they'll approve you, so this is a step for later, not launch day.

### The honest revenue picture

Programmatic ads on a general news aggregator pay on the order of a few dollars
per thousand pageviews. That means meaningful revenue needs traffic you won't
have for a long time. One direct sponsor in a narrow niche is usually worth more
than months of network ads — and this is why the default design is text
sponsorships with no third-party scripts: they load instantly, can't be blocked
by ad blockers, and are something you can actually sell over email.

---

## Deploying

`dist/` is plain static files. Any host works.

**GitHub Pages** — `.github/workflows/build.yml` is set up already: it rebuilds
hourly, runs the tests first, caches feed responses between runs, and deploys.
Enable Pages with "GitHub Actions" as the source, and set `site.url` in
`config.js` to your real domain first — canonical URLs, the sitemap, and RSS all
depend on it.

**Netlify / Cloudflare Pages** — build `npm run build`, publish directory `dist`.

---

## Being a good citizen

The fetcher sends `ETag`/`If-Modified-Since`, so a publisher who hasn't posted
anything returns a 304 with no body — most rebuilds cost them almost nothing.
It identifies itself with a real User-Agent pointing at `/about`, retries once,
and falls back to cached content when a server is down rather than dropping the
source. One dead feed never fails a build.

Two sources were deliberately left out of the default pack, both discovered by
running `npm run check`: **VentureBeat** returns HTTP 429 to aggregators, and
**arXiv** is a paper firehose that returns an empty feed at weekends.

## On copyright

The site publishes a headline, a short excerpt, the outlet's name, and a link
out. It never reproduces full article text or hosts copies. That's the ordinary,
well-trodden shape of feed aggregation — but it's the reason to keep summaries
short, keep every link pointing at the publisher, and honour removal requests
promptly. `/about` states this and gives publishers a contact address.

Summaries are also sanitized: feeds like Hacker News put `Article URL: … Points:
82` in the description rather than prose, and showing that under a headline
looks broken, so anything that reduces to plumbing is dropped entirely.

---

## Layout

```
config.js                 feeds, ranking, ad inventory — the only file to edit
ads.json                  live campaigns
src/feed-parser.js        RSS + Atom parser, entity/CDATA handling
src/fetch.js              conditional GET, retries, concurrency pool
src/rank.js               stemming, IDF clustering, topic filter, diversity
src/render.js             HTML, ad slots, RSS/sitemap/robots/ads.txt
src/build.js              orchestrator
src/check-feeds.js        feed health report
src/serve.js              local preview
test/parser.test.mjs      21 parser tests
public/styles.css         all styling; light + dark
```
