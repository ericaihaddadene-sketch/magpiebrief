// HTML generation. Plain template strings — no framework, no client-side JS,
// so pages are a single request and render instantly.

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

export function timeAgo(date, now = Date.now()) {
  const mins = Math.round((now - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function truncate(text, max = 180) {
  const clean = String(text ?? '').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

export const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Path prefix for internal links, taken from site.url.
 *
 * GitHub project sites serve from https://user.github.io/<repo>/, so a
 * root-absolute href like "/styles.css" resolves against the domain, not the
 * subdirectory, and the deployed site silently loses its stylesheet and its
 * navigation. Deriving the prefix from site.url means the one setting that has
 * to be right for canonical URLs is also the one that makes links work.
 */
export function basePath(cfg) {
  try {
    return new URL(cfg.site.url).pathname.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/** Build an internal link. `path` is always written root-relative. */
export function link(cfg, path) {
  const base = basePath(cfg);
  if (!path.startsWith('/')) path = '/' + path;
  // Root of a subpath site still needs its trailing slash.
  if (path === '/') return base ? base + '/' : '/';
  return base + path;
}

// ---------------------------------------------------------------------------
// Advertising
// ---------------------------------------------------------------------------

function withUtm(url, cfg, campaign) {
  try {
    const u = new URL(url);
    u.searchParams.set('utm_source', cfg.advertising.utm.source);
    u.searchParams.set('utm_medium', cfg.advertising.utm.medium);
    u.searchParams.set('utm_campaign', campaign);
    return u.toString();
  } catch {
    return url;
  }
}

function isLive(slot, today) {
  if (!slot || !slot.sold) return false;
  if (!slot.headline || !slot.url) return false;
  if (slot.startDate && slot.startDate > today) return false;
  if (slot.endDate && slot.endDate < today) return false;
  return true;
}

/**
 * Renders one ad position. Order of preference:
 *   1. A sold direct sponsor from ads.json (best money, no third-party JS)
 *   2. An ad-network unit, if enabled in config
 *   3. A house ad selling the slot itself — an empty slot should still work
 */
export function adSlot(name, ads, cfg, today = new Date().toISOString().slice(0, 10)) {
  const slot = ads?.slots?.[name];

  if (isLive(slot, today)) {
    // rel="sponsored" is required by Google for paid links. Omitting it puts
    // the site's search ranking at risk, which is the whole business.
    return `<aside class="ad ad--${esc(name)} ad--direct">
  <span class="ad__label">Sponsored</span>
  <a class="ad__body" href="${esc(withUtm(slot.url, cfg, name))}" rel="sponsored noopener" target="_blank">
    <strong class="ad__headline">${esc(slot.headline)}</strong>
    ${slot.body ? `<span class="ad__text">${esc(slot.body)}</span>` : ''}
    ${slot.cta ? `<span class="ad__cta">${esc(slot.cta)} →</span>` : ''}
  </a>
  ${slot.advertiser ? `<span class="ad__by">by ${esc(slot.advertiser)}</span>` : ''}
</aside>`;
  }

  if (cfg.adNetwork?.enabled && cfg.adNetwork.slots?.[name]) {
    return `<aside class="ad ad--${esc(name)} ad--network">
  <span class="ad__label">Advertisement</span>
  <ins class="adsbygoogle"
       style="display:block"
       data-ad-client="${esc(cfg.adNetwork.clientId)}"
       data-ad-slot="${esc(cfg.adNetwork.slots[name])}"
       data-ad-format="auto"
       data-full-width-responsive="true"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</aside>`;
  }

  return `<aside class="ad ad--${esc(name)} ad--house">
  <a class="ad__body" href="${esc(link(cfg, '/advertise/'))}">
    <strong class="ad__headline">This slot is available</strong>
    <span class="ad__text">Reach readers who follow ${esc(cfg.site.name)} daily.</span>
    <span class="ad__cta">See the rate card →</span>
  </a>
</aside>`;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function head(cfg, { title, description, canonical }) {
  const networkScript =
    cfg.adNetwork?.enabled && cfg.adNetwork.provider === 'adsense'
      ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(cfg.adNetwork.clientId)}" crossorigin="anonymous"></script>`
      : '';
  return `<!doctype html>
<html lang="${esc(cfg.site.locale || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:site_name" content="${esc(cfg.site.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(cfg.site.url)}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(cfg.site.name)} — ${esc(cfg.site.tagline)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(cfg.site.url)}/og.png">
<link rel="icon" href="${esc(link(cfg, '/favicon-16.png'))}" sizes="16x16" type="image/png">
<link rel="icon" href="${esc(link(cfg, '/favicon-32.png'))}" sizes="32x32" type="image/png">
<link rel="icon" href="${esc(link(cfg, '/favicon-48.png'))}" sizes="48x48" type="image/png">
<link rel="apple-touch-icon" href="${esc(link(cfg, '/apple-touch-icon.png'))}">
<link rel="alternate" type="application/rss+xml" title="${esc(cfg.site.name)}" href="${esc(link(cfg, '/feed.xml'))}">
<link rel="stylesheet" href="${esc(link(cfg, '/styles.css'))}">
${networkScript}
</head>`;
}

/** '2026-09-05' -> '/2026/09/05/' */
export function dayPath(date) {
  const [y, m, d] = date.split('-');
  return `/${y}/${m}/${d}/`;
}

/** '2026-09-05' -> 'Friday, 5 September 2026' */
export function formatDay(date, locale = 'en-GB') {
  return new Date(date + 'T12:00:00Z').toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  });
}

/**
 * Nav items may be a plain string (legacy article sections, slugified) or an
 * object { label, href, key } for real destinations such as category pages.
 * Categories belong here rather than as endless scroll on the brief.
 */
function nav(cfg, sections, active) {
  const links = sections
    .map((s) => {
      const isObj = s && typeof s === 'object';
      const label = isObj ? s.label : s;
      const href = link(cfg, isObj ? s.href : `/${slugify(s)}/`);
      const key = isObj ? s.key : s;
      const cls = active === key ? ' class="active"' : '';
      return `<a${cls} href="${esc(href)}">${esc(label)}</a>`;
    })
    .join('');
  const homeCls = active === null ? ' class="active"' : '';
  const briefCls = active === 'brief' ? ' class="active"' : '';
  const archiveCls = active === 'archive' ? ' class="active"' : '';
  return `<nav class="nav"><a${homeCls} href="${esc(link(cfg, '/'))}">Today</a>${links}` +
    `<a${briefCls} href="${esc(link(cfg, '/brief/'))}">Past briefs</a>` +
    `<a${archiveCls} href="${esc(link(cfg, '/archive/'))}">Archive</a></nav>`;
}

export function layout(cfg, ads, { title, description, canonical, sections, active = null, body, buildTime }) {
  return `${head(cfg, { title, description, canonical })}
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="masthead">
  <div class="wrap masthead__inner">
    <div class="brand">
      <a class="brand__logo" href="${esc(link(cfg, '/'))}" aria-hidden="true" tabindex="-1">
        <img class="brand__mark" src="${esc(link(cfg, '/logo-mark.png'))}" width="300" height="235" alt="" decoding="async">
      </a>
      <div class="brand__text">
        <a class="brand__name" href="${esc(link(cfg, '/'))}">${esc(cfg.site.name)}</a>
        <p class="brand__tag">${esc(cfg.site.tagline)}</p>
      </div>
    </div>
    <div class="masthead__meta">
      <span class="updated">Updated ${esc(buildTime)}</span>
      <a class="rss" href="${esc(link(cfg, '/feed.xml'))}">RSS</a>
    </div>
  </div>
</header>
${nav(cfg, sections, active)}
<div class="wrap leaderboard">${adSlot('leaderboard', ads, cfg)}</div>
<main id="main" class="wrap layout">
${body}
</main>
<footer class="footer">
  <div class="wrap">
    ${adSlot('footer', ads, cfg)}
    <div class="footer__links">
      <a href="${esc(link(cfg, '/'))}">Top</a><a href="${esc(link(cfg, '/methodology/'))}">Methodology</a><a href="${esc(link(cfg, '/sources/'))}">Sources</a><a href="${esc(link(cfg, '/rights/'))}">Corrections &amp; rights</a><a href="${esc(link(cfg, '/advertise/'))}">Advertise</a><a href="${esc(link(cfg, '/about/'))}">About</a><a href="${esc(link(cfg, '/feed.xml'))}">RSS</a>
    </div>
    <p class="footer__legal">${esc(cfg.site.attribution)}</p>
    <p class="footer__legal">© ${new Date().getFullYear()} ${esc(cfg.site.name)}. Built ${esc(buildTime)}.</p>
  </div>
</footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Story list
// ---------------------------------------------------------------------------

function storyMarkup(item, rank, now) {
  const related = (item.related || []).length
    ? `<div class="story__also">Also covered by ${item.related
        .slice(0, 4)
        .map((r) => `<a href="${esc(r.link)}" rel="noopener" target="_blank">${esc(r.source)}</a>`)
        .join(', ')}</div>`
    : '';
  const summary = truncate(item.summary, 190);
  return `<article class="story">
  <span class="story__rank">${rank}</span>
  <div class="story__main">
    <h2 class="story__title"><a href="${esc(item.link)}" rel="noopener" target="_blank">${esc(item.title)}</a></h2>
    ${summary ? `<p class="story__summary">${esc(summary)}</p>` : ''}
    <div class="story__meta">
      <span class="story__source">${esc(item.publisher || item.source)}</span>
      <span class="story__host">${esc(item.publisherDomain || hostOf(item.link))}</span>
      <time datetime="${esc(item.date.toISOString())}">${esc(timeAgo(item.date, now))}</time>
      ${item.discoveredVia ? `<span class="story__via">via ${esc(item.discoveredVia)}</span>` : ''}
      ${item.points ? `<span class="story__points">${item.points} pts</span>` : ''}
    </div>
    ${item.discussionUrl ? `<a class="story__discuss" href="${esc(item.discussionUrl)}" rel="noopener" target="_blank">Discuss on ${esc(item.discoveredVia || item.source)} →</a>` : ''}
    ${related}
  </div>
</article>`;
}

/** Story list with a native ad spliced in after the 5th item. */
export function storyList(items, ads, cfg, now) {
  const out = [];
  items.forEach((item, i) => {
    out.push(storyMarkup(item, i + 1, now));
    if (i === 4) out.push(`<div class="inline-ad">${adSlot('inline', ads, cfg)}</div>`);
  });
  return out.join('\n');
}

function sidebar(cfg, ads, sources) {
  const top = sources
    .slice(0, 12)
    .map((s) => `<li><span>${esc(s.name)}</span><span class="count">${s.count}</span></li>`)
    .join('');
  return `<aside class="sidebar">
  ${adSlot('sidebar', ads, cfg)}
  <section class="panel">
    <h3 class="panel__title">Sources today</h3>
    <ul class="sources">${top}</ul>
  </section>
  <section class="panel">
    <h3 class="panel__title">Advertise here</h3>
    <p class="panel__text">Four slots, no trackers, no pop-ups. Readers who work in the field.</p>
    <a class="btn" href="${esc(link(cfg, '/advertise/'))}">See the rate card</a>
  </section>
</aside>`;
}

export function renderIndex(cfg, ads, { stories, sections, sources, buildTime, now }) {
  const body = `<div class="content">
  <h1 class="page-title">Today's top stories</h1>
  ${storyList(stories, ads, cfg, now)}
</div>
${sidebar(cfg, ads, sources)}`;
  return layout(cfg, ads, {
    title: `${cfg.site.name} — ${cfg.site.tagline}`,
    description: cfg.site.tagline,
    canonical: cfg.site.url + '/',
    sections,
    active: null,
    body,
    buildTime
  });
}

export function renderSection(cfg, ads, { section, stories, sections, sources, buildTime, now }) {
  const body = `<div class="content">
  <h1 class="page-title">${esc(section)}</h1>
  ${stories.length ? storyList(stories, ads, cfg, now) : '<p class="empty">Nothing in the last few days.</p>'}
</div>
${sidebar(cfg, ads, sources)}`;
  return layout(cfg, ads, {
    title: `${section} — ${cfg.site.name}`,
    description: `The latest ${section.toLowerCase()} stories, ranked.`,
    canonical: `${cfg.site.url}/${slugify(section)}/`,
    sections,
    active: section,
    body,
    buildTime
  });
}

export function renderAdvertise(cfg, ads, { sections, buildTime, stats }) {
  const rows = cfg.advertising.inventory
    .map((i) => {
      const slot = ads?.slots?.[i.slot];
      const taken = isLive(slot, new Date().toISOString().slice(0, 10));
      return `<tr>
      <td><strong>${esc(i.label)}</strong></td>
      <td>${esc(i.placement)}</td>
      <td>${esc(i.size)}</td>
      <td>${esc(i.monthly)}</td>
      <td class="${taken ? 'taken' : 'open'}">${taken ? 'Booked' : 'Available'}</td>
    </tr>`;
    })
    .join('');

  const body = `<div class="content content--prose">
  <h1 class="page-title">Advertise on ${esc(cfg.site.name)}</h1>
  <p class="lede">${esc(cfg.site.tagline)} We aggregate ${stats.feedCount} sources into one ranked page, updated every hour.</p>

  <h2>Why this audience</h2>
  <p>Readers come here deliberately, once or twice a day, to find out what happened. There are no pop-ups, no autoplay video, no interstitials, and no third-party tracking scripts. That means your placement is one of very few things on the page competing for attention.</p>

  <h2>Inventory</h2>
  <table class="rate-card">
    <thead><tr><th>Slot</th><th>Placement</th><th>Format</th><th>Per month</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="fineprint">Every sponsor link is tagged with UTM parameters so you can verify the traffic in your own analytics. Slots are sold monthly and rotate on the 1st.</p>

  <h2>What we need from you</h2>
  <ul>
    <li>A headline, up to about 60 characters</li>
    <li>One or two sentences of body copy</li>
    <li>A call to action and a destination URL</li>
  </ul>
  <p>No creative to produce and no ad server to configure — sponsorships are plain text, styled to match the site, so they load instantly and can't be blocked.</p>

  <h2>Get in touch</h2>
  <p class="cta-line"><a class="btn btn--lg" href="mailto:${esc(cfg.site.contactEmail)}?subject=Sponsorship%20enquiry">${esc(cfg.site.contactEmail)}</a></p>
  <p class="fineprint">Include the slot you want and the month. We'll confirm availability the same day.</p>
</div>`;
  return layout(cfg, ads, {
    title: `Advertise — ${cfg.site.name}`,
    description: `Sponsorship slots on ${cfg.site.name}.`,
    canonical: cfg.site.url + '/advertise/',
    sections,
    body,
    buildTime
  });
}

export function renderAbout(cfg, ads, { sections, buildTime, sources }) {
  const list = sources
    .map((s) => `<li>${esc(s.name)}${s.host ? ` <span class="muted">${esc(s.host)}</span>` : ''}</li>`)
    .join('');
  const body = `<div class="content content--prose">
  <h1 class="page-title">About ${esc(cfg.site.name)}</h1>
  <p class="lede">${esc(cfg.site.tagline)}</p>

  <h2>How it works</h2>
  <p>Every hour we read the public RSS and Atom feeds listed below, group articles that cover the same story, and rank what's left by how recent it is, how many outlets picked it up, and how much weight we give the source. The result is a single page you can read in two minutes.</p>

  <h2>What we publish</h2>
  <p>A headline, a short excerpt, the outlet's name, and a link. Nothing more. Every link goes straight to the publisher — we don't reproduce articles, host copies, or put their words behind our own ads. ${esc(cfg.site.attribution)}</p>

  <h2>Publishers</h2>
  <p>If you'd rather not appear here, email <a href="mailto:${esc(cfg.site.contactEmail)}">${esc(cfg.site.contactEmail)}</a> and we'll remove your feed the same day. Our crawler identifies itself and honours conditional requests, so it won't add meaningful load to your servers.</p>

  <h2>Sources</h2>
  <ul class="source-list">${list}</ul>
</div>`;
  return layout(cfg, ads, {
    title: `About — ${cfg.site.name}`,
    description: `How ${cfg.site.name} selects and ranks stories.`,
    canonical: cfg.site.url + '/about/',
    sections,
    body,
    buildTime
  });
}

// ---------------------------------------------------------------------------
// Transparency pages
// ---------------------------------------------------------------------------

export function renderMethodology(cfg, ads, { sections, buildTime, stats }) {
  const body = `<div class="content content--prose">
  <h1 class="page-title">Methodology</h1>
  <p class="lede">How ${esc(cfg.site.name)} decides what appears, in plain language.</p>

  <h2>What this is</h2>
  <p>${esc(cfg.site.name)} is a discovery product, not a publication. It reads the public feeds of ${stats.sourceCount} sources every hour, groups reports about the same development, ranks what is left, and sends you to the original. The value is in the finding, filtering and ordering — not in reproducing anyone's writing.</p>

  <h2>How stories are selected</h2>
  <p>Anything older than ${cfg.ranking.maxAgeHours} hours is dropped. General-interest sources — those that cover all of technology rather than this subject specifically — must match a subject keyword <em>in the headline</em> to qualify, because a headline that doesn't signal the subject isn't useful in a one-screen brief.</p>

  <h2>How ranking works</h2>
  <p>Each story scores on recency, how much weight we give the source, and whether its headline contains terms that usually mark significant developments. Scores halve every ${cfg.ranking.halfLifeHours} hours. Two further signals matter:</p>
  <ul>
    <li><strong>Corroboration.</strong> Several outlets independently covering one development is the best available evidence that it matters, so a cluster outranks a single loud headline.</li>
    <li><strong>Reader attention.</strong> Where a source publishes vote counts, they contribute logarithmically and are capped, so one viral thread cannot take the page.</li>
  </ul>
  <p>No single publisher may hold more than ${cfg.ranking.maxPerSource} of the top slots, so the site is not decided by whoever posts most often. We publish the shape of the ranking, not the exact weights.</p>

  <h2>Related coverage</h2>
  <p>Headlines are compared by their distinctive words, weighted so that rare, story-defining terms decide the match and common ones count for little. When several reports describe one development they collapse into a single entry, and the others appear as “also covered by”, each still linking to its own publisher.</p>

  <h2>Publishers and discovery venues</h2>
  <p>These are different roles and we record them separately. When a story reaches us through a discussion site, the publisher is whoever wrote it; the discussion site is credited as where we found it, with its own link. An aggregator is never presented as the author of someone else's article.</p>

  <h2>Excerpts</h2>
  <p>Most entries are a headline, a source and a link. Where an excerpt appears it comes from the publisher's own feed — text they chose to syndicate — is capped at ${cfg.ranking.excerptWords} words, and is shown only for sources whose entry in our register permits it. Sources we have not reviewed are link-only by default. We do not fetch article bodies, and we never reproduce photography.</p>

  <h2>Corrections and rights</h2>
  <p>Publishers own their material. If you want an excerpt shortened or removed, your feed dropped, or attribution corrected, see <a href="${esc(link(cfg, '/rights/'))}">corrections and content rights</a>. Requests take effect on the next build.</p>

  <h2>Advertising</h2>
  <p>Advertising and ranking share no code. A sponsor buys a labelled slot; a sponsor cannot buy a position in the story list, inclusion in related coverage, or removal of unfavourable coverage. Sponsored placements are always marked. The build refuses to publish an advertisement that lacks a named advertiser.</p>
</div>
${sidebarPolicy(cfg, ads)}`;

  return layout(cfg, ads, {
    title: `Methodology — ${cfg.site.name}`,
    description: `How ${cfg.site.name} selects, ranks and attributes stories.`,
    canonical: cfg.site.url + '/methodology/',
    sections,
    body,
    buildTime
  });
}

export function renderRights(cfg, ads, { sections, buildTime }) {
  const mail = (subject) =>
    `mailto:${esc(cfg.site.contactEmail)}?subject=${encodeURIComponent(subject)}`;
  const body = `<div class="content content--prose">
  <h1 class="page-title">Corrections &amp; content rights</h1>
  <p class="lede">Publishers own their material. If something here is wrong, or you want your work handled differently, this page is the route — and it is a real one.</p>

  <h2>What we can change</h2>
  <table class="rate-card">
    <thead><tr><th>Request</th><th>Effect</th></tr></thead>
    <tbody>
      <tr><td><strong>Remove an excerpt</strong></td><td>Your source becomes link-only: headline, publication name, date and link, nothing more.</td></tr>
      <tr><td><strong>Remove a source entirely</strong></td><td>The feed is dropped and stops being fetched. The block persists across every future build.</td></tr>
      <tr><td><strong>Correct attribution</strong></td><td>Publisher name or canonical link is fixed, including in the archive.</td></tr>
      <tr><td><strong>Correct or remove an archived item</strong></td><td>Archived entries are editable. We do not keep a description we know to be wrong.</td></tr>
      <tr><td><strong>Shorten excerpts</strong></td><td>A per-source word limit below our ${cfg.ranking.excerptWords}-word default.</td></tr>
    </tbody>
  </table>

  <h2>How to ask</h2>
  <p class="cta-line"><a class="btn btn--lg" href="${mail('Content rights request')}">${esc(cfg.site.contactEmail)}</a></p>
  <p>Include the publication and the URL. For a removal, say whether you want excerpts dropped or the source removed altogether. We will confirm, and the change takes effect on the next hourly build.</p>

  <h2>What we already don't do</h2>
  <ul>
    <li>We do not fetch article bodies. Only public feeds are read.</li>
    <li>We do not bypass paywalls, logins or any access control — there is nothing in the pipeline capable of it.</li>
    <li>We do not copy or rehost photography.</li>
    <li>We do not republish full articles, and every headline links to the original.</li>
  </ul>
  <p class="fineprint">Our crawler identifies itself and honours conditional requests, so a source that hasn't changed is fetched at almost no cost to its servers.</p>

  <h2>Corrections to our own work</h2>
  <p>If a ranking, cluster or attribution here is wrong — an entry crediting the wrong publisher, or unrelated reports grouped as one story — tell us at the same address and we will fix it.</p>
</div>
${sidebarPolicy(cfg, ads)}`;

  return layout(cfg, ads, {
    title: `Corrections & content rights — ${cfg.site.name}`,
    description: `How publishers can correct attribution, limit excerpts, or have a source removed from ${cfg.site.name}.`,
    canonical: cfg.site.url + '/rights/',
    sections,
    body,
    buildTime
  });
}

export function renderSources(cfg, ads, { groups, sections, buildTime }) {
  const blocks = groups
    .map(({ section, entries }) => {
      const rows = entries
        .map(
          (e) => `<tr>
      <td><strong>${esc(e.name)}</strong><br><span class="muted">${esc(e.host)}</span></td>
      <td>${e.role === 'discovery' ? 'Discussion venue' : 'Publisher'}</td>
      <td>${e.excerpt === 'feed' ? 'Headline + short feed excerpt' : 'Headline + link only'}</td>
      <td class="${e.count ? 'open' : ''}">${e.count}</td>
    </tr>`
        )
        .join('');
      return `<h2>${esc(section)}</h2>
  <table class="rate-card">
    <thead><tr><th>Source</th><th>Role</th><th>What we show</th><th>Live now</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
    })
    .join('\n');

  const total = groups.reduce((n, g) => n + g.entries.length, 0);

  const body = `<div class="content content--prose">
  <h1 class="page-title">Sources</h1>
  <p class="lede">The ${total} feeds ${esc(cfg.site.name)} monitors, what role each plays, and exactly how much of each we display. “Live now” is how many of its stories are currently on the site.</p>
  ${blocks}
  <p class="fineprint">Discussion venues surface other people's work; stories found through them are attributed to the original publisher, with the venue credited separately. Sources marked link-only show no excerpt at all. To change how your publication appears, see <a href="${esc(link(cfg, '/rights/'))}">corrections and content rights</a>.</p>
</div>
${sidebarPolicy(cfg, ads)}`;

  return layout(cfg, ads, {
    title: `Sources — ${cfg.site.name}`,
    description: `Every feed ${cfg.site.name} monitors, with its role and display policy.`,
    canonical: cfg.site.url + '/sources/',
    sections,
    body,
    buildTime
  });
}

function sidebarPolicy(cfg, ads) {
  return `<aside class="sidebar">
  ${adSlot('sidebar', ads, cfg)}
  <section class="panel">
    <h3 class="panel__title">Transparency</h3>
    <ul class="sources">
      <li><a href="${esc(link(cfg, '/methodology/'))}">How stories are chosen</a></li>
      <li><a href="${esc(link(cfg, '/sources/'))}">Sources we monitor</a></li>
      <li><a href="${esc(link(cfg, '/rights/'))}">Corrections &amp; rights</a></li>
      <li><a href="${esc(link(cfg, '/about/'))}">About</a></li>
    </ul>
  </section>
</aside>`;
}

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------

/** Archived stories show a fixed publication time; "3d ago" is meaningless on
 *  a page that is explicitly about one past day. */
function archiveStoryMarkup(rec, rank, locale) {
  const when = new Date(rec.published).toLocaleTimeString(locale, {
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false
  });
  const also = (rec.also || []).length
    ? `<div class="story__also">Also covered by ${rec.also
        .map((r) => `<a href="${esc(r.link)}" rel="noopener" target="_blank">${esc(r.source)}</a>`)
        .join(', ')}</div>`
    : '';
  return `<article class="story">
  <span class="story__rank">${rank}</span>
  <div class="story__main">
    <h2 class="story__title"><a href="${esc(rec.link)}" rel="noopener" target="_blank">${esc(rec.title)}</a></h2>
    ${rec.summary ? `<p class="story__summary">${esc(truncate(rec.summary, 190))}</p>` : ''}
    <div class="story__meta">
      <span class="story__source">${esc(rec.publisher || rec.source)}</span>
      <span class="story__host">${esc(rec.publisherDomain || hostOf(rec.link))}</span>
      <time datetime="${esc(rec.published)}">${esc(when)} UTC</time>
      ${rec.discoveredVia ? `<span class="story__via">via ${esc(rec.discoveredVia)}</span>` : ''}
      ${rec.points ? `<span class="story__points">${rec.points} pts</span>` : ''}
    </div>
    ${also}
  </div>
</article>`;
}

export function renderArchiveDay(cfg, ads, { record, prev, next, sections, buildTime }) {
  const locale = cfg.site.locale || 'en-GB';
  const pretty = formatDay(record.date, locale);
  const nav = [
    prev ? `<a href="${esc(link(cfg, dayPath(prev)))}">← ${esc(formatDay(prev, locale))}</a>` : '<span></span>',
    next ? `<a href="${esc(link(cfg, dayPath(next)))}">${esc(formatDay(next, locale))} →</a>` : '<span></span>'
  ].join('');

  const body = `<div class="content">
  <h1 class="page-title">${esc(pretty)}</h1>
  ${record.summary ? `<p class="day-summary">${esc(record.summary)}</p>` : ''}
  <p class="day-count">${record.stories.length} ${record.stories.length === 1 ? 'story' : 'stories'}, ranked by how big they got.</p>
  ${record.stories.map((r, i) => archiveStoryMarkup(r, i + 1, locale)).join('\n')}
  <div class="day-nav">${nav}</div>
</div>
${sidebarArchive(cfg, ads)}`;

  return layout(cfg, ads, {
    title: `AI news, ${pretty} — ${cfg.site.name}`,
    description: `Everything that mattered in AI on ${pretty}: ${record.stories.length} stories from ${new Set(record.stories.map((s) => s.source)).size} sources, ranked.`,
    canonical: cfg.site.url + dayPath(record.date),
    sections,
    active: 'archive',
    body,
    buildTime
  });
}

function sidebarArchive(cfg, ads) {
  return `<aside class="sidebar">
  ${adSlot('sidebar', ads, cfg)}
  <section class="panel">
    <h3 class="panel__title">About the archive</h3>
    <p class="panel__text">Every day since launch is kept at a permanent address, ranked as it stood that day. Nothing is rewritten later.</p>
    <a class="btn" href="${esc(link(cfg, '/archive/'))}">Browse all days</a>
  </section>
</aside>`;
}

export function renderArchiveIndex(cfg, ads, { days, sections, buildTime }) {
  const locale = cfg.site.locale || 'en-GB';
  // Group by month so a long archive stays scannable.
  const months = new Map();
  for (const d of days) {
    const key = d.date.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key).push(d);
  }

  const groups = [...months.entries()]
    .map(([month, entries]) => {
      const label = new Date(month + '-01T12:00:00Z').toLocaleDateString(locale, {
        month: 'long', year: 'numeric', timeZone: 'UTC'
      });
      const items = entries
        .map((e) => `<li>
        <a href="${esc(link(cfg, dayPath(e.date)))}">${esc(formatDay(e.date, locale))}</a>
        <span class="archive__count">${e.stories.length}</span>
      </li>`)
        .join('');
      return `<section class="archive__month">
    <h2 class="archive__label">${esc(label)}</h2>
    <ul class="archive__days">${items}</ul>
  </section>`;
    })
    .join('\n');

  const total = days.reduce((n, d) => n + d.stories.length, 0);

  const body = `<div class="content">
  <h1 class="page-title">Archive</h1>
  <p class="lede">${days.length} ${days.length === 1 ? 'day' : 'days'}, ${total} stories. Each day keeps a permanent address and the ranking it had at the time.</p>
  ${days.length ? groups : '<p class="empty">The archive starts filling from the first build.</p>'}
</div>
${sidebarArchive(cfg, ads)}`;

  return layout(cfg, ads, {
    title: `Archive — ${cfg.site.name}`,
    description: `Every day of AI news collected by ${cfg.site.name}, kept at permanent addresses.`,
    canonical: cfg.site.url + '/archive/',
    sections,
    active: 'archive',
    body,
    buildTime
  });
}

// ---------------------------------------------------------------------------
// Non-HTML outputs
// ---------------------------------------------------------------------------

export function renderFeedXml(cfg, stories) {
  const items = stories
    .slice(0, 50)
    .map(
      (s) => `  <item>
    <title>${esc(s.title)}</title>
    <link>${esc(s.link)}</link>
    <guid isPermaLink="true">${esc(s.link)}</guid>
    <source url="${esc(cfg.site.url)}/feed.xml">${esc(s.publisher || s.source)}</source>
    <description>${esc(s.summary || '')}</description>
    <pubDate>${s.date.toUTCString()}</pubDate>
  </item>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${esc(cfg.site.name)}</title>
  <link>${esc(cfg.site.url)}/</link>
  <description>${esc(cfg.site.tagline)}</description>
  <language>${esc(cfg.site.locale || 'en')}</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>`;
}

export function renderSitemap(cfg, sections, archiveDates = []) {
  const now = new Date().toISOString();
  const live = ['/', '/advertise/', '/about/', '/archive/', '/brief/', '/methodology/', '/sources/', '/rights/', ...sections.map((s) => (typeof s === 'string' ? `/${slugify(s)}/` : s.href))];

  const rows = [
    ...live.map(
      (u) => `  <url><loc>${esc(cfg.site.url + u)}</loc><lastmod>${now}</lastmod><changefreq>hourly</changefreq></url>`
    ),
    // Archived days are finished: they stop changing once the day is over, so
    // they get their own date as lastmod and tell crawlers not to re-check.
    ...archiveDates.map(
      (d) => `  <url><loc>${esc(cfg.site.url + dayPath(d))}</loc><lastmod>${d}</lastmod><changefreq>never</changefreq></url>`
    )
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.join('\n')}
</urlset>`;
}

export function renderRobots(cfg) {
  return `User-agent: *
Allow: /

Sitemap: ${cfg.site.url}/sitemap.xml
`;
}

export function renderAdsTxt(cfg) {
  const lines = cfg.adNetwork?.adsTxt || [];
  return `# ads.txt — authorised digital sellers for ${cfg.site.name}
# Uncomment and fill in your real publisher ID before selling programmatically.
${lines.join('\n')}
`;
}
