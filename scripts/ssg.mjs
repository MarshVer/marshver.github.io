import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadPostsFromDir } from './posts-data.mjs'

const DIST_DIR = path.resolve('dist')
const SSR_DIR = path.resolve('dist-ssr')

const TEMPLATE_FILE = path.join(DIST_DIR, 'index.html')
const SSR_MANIFEST_FILE = path.join(DIST_DIR, '.vite', 'ssr-manifest.json')
const CNAME_FILE = path.resolve('CNAME')

const POSTS_DIR = path.resolve('src/posts')

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeRe(s) {
  return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function htmlToText(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function setAttr(tag, attr, value) {
  const val = escapeHtml(value)
  const re = new RegExp(`\\b${escapeRe(attr)}=["'][^"']*["']`, 'i')
  if (re.test(tag)) return tag.replace(re, `${attr}="${val}"`)
  return tag.replace(/>$/, ` ${attr}="${val}">`)
}

function upsertMetaByName(html, name, content) {
  const re = new RegExp(`<meta\\b[^>]*\\bname=["']${escapeRe(name)}["'][^>]*>`, 'i')
  if (re.test(html)) return html.replace(re, (tag) => setAttr(tag, 'content', content))
  return html.replace(
    /<\/head>/i,
    `    <meta name="${escapeHtml(name)}" content="${escapeHtml(content)}" />\n  </head>`,
  )
}

function upsertMetaByProperty(html, property, content) {
  const re = new RegExp(
    `<meta\\b[^>]*\\bproperty=["']${escapeRe(property)}["'][^>]*>`,
    'i',
  )
  if (re.test(html)) return html.replace(re, (tag) => setAttr(tag, 'content', content))
  return html.replace(
    /<\/head>/i,
    `    <meta property="${escapeHtml(property)}" content="${escapeHtml(content)}" />\n  </head>`,
  )
}

function upsertLinkCanonical(html, href) {
  const re = /<link\b[^>]*\brel=["']canonical["'][^>]*>/i
  if (re.test(html)) return html.replace(re, (tag) => setAttr(tag, 'href', href))
  return html.replace(
    /<\/head>/i,
    `    <link rel="canonical" href="${escapeHtml(href)}" />\n  </head>`,
  )
}

function upsertLinkAlternate(html, { type, title, href }) {
  const t = String(type || '').trim()
  if (!t) return html
  const re = new RegExp(
    `<link\\b[^>]*\\brel=["']alternate["'][^>]*\\btype=["']${escapeRe(t)}["'][^>]*>`,
    'i',
  )
  const tag = `<link rel="alternate" type="${escapeHtml(t)}" title="${escapeHtml(title)}" href="${escapeHtml(href)}" />`
  if (re.test(html)) return html.replace(re, tag)
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`)
}

function setTitle(html, title) {
  const re = /<title>[\s\S]*?<\/title>/i
  const next = `<title>${escapeHtml(title)}</title>`
  if (re.test(html)) return html.replace(re, next)
  return html.replace(/<\/head>/i, `    ${next}\n  </head>`)
}

function normalizeSiteOrigin(raw) {
  const s = String(raw || '').trim().replace(/\/+$/g, '')
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  return `https://${s}`
}

async function inferSiteOrigin() {
  const fromEnv = normalizeSiteOrigin(process.env.SITE_URL || process.env.VITE_SITE_URL)
  if (fromEnv) return fromEnv

  const cname = await fs.readFile(CNAME_FILE, 'utf8').catch(() => '')
  const fromCname = normalizeSiteOrigin(cname)
  if (fromCname) return fromCname

  return 'https://marshver.github.io'
}

function toAbsoluteUrl(siteOrigin, pathname) {
  const p = String(pathname || '')
  if (!p) return siteOrigin
  if (/^https?:\/\//i.test(p)) return p
  if (p.startsWith('/')) return `${siteOrigin}${p}`
  return `${siteOrigin}/${p}`
}

function applyPageMeta(
  templateHtml,
  {
    siteOrigin,
    pathname,
    title,
    description,
    siteName = '',
    ogType = 'website',
    ogImagePath = '/og.png',
    articlePublishedTime = '',
    jsonLd = null,
    robots = '',
  },
) {
  const absUrl = toAbsoluteUrl(siteOrigin, pathname)
  const absOgImage = toAbsoluteUrl(siteOrigin, ogImagePath)

  let html = templateHtml
  html = setTitle(html, title)
  html = upsertLinkCanonical(html, absUrl)

  html = upsertLinkAlternate(html, {
    type: 'application/rss+xml',
    title: 'RSS',
    href: toAbsoluteUrl(siteOrigin, '/rss.xml'),
  })
  html = upsertLinkAlternate(html, {
    type: 'application/atom+xml',
    title: 'Atom',
    href: toAbsoluteUrl(siteOrigin, '/atom.xml'),
  })

  html = upsertMetaByName(html, 'description', description)
  if (robots) html = upsertMetaByName(html, 'robots', robots)

  html = upsertMetaByProperty(html, 'og:type', ogType)
  if (siteName) html = upsertMetaByProperty(html, 'og:site_name', siteName)
  html = upsertMetaByProperty(html, 'og:title', title)
  html = upsertMetaByProperty(html, 'og:description', description)
  html = upsertMetaByProperty(html, 'og:url', absUrl)
  html = upsertMetaByProperty(html, 'og:image', absOgImage)
  if (ogType === 'article' && articlePublishedTime) {
    html = upsertMetaByProperty(html, 'article:published_time', articlePublishedTime)
  }

  html = upsertMetaByName(html, 'twitter:title', title)
  html = upsertMetaByName(html, 'twitter:description', description)
  html = upsertMetaByName(html, 'twitter:image', absOgImage)

  html = upsertJsonLd(html, jsonLd)

  return html
}

function safeJsonForInlineScript(value) {
  // Avoid breaking out of <script> and reduce XSS risk from user content.
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}

function upsertJsonLd(html, jsonLd) {
  if (!jsonLd) return html
  const json = safeJsonForInlineScript(jsonLd)
  const tag = `<script type="application/ld+json">${json}</script>`
  const re = /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i
  if (re.test(html)) return html.replace(re, tag)
  return html.replace(/<\/head>/i, `    ${tag}\n  </head>`)
}

function renderPreloadLinks(modules, manifest) {
  if (!manifest) return ''
  const seen = new Set()
  let out = ''

  for (const id of modules || []) {
    const files = manifest[id]
    if (!files) continue
    for (const file of files) {
      if (seen.has(file)) continue
      seen.add(file)
      if (file.endsWith('.js')) {
        out += `    <link rel="modulepreload" crossorigin href="${file}" />\n`
      } else if (file.endsWith('.css')) {
        out += `    <link rel="stylesheet" href="${file}" />\n`
      }
    }
  }

  return out
}

async function writeFileEnsured(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}

function buildId() {
  const sha = String(process.env.GITHUB_SHA || '').trim()
  if (sha) return sha.slice(0, 12)
  return String(Date.now())
}

function toIsoDate(value) {
  const s = String(value || '').trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m?.[1] || ''
}

function toIsoDateTime(value) {
  const s = String(value || '').trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?/)
  if (!m) return ''
  const dt = `${m[1]}T${m[2] || '00:00:00'}`
  const d = new Date(dt)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toISOString()
}

function toRfc2822Date(value) {
  const iso = toIsoDateTime(value)
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  // RFC 2822-ish (same shape as RFC 1123) and accepted by RSS readers.
  return d.toUTCString()
}

function escapeXml(s) {
  return escapeHtml(s)
}

function buildRssXml(siteOrigin, { title, description, items }) {
  const now = new Date()
  const buildDate = now.toUTCString()

  const entryXml = (items || [])
    .map((it) => {
      const link = toAbsoluteUrl(siteOrigin, it.link)
      const pubDate = toRfc2822Date(it.date) || buildDate
      return [
        '  <item>',
        `    <title>${escapeXml(it.title)}</title>`,
        `    <link>${escapeXml(link)}</link>`,
        `    <guid isPermaLink="true">${escapeXml(link)}</guid>`,
        `    <pubDate>${escapeXml(pubDate)}</pubDate>`,
        `    <description>${escapeXml(it.description || '')}</description>`,
        '  </item>',
      ].join('\n')
    })
    .join('\n')

  const lines = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<rss version="2.0">')
  lines.push('<channel>')
  lines.push(`  <title>${escapeXml(title)}</title>`)
  lines.push(`  <link>${escapeXml(siteOrigin)}</link>`)
  lines.push(`  <description>${escapeXml(description)}</description>`)
  lines.push(`  <lastBuildDate>${escapeXml(buildDate)}</lastBuildDate>`)
  if (entryXml) lines.push(entryXml)
  lines.push('</channel>')
  lines.push('</rss>')
  return `${lines.join('\n')}\n`
}

function buildAtomXml(siteOrigin, { title, subtitle, items }) {
  const now = new Date()
  const updated = toIsoDateTime(items?.[0]?.date) || now.toISOString()

  const entryXml = (items || [])
    .map((it) => {
      const link = toAbsoluteUrl(siteOrigin, it.link)
      const iso = toIsoDateTime(it.date) || updated
      return [
        '  <entry>',
        `    <title>${escapeXml(it.title)}</title>`,
        `    <link href="${escapeXml(link)}" />`,
        `    <id>${escapeXml(link)}</id>`,
        `    <updated>${escapeXml(iso)}</updated>`,
        `    <summary>${escapeXml(it.description || '')}</summary>`,
        '  </entry>',
      ].join('\n')
    })
    .join('\n')

  const lines = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<feed xmlns="http://www.w3.org/2005/Atom">')
  lines.push(`  <title>${escapeXml(title)}</title>`)
  lines.push(`  <subtitle>${escapeXml(subtitle)}</subtitle>`)
  lines.push(`  <link href="${escapeXml(siteOrigin)}" />`)
  lines.push(
    `  <link rel="self" href="${escapeXml(toAbsoluteUrl(siteOrigin, '/atom.xml'))}" />`,
  )
  lines.push(`  <id>${escapeXml(siteOrigin)}</id>`)
  lines.push(`  <updated>${escapeXml(updated)}</updated>`)
  if (entryXml) lines.push(entryXml)
  lines.push('</feed>')
  return `${lines.join('\n')}\n`
}

function buildSitemapXml(siteOrigin, urls) {
  const lines = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

  for (const u of urls || []) {
    const loc = String(u?.loc || '').trim()
    if (!loc) continue
    const abs = toAbsoluteUrl(siteOrigin, loc)
    const lastmod = toIsoDate(u?.lastmod)

    lines.push('  <url>')
    lines.push(`    <loc>${escapeXml(abs)}</loc>`)
    if (lastmod) lines.push(`    <lastmod>${escapeXml(lastmod)}</lastmod>`)
    lines.push('  </url>')
  }

  lines.push('</urlset>')
  return `${lines.join('\n')}\n`
}

function buildRobotsTxt(siteOrigin, { disallow = [] } = {}) {
  const lines = []
  lines.push('User-agent: *')
  lines.push('Allow: /')
  for (const p of disallow || []) {
    const v = String(p || '').trim()
    if (v) lines.push(`Disallow: ${v}`)
  }
  lines.push(`Sitemap: ${toAbsoluteUrl(siteOrigin, '/sitemap.xml')}`)
  return `${lines.join('\n')}\n`
}

async function main() {
  const siteOrigin = await inferSiteOrigin()
  const id = buildId()

  const templateHtml = await fs.readFile(TEMPLATE_FILE, 'utf8')

  const manifestRaw = await fs.readFile(SSR_MANIFEST_FILE, 'utf8').catch(() => '')
  const manifest = manifestRaw ? JSON.parse(manifestRaw) : null

  // Load SSR renderer bundle (built via `vite build --ssr`).
  const ssrEntry = path.join(SSR_DIR, 'entry-server.js')
  const { render } = await import(pathToFileURL(ssrEntry).href)

  const { posts, postsBySlug } = await loadPostsFromDir(POSTS_DIR)
  const slimPosts = posts.map((p) => ({
    slug: p.slug,
    title: p.title,
    date: p.date,
  }))

  // 1) Emit decoupled data files.
  const postsIndexOut = path.join(DIST_DIR, 'data', 'posts.json')
  await writeFileEnsured(postsIndexOut, `${JSON.stringify({ buildId: id, posts }, null, 2)}\n`)

  for (const [slug, post] of postsBySlug.entries()) {
    const out = path.join(DIST_DIR, 'data', 'posts', `${slug}.json`)
    await writeFileEnsured(out, `${JSON.stringify({ buildId: id, post }, null, 2)}\n`)
  }

  // Build-time search index (no third-party deps). Used by Home/Archives search UI.
  {
    const docs = posts.map((p) => {
      const full = postsBySlug.get(p.slug)
      const text = htmlToText(full?.html || '').slice(0, 8000)
      return {
        slug: p.slug,
        title: p.title,
        date: p.date,
        excerpt: p.excerpt,
        tags: p.tags || [],
        categories: p.categories || [],
        text,
      }
    })

    const out = path.join(DIST_DIR, 'data', 'search.json')
    await writeFileEnsured(out, `${JSON.stringify({ buildId: id, docs }, null, 2)}\n`)
  }

  const SITE_TITLE = 'MarshVer的个人博客'
  const SITE_DESC = 'MarshVer 的个人博客，记录技术笔记、折腾与日常。'
  const AUTHOR_NAME = 'MarshVer'

  async function renderPage({
    url,
    outFile,
    meta,
    ssrState,
    clientState,
  }) {
    const { html: appHtml, modules } = await render(url, ssrState)

    let html = templateHtml
    html = html.replace('<!--ssr-outlet-->', appHtml)

    const preloadLinks = renderPreloadLinks(modules, manifest)
    html = html.replace('<!--preload-links-->', preloadLinks)

    const stateSnippet = `    <script>\n      window.__BUILD_ID__ = ${safeJsonForInlineScript(id)}\n      window.__INITIAL_STATE__ = ${safeJsonForInlineScript(clientState)}\n    </script>\n`
    html = html.replace('<!--initial-state-->', stateSnippet)

    html = applyPageMeta(html, { siteOrigin, ...meta })

    await writeFileEnsured(outFile, html)
  }

  // Home page
  await renderPage({
    url: '/',
    outFile: path.join(DIST_DIR, 'index.html'),
    ssrState: { posts },
    clientState: { posts },
    meta: {
      pathname: '/',
      title: SITE_TITLE,
      description: SITE_DESC,
      siteName: SITE_TITLE,
      ogType: 'website',
    },
  })

  // Archives
  await renderPage({
    url: '/archives',
    outFile: path.join(DIST_DIR, 'archives', 'index.html'),
    ssrState: { posts: slimPosts },
    clientState: { posts: slimPosts },
    meta: {
      pathname: '/archives/',
      title: `归档 - ${SITE_TITLE}`,
      description: SITE_DESC,
      siteName: SITE_TITLE,
      ogType: 'website',
    },
  })

  // Tags
  await renderPage({
    url: '/tags',
    outFile: path.join(DIST_DIR, 'tags', 'index.html'),
    ssrState: { posts },
    clientState: { posts },
    meta: {
      pathname: '/tags/',
      title: `标签 - ${SITE_TITLE}`,
      description: SITE_DESC,
      siteName: SITE_TITLE,
      ogType: 'website',
    },
  })

  // Posts
  for (const p of posts) {
    const slug = String(p.slug || '').trim()
    if (!slug) continue
    const full = postsBySlug.get(slug)
    if (!full) continue

    // Keep the inlined index slim for post pages, but include the current post excerpt
    // so client-side meta updates don't downgrade the description.
    const postsForPostPage = slimPosts.map((it) =>
      it.slug === slug ? { ...it, excerpt: String(full.excerpt || '') } : it,
    )

    await renderPage({
      url: `/posts/${encodeURIComponent(slug)}`,
      outFile: path.join(DIST_DIR, 'posts', slug, 'index.html'),
      ssrState: { posts: postsForPostPage, post: full },
      // Don't serialize `post.html` (can be huge). Client reuses server DOM on hydration.
      clientState: { posts: postsForPostPage },
      meta: {
        pathname: `/posts/${encodeURIComponent(slug)}/`,
        title: `${full.title} - ${SITE_TITLE}`,
        description: full.excerpt || SITE_DESC,
        siteName: SITE_TITLE,
        ogType: 'article',
        articlePublishedTime: toIsoDateTime(full.date),
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: String(full.title || ''),
          description: String(full.excerpt || SITE_DESC),
          datePublished: toIsoDateTime(full.date) || undefined,
          dateModified: toIsoDateTime(full.date) || undefined,
          inLanguage: 'zh-CN',
          author: { '@type': 'Person', name: AUTHOR_NAME },
          mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': toAbsoluteUrl(siteOrigin, `/posts/${encodeURIComponent(slug)}/`),
          },
          url: toAbsoluteUrl(siteOrigin, `/posts/${encodeURIComponent(slug)}/`),
          image: [toAbsoluteUrl(siteOrigin, '/og.png')],
          keywords: Array.from(
            new Set(
              [...(full.tags || []), ...(full.categories || [])]
                .map((x) => String(x || '').trim())
                .filter(Boolean),
            ),
          ),
        },
      },
    })
  }

  // GitHub Pages history fallback: serve a lightweight app shell for unknown routes (e.g. /admin).
  {
    let html = templateHtml
    html = html.replace('<!--ssr-outlet-->', '')
    html = html.replace('<!--preload-links-->', '')

    const shellState = {}
    const stateSnippet = `    <script>\n      window.__BUILD_ID__ = ${safeJsonForInlineScript(id)}\n      window.__INITIAL_STATE__ = ${safeJsonForInlineScript(shellState)}\n    </script>\n`
    html = html.replace('<!--initial-state-->', stateSnippet)

    html = applyPageMeta(html, {
      siteOrigin,
      pathname: '/',
      title: SITE_TITLE,
      description: SITE_DESC,
      siteName: SITE_TITLE,
      ogType: 'website',
      robots: 'noindex, nofollow',
    })

    await writeFileEnsured(path.join(DIST_DIR, '404.html'), html)
  }

  // Admin shell: make `/admin` return 200 (avoid relying on `404.html` SPA fallback).
  {
    let html = templateHtml
    html = html.replace('<!--ssr-outlet-->', '')
    html = html.replace('<!--preload-links-->', '')

    const shellState = {}
    const stateSnippet = `    <script>\n      window.__BUILD_ID__ = ${safeJsonForInlineScript(id)}\n      window.__INITIAL_STATE__ = ${safeJsonForInlineScript(shellState)}\n    </script>\n`
    html = html.replace('<!--initial-state-->', stateSnippet)

    html = applyPageMeta(html, {
      siteOrigin,
      pathname: '/admin/',
      title: `管理 - ${SITE_TITLE}`,
      description: '站点管理后台。',
      siteName: SITE_TITLE,
      ogType: 'website',
      robots: 'noindex, nofollow',
    })

    await writeFileEnsured(path.join(DIST_DIR, 'admin', 'index.html'), html)
  }

  // SEO: sitemap.xml + robots.txt
  {
    const urls = [
      { loc: '/', lastmod: '' },
      { loc: '/archives/', lastmod: '' },
      { loc: '/tags/', lastmod: '' },
      ...posts.map((p) => ({
        loc: `/posts/${encodeURIComponent(String(p.slug || '').trim())}/`,
        lastmod: p.date,
      })),
    ]

    await writeFileEnsured(path.join(DIST_DIR, 'sitemap.xml'), buildSitemapXml(siteOrigin, urls))
    await writeFileEnsured(
      path.join(DIST_DIR, 'robots.txt'),
      buildRobotsTxt(siteOrigin, { disallow: ['/admin'] }),
    )
  }

  // SEO: RSS / Atom feeds
  {
    const items = posts.map((p) => ({
      title: String(p.title || p.slug || ''),
      link: `/posts/${encodeURIComponent(String(p.slug || '').trim())}/`,
      date: p.date,
      description: String(p.excerpt || ''),
    }))

    await writeFileEnsured(
      path.join(DIST_DIR, 'rss.xml'),
      buildRssXml(siteOrigin, { title: SITE_TITLE, description: SITE_DESC, items }),
    )
    await writeFileEnsured(
      path.join(DIST_DIR, 'atom.xml'),
      buildAtomXml(siteOrigin, { title: SITE_TITLE, subtitle: SITE_DESC, items }),
    )
  }

  // eslint-disable-next-line no-console
  console.log(
    `ssg: wrote ${posts.length + 4} pages + data + seo (buildId=${id}, siteOrigin=${siteOrigin})`,
  )
}

await main()
