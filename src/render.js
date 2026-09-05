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
<link rel="icon" href="${esc(link(cfg, '/favicon.svg'))}" type="image/svg+xml">
<link rel="icon" href="${esc(link(cfg, '/favicon-32.png'))}" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${esc(link(cfg, '/apple-touch-icon.png'))}">
<link rel="alternate" type="application/rss+xml" title="${esc(cfg.site.name)}" href="${esc(link(cfg, '/feed.xml'))}">
<link rel="stylesheet" href="${esc(link(cfg, '/styles.css'))}">
${networkScript}
</head>`;
}

function nav(cfg, sections, active) {
  const links = sections
    .map((s) => {
      const href = link(cfg, `/${slugify(s)}/`);
      const cls = active === s ? ' class="active"' : '';
      return `<a${cls} href="${esc(href)}">${esc(s)}</a>`;
    })
    .join('');
  const homeCls = active === null ? ' class="active"' : '';
  return `<nav class="nav"><a${homeCls} href="${esc(link(cfg, '/'))}">Top</a>${links}</nav>`;
}

export function layout(cfg, ads, { title, description, canonical, sections, active = null, body, buildTime }) {
  return `${head(cfg, { title, description, canonical })}
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="masthead">
  <div class="wrap masthead__inner">
    <div class="brand">
      <a class="brand__name" href="${esc(link(cfg, '/'))}">
        <img class="brand__mark" src="${esc(link(cfg, '/logo-mark.png'))}" width="300" height="235" alt="" decoding="async">
        <span>${esc(cfg.site.name)}</span>
      </a>
      <p class="brand__tag">${esc(cfg.site.tagline)}</p>
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
      <a href="${esc(link(cfg, '/'))}">Top</a><a href="${esc(link(cfg, '/advertise/'))}">Advertise</a><a href="${esc(link(cfg, '/about/'))}">About</a><a href="${esc(link(cfg, '/feed.xml'))}">RSS</a>
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
      <span class="story__source">${esc(item.source)}</span>
      <span class="story__host">${esc(hostOf(item.link))}</span>
      <time datetime="${esc(item.date.toISOString())}">${esc(timeAgo(item.date, now))}</time>
    </div>
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
    <source url="${esc(cfg.site.url)}/feed.xml">${esc(s.source)}</source>
    <description>${esc(truncate(s.summary, 300))}</description>
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

export function renderSitemap(cfg, sections) {
  const urls = ['/', '/advertise/', '/about/', ...sections.map((s) => `/${slugify(s)}/`)];
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url><loc>${esc(cfg.site.url + u)}</loc><lastmod>${now}</lastmod><changefreq>hourly</changefreq></url>`
  )
  .join('\n')}
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
