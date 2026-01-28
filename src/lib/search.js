// Build-time generated search index (dist/data/search.json).
// Kept dependency-free for GitHub Pages deployments.

const SEARCH_INDEX_URL = '/data/search.json'

let SEARCH_DOCS = []
let searchIndexPromise = null

function getBuildId() {
  if (typeof window === 'undefined') return ''
  return String(window.__BUILD_ID__ || '')
}

function withBuildId(url) {
  const v = getBuildId()
  if (!v) return url
  const u = new URL(url, window.location.origin)
  u.searchParams.set('v', v)
  return u.toString()
}

function escapeRegExp(s) {
  return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function highlightHtml(text, terms) {
  const src = escapeHtml(text)
  const list = (terms || []).map((t) => String(t || '').trim()).filter(Boolean)
  if (!src || list.length === 0) return src

  // Highlight terms with a simple (safe) regex replacement on escaped HTML.
  let out = src
  for (const t of list) {
    const re = new RegExp(escapeRegExp(escapeHtml(t)), 'ig')
    out = out.replace(re, (m) => `<mark>${m}</mark>`)
  }
  return out
}

function normalizeStringArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean)
  return String(value || '')
    .split(/[,，]/g)
    .map((v) => v.trim())
    .filter(Boolean)
}

export async function ensureSearchIndex() {
  if (SEARCH_DOCS.length) return SEARCH_DOCS
  if (searchIndexPromise) return await searchIndexPromise

  searchIndexPromise = (async () => {
    const res = await fetch(withBuildId(SEARCH_INDEX_URL))
    if (!res.ok) throw new Error('Failed to load search index.')
    const data = await res.json().catch(() => ({}))
    const docs = Array.isArray(data) ? data : data?.docs
    SEARCH_DOCS = (Array.isArray(docs) ? docs : []).map((d) => ({
      slug: String(d?.slug || '').trim(),
      title: String(d?.title || '').trim(),
      date: String(d?.date || '').trim(),
      excerpt: String(d?.excerpt || '').trim(),
      tags: normalizeStringArray(d?.tags ?? d?.tag),
      categories: normalizeStringArray(d?.categories ?? d?.category),
      text: String(d?.text || '').trim(),
    }))
    SEARCH_DOCS = SEARCH_DOCS.filter((d) => d.slug)
    return SEARCH_DOCS
  })()

  try {
    return await searchIndexPromise
  } finally {
    searchIndexPromise = null
  }
}

function buildSnippet(text, terms, maxLen = 120) {
  const s = String(text || '').trim()
  if (!s) return ''
  const t = (terms || []).map((x) => String(x || '').trim()).filter(Boolean)
  if (t.length === 0) return s.length > maxLen ? `${s.slice(0, maxLen).trim()}...` : s

  const lower = s.toLowerCase()
  let hit = -1
  for (const term of t) {
    const pos = lower.indexOf(term.toLowerCase())
    if (pos !== -1 && (hit === -1 || pos < hit)) hit = pos
  }
  if (hit === -1) return s.length > maxLen ? `${s.slice(0, maxLen).trim()}...` : s

  const start = Math.max(0, hit - Math.floor(maxLen / 3))
  const end = Math.min(s.length, start + maxLen)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < s.length ? '...' : ''
  return `${prefix}${s.slice(start, end).trim()}${suffix}`
}

export function searchPosts(query, { limit = 200 } = {}) {
  const q = String(query || '').trim()
  if (!q) return []

  const terms = q
    .toLowerCase()
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter(Boolean)

  if (terms.length === 0) return []

  const results = []

  for (const d of SEARCH_DOCS) {
    const title = String(d.title || '')
    const excerpt = String(d.excerpt || '')
    const tags = normalizeStringArray(d.tags)
    const categories = normalizeStringArray(d.categories)
    const text = String(d.text || '')

    const titleLower = title.toLowerCase()
    const excerptLower = excerpt.toLowerCase()
    const textLower = text.toLowerCase()
    const tagLower = tags.map((t) => t.toLowerCase())
    const catLower = categories.map((c) => c.toLowerCase())

    // AND-match all terms across any of the fields.
    let ok = true
    for (const term of terms) {
      const inTitle = titleLower.includes(term)
      const inExcerpt = excerptLower.includes(term)
      const inTags = tagLower.some((t) => t.includes(term))
      const inCats = catLower.some((c) => c.includes(term))
      const inText = textLower.includes(term)
      if (!inTitle && !inExcerpt && !inTags && !inCats && !inText) {
        ok = false
        break
      }
    }
    if (!ok) continue

    let score = 0
    for (const term of terms) {
      if (titleLower.includes(term)) score += 100
      else if (tagLower.some((t) => t.includes(term))) score += 80
      else if (catLower.some((c) => c.includes(term))) score += 60
      else if (excerptLower.includes(term)) score += 40
      else if (textLower.includes(term)) score += 20
    }

    const snippetBase = excerpt || text
    const snippet = buildSnippet(snippetBase, terms, 140)

    results.push({
      ...d,
      score,
      titleHtml: highlightHtml(title || d.slug, terms),
      excerptHtml: highlightHtml(snippet || excerpt, terms),
    })
  }

  results.sort((a, b) => b.score - a.score || String(b.date).localeCompare(String(a.date)))
  return results.slice(0, Math.max(1, Number(limit) || 200))
}

