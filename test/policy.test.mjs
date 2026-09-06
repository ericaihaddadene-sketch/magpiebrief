// Guardrail tests. Run with: node test/policy.test.mjs
//
// These assert the rules the pipeline enforces, not the wording of any page.
// If one of these fails, the build should refuse to publish.

import { validate } from '../src/policy.js';
import { resolveProvenance, publisherFromUrl, domainOf, trimWords } from '../src/provenance.js';
import { renderFeedXml } from '../src/render.js';

let pass = 0, fail = 0;
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) console.log(`       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`);
};

const cfg = { ranking: { excerptWords: 26, concentrationWarning: 0.4 } };
const HN = {
  name: 'Hacker News', url: 'https://hnrss.org/frontpage',
  role: 'discovery', excerpt: 'none', selfHosts: ['news.ycombinator.com']
};
const VERGE = { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', excerpt: 'feed' };

const story = (over = {}) => ({
  title: 'A story', link: 'https://example.com/a', publisher: 'Example',
  publisherDomain: 'example.com', source: 'Example', summary: '',
  excerptPolicy: 'none', discoveredVia: null, ...over
});

// --- provenance: publisher and discovery venue stay separate ----------------

const viaHN = resolveProvenance(
  { link: 'https://engineering.atspotify.com/post', commentsUrl: 'https://news.ycombinator.com/item?id=1' },
  HN
);
eq('discovery: publisher taken from the link, not the feed', viaHN.publisher, 'engineering.atspotify.com');
eq('discovery: feed credited as discovery venue', viaHN.discoveredVia, 'Hacker News');
eq('discovery: discussion url preserved', viaHN.discussionUrl, 'https://news.ycombinator.com/item?id=1');
eq('discovery: not treated as a self post', viaHN.isSelfPost, false);

const askHN = resolveProvenance(
  { link: 'https://news.ycombinator.com/item?id=42', commentsUrl: 'https://news.ycombinator.com/item?id=42' },
  HN
);
eq('discovery: content actually hosted there IS the publisher', askHN.publisher, 'Hacker News');
eq('discovery: self post has no separate discovery venue', askHN.discoveredVia, null);

const fromVerge = resolveProvenance({ link: 'https://www.theverge.com/x', commentsUrl: null }, VERGE);
eq('publisher feed: named from config', fromVerge.publisher, 'The Verge');
eq('publisher feed: no discovery venue', fromVerge.discoveredVia, null);

eq('publisher name: known domain mapped', publisherFromUrl('https://arxiv.org/abs/1'), 'arXiv');
eq('publisher name: subdomain resolves to parent', publisherFromUrl('https://blog.eff.org/x'), 'EFF');
eq('publisher name: unknown falls back to domain', publisherFromUrl('https://thoughtbot.com/x'), 'thoughtbot.com');
eq('domainOf strips www', domainOf('https://www.wired.com/a'), 'wired.com');

// --- excerpts ---------------------------------------------------------------

eq('trimWords: under budget untouched', trimWords('one two three', 26), 'one two three');
eq('trimWords: over budget truncates', trimWords('a b c d e', 3), 'a b c…');
eq('trimWords: empty stays empty', trimWords('', 26), '');

const excerptFromLinkOnly = validate({
  stories: [story({ summary: 'copied text from a publisher', excerptPolicy: 'none' })],
  feeds: [HN], ads: {}, cfg
});
eq('excerpt from a link-only source is a hard error', excerptFromLinkOnly.errors.length, 1);

const okExcerpt = validate({
  stories: [story({ summary: 'a permitted short excerpt', excerptPolicy: 'feed', source: 'The Verge' })],
  feeds: [VERGE], ads: {}, cfg
});
eq('excerpt from a permitted source passes', okExcerpt.errors, []);

const tooLong = validate({
  stories: [story({ summary: Array(40).fill('word').join(' '), excerptPolicy: 'feed', source: 'The Verge' })],
  feeds: [VERGE], ads: {}, cfg
});
eq('over-long excerpt is a hard error', tooLong.errors.length, 1);

const linkOnlyFallback = validate({ stories: [story({ summary: '' })], feeds: [HN], ads: {}, cfg });
eq('link-only item publishes cleanly', linkOnlyFallback.errors, []);
eq('link-only item is counted as such', linkOnlyFallback.stats.linkOnly, 1);

// --- provenance requirements -------------------------------------------------

eq('missing canonical url is a hard error',
  validate({ stories: [story({ link: '' })], feeds: [HN], ads: {}, cfg }).errors.length, 1);
eq('non-http url is a hard error',
  validate({ stories: [story({ link: 'javascript:alert(1)' })], feeds: [HN], ads: {}, cfg }).errors.length, 1);
eq('missing publisher is a hard error',
  validate({ stories: [story({ publisher: '' })], feeds: [HN], ads: {}, cfg }).errors.length, 1);
eq('aggregator named as its own publisher is a hard error',
  validate({
    stories: [story({ publisher: 'Hacker News', discoveredVia: 'Hacker News' })],
    feeds: [HN], ads: {}, cfg
  }).errors.length, 1);

// --- advertising -------------------------------------------------------------

const undisclosedAd = validate({
  stories: [story()], feeds: [HN], cfg,
  ads: { slots: { sidebar: { sold: true, headline: 'Buy', url: 'https://e.com', advertiser: '' } } }
});
eq('sold ad without a named advertiser is a hard error', undisclosedAd.errors.length, 1);

const goodAd = validate({
  stories: [story()], feeds: [HN], cfg,
  ads: { slots: { sidebar: { sold: true, headline: 'Buy', url: 'https://e.com', advertiser: 'Example Co' } } }
});
eq('properly disclosed ad passes', goodAd.errors, []);

const unsoldAd = validate({
  stories: [story()], feeds: [HN], cfg,
  ads: { slots: { sidebar: { sold: false, advertiser: '' } } }
});
eq('unsold slot needs no advertiser', unsoldAd.errors, []);

// Sponsor data must not be able to reach a ranking score.
import { scoreItem } from '../src/rank.js';
const ranking = { halfLifeHours: 10, boost: {}, engagement: null };
// Pin the clock: scoring decays with age, so two calls a millisecond apart
// differ for reasons that have nothing to do with sponsorship.
const at = Date.now();
const base = { date: new Date(at), title: 'x', sourceWeight: 1 };
eq('sponsorship fields cannot change a score',
  scoreItem({ ...base, isSponsored: true, advertiser: 'Example Co', sponsorBid: 9999 }, at, ranking),
  scoreItem({ ...base }, at, ranking));

// --- concentration is a warning, never a hard failure ------------------------

const concentrated = validate({
  stories: [story({ publisher: 'One' }), story({ publisher: 'One' }), story({ publisher: 'One' }), story({ publisher: 'Two' })],
  feeds: [HN], ads: {}, cfg
});
eq('source concentration warns', concentrated.warnings.length, 1);
eq('source concentration does not block publication', concentrated.errors, []);

// --- RSS obeys the same rules ------------------------------------------------

const rssCfg = {
  site: { name: 'T', url: 'https://t.example', tagline: 'x', locale: 'en' },
  ranking: cfg.ranking
};
const rss = renderFeedXml(rssCfg, [
  { title: 'Link only', link: 'https://example.com/a', publisher: 'Example', source: 'Hacker News',
    summary: '', date: new Date() },
  { title: 'Permitted', link: 'https://example.com/b', publisher: 'The Verge', source: 'The Verge',
    summary: 'short permitted excerpt', date: new Date() }
]);
eq('RSS emits no description for a link-only item', /<description><\/description>/.test(rss), true);
eq('RSS carries the permitted excerpt', rss.includes('short permitted excerpt'), true);
eq('RSS credits the publisher, not the discovery venue', rss.includes('<source url="https://t.example/feed.xml">Example</source>'), true);
eq('RSS does not name the aggregator as source', rss.includes('>Hacker News</source>'), false);

// A house placement is still an advertisement: it must be disclosed like one.
const housed = validate({
  stories: [story()], feeds: [HN], cfg,
  ads: { slots: { sidebar: { sold: true, house: true, headline: 'H', url: 'https://e.com', advertiser: 'Site in Three' } } }
});
eq('house placement with an advertiser passes', housed.errors, []);

const housedAnon = validate({
  stories: [story()], feeds: [HN], cfg,
  ads: { slots: { sidebar: { sold: true, house: true, headline: 'H', url: 'https://e.com', advertiser: '' } } }
});
eq('house placement still needs a named advertiser', housedAnon.errors.length, 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
