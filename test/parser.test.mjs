// Run with: node test/parser.test.mjs
import { parseFeed, feedTitle, decodeEntities, cleanSummary, extractEngagement } from '../src/feed-parser.js';
import { engagementBoost } from '../src/rank.js';

let pass = 0, fail = 0;
const eq = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) console.log(`       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`);
};

const rss = `<rss><channel><title>Test Chan</title>
<item><title><![CDATA[Big &amp; Bold News]]></title><link>https://ex.com/a</link><description>&lt;p&gt;Some &quot;summary&quot; text long enough to be worth showing&lt;/p&gt;</description><pubDate>Wed, 03 Sep 2026 10:00:00 GMT</pubDate></item>
<item><title>Dropped: no link</title></item>
</channel></rss>`;

const atom = `<feed><title>Atom Chan</title>
<entry><title>Atom Story &#8212; Dashed</title><link rel="self" href="https://ex.com/self"/><link rel="alternate" href="https://ex.com/b"/><summary>Atom summary</summary><published>2026-09-02T08:00:00Z</published></entry>
</feed>`;

const rssItems = parseFeed(rss);
const atomItems = parseFeed(atom);

eq('rss: channel title', feedTitle(rss), 'Test Chan');
eq('rss: item count drops linkless item', rssItems.length, 1);
eq('rss: CDATA + entity in title', rssItems[0].title, 'Big & Bold News');
eq('rss: link', rssItems[0].link, 'https://ex.com/a');
eq('rss: html stripped from summary', rssItems[0].summary, 'Some "summary" text long enough to be worth showing');
eq('rss: pubDate parsed', rssItems[0].date instanceof Date && !isNaN(rssItems[0].date), true);

eq('atom: feed title', feedTitle(atom), 'Atom Chan');
eq('atom: item count', atomItems.length, 1);
eq('atom: numeric entity decoded', atomItems[0].title, 'Atom Story — Dashed');
eq('atom: prefers rel=alternate over rel=self', atomItems[0].link, 'https://ex.com/b');

eq('entities: hex', decodeEntities('&#x2014;'), '—');
eq('entities: unknown left alone', decodeEntities('&bogus;'), '&bogus;');
eq('malformed input is not fatal', parseFeed('<rss><channel><item><title>x'), []);
eq('null input', parseFeed(null), []);

eq('double-escaped html in summary', parseFeed("<rss><item><title>t</title><link>https://e.com</link><description>&amp;lt;b&amp;gt;bold and considerably longer text here&amp;lt;/b&amp;gt;</description></item></rss>")[0].summary, 'bold and considerably longer text here');
eq('raw html inside CDATA summary', parseFeed("<rss><item><title>t</title><link>https://e.com</link><description><![CDATA[<p>Hi <a href=\"#\">there</a> and welcome to this longer test sentence</p>]]></description></item></rss>")[0].summary, 'Hi there and welcome to this longer test sentence');

eq('cleanSummary: strips HN plumbing', cleanSummary('Article URL: https://a.com/x Comments URL: https://news.ycombinator.com/item?id=1 Points: 82 # Comments: 45', 'Some title'), '');
eq('cleanSummary: strips reddit byline', cleanSummary('submitted by /u/someone', 'T'), '');
eq('cleanSummary: drops summary echoing the title', cleanSummary('Anthropic ships a new model', 'Anthropic ships a new model'), '');
eq('cleanSummary: keeps real prose', cleanSummary('Researchers found that models trained on synthetic data degrade over time.', 'Model collapse'), 'Researchers found that models trained on synthetic data degrade over time.');
eq('cleanSummary: removes bare urls but keeps prose', cleanSummary('A good read at https://example.com/post about scaling laws and their limits.', 'T'), 'A good read at about scaling laws and their limits.');

eq('engagement: points parsed', extractEngagement('Points: 214 # Comments: 88').points, 214);
eq('engagement: comments parsed', extractEngagement('Points: 214 # Comments: 88').comments, 88);
eq('engagement: absent when not present', extractEngagement('just some prose').points, null);
eq('engagement: null input safe', extractEngagement(null).points, null);
eq('engagement survives summary cleaning', parseFeed("<rss><item><title>A story</title><link>https://e.com/x</link><description>&lt;p&gt;Article URL: &lt;a&gt;https://e.com/x&lt;/a&gt;&lt;/p&gt;&lt;p&gt;Points: 214&lt;/p&gt;&lt;p&gt;# Comments: 88&lt;/p&gt;</description></item></rss>")[0].points, 214);
eq('engagement: summary still cleaned to empty', parseFeed("<rss><item><title>A story</title><link>https://e.com/x</link><description>&lt;p&gt;Article URL: &lt;a&gt;https://e.com/x&lt;/a&gt;&lt;/p&gt;&lt;p&gt;Points: 214&lt;/p&gt;&lt;p&gt;# Comments: 88&lt;/p&gt;</description></item></rss>")[0].summary, '');

const R = { engagement: { weight: 0.7, reference: 500, maxBoost: 0.8 } };
eq('boost: no points is neutral', engagementBoost(null, R), 1);
eq('boost: zero points is neutral', engagementBoost(0, R), 1);
eq('boost: grows with points', engagementBoost(200, R) > engagementBoost(20, R), true);
eq('boost: capped', engagementBoost(500000, R) <= 1 + R.engagement.maxBoost, true);
eq('boost: disabled without config', engagementBoost(500, {}), 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
