import { ref } from 'vue'

// In production, posts metadata/content are served as static JSON generated at build time.
const POSTS_INDEX_URL = '/data/posts.json'
const POST_URL_PREFIX = '/data/posts/'

let POSTS_META = []
let POSTS_HAS_EXCERPT = false
const POST_CACHE = new Map()
const POST_PROMISES = new Map()

export const postsRevision = ref(0)
export const postsLoaded = ref(false)

let postsIndexPromise = null

function getBuildId() {
  // Set by the SSG output to help avoid stale browser caching for JSON files.
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

function normalizePostMeta(p) {
  const slug = String(p?.slug || '').trim()
  if (!slug) return null
  const title = String(p?.title || '').trim() || slug
  const date = String(p?.date || '').trim() || '未设置日期'
  const excerpt = String(p?.excerpt || '').trim()
  return { slug, title, date, excerpt }
}

function setPostsMeta(posts) {
  const raw = Array.isArray(posts) ? posts : []
  // We treat the index as "full" only when every item includes an `excerpt` field.
  // (In SSG, post pages may inline a slim index without excerpts to reduce HTML size.)
  POSTS_HAS_EXCERPT = raw.length > 0 && raw.every((p) => Object.prototype.hasOwnProperty.call(p || {}, 'excerpt'))
  POSTS_META = raw.map(normalizePostMeta).filter(Boolean)
  postsLoaded.value = true
  postsRevision.value += 1
}

function setPostCache(post) {
  const slug = String(post?.slug || '').trim()
  if (!slug) return
  const title = String(post?.title || '').trim() || slug
  const date = String(post?.date || '').trim() || '未设置日期'
  const excerpt = String(post?.excerpt || '').trim()
  const html = String(post?.html || '')
  POST_CACHE.set(slug, { slug, title, date, excerpt, html })
}

function readInitialState() {
  if (typeof window === 'undefined') return null
  const s = window.__INITIAL_STATE__
  if (!s || typeof s !== 'object') return null
  return s
}

// Hydrate from SSG output as early as possible so Vue can hydrate without mismatches.
{
  const initial = readInitialState()
  if (initial?.posts) setPostsMeta(initial.posts)
  if (initial?.post) setPostCache(initial.post)

  // Avoid serializing large HTML strings into `__INITIAL_STATE__` for post pages.
  // When we are hydrating a pre-rendered `/posts/:slug` page, reuse the server HTML already in the DOM.
  if (typeof document !== 'undefined') {
    const m = String(window.location.pathname || '').match(/\/posts\/([^/]+)(?:\/|$)/)
    const slug = m ? decodeURIComponent(m[1]) : ''
    if (slug && !POST_CACHE.has(slug)) {
      const el = document.querySelector('.markdown')
      if (el) {
        const meta = getPostMetaBySlug(slug)
        setPostCache({
          slug,
          title: meta?.title,
          date: meta?.date,
          excerpt: meta?.excerpt,
          html: el.innerHTML,
        })
      }
    }
  }
}

export function applyInitialState(state) {
  const s = state && typeof state === 'object' ? state : null
  if (!s) return
  if (s.posts) setPostsMeta(s.posts)
  if (s.post) setPostCache(s.post)
}

export function resetPostsState() {
  POSTS_META = []
  POST_CACHE.clear()
  POST_PROMISES.clear()
  postsLoaded.value = false
  postsRevision.value += 1
}

export function getAllPosts() {
  return POSTS_META
}

export function getPostMetaBySlug(slug) {
  const s = String(slug || '').trim()
  if (!s) return null
  return POSTS_META.find((p) => p.slug === s) || null
}

export function getCachedPost(slug) {
  const s = String(slug || '').trim()
  if (!s) return null
  return POST_CACHE.get(s) || null
}

export async function ensurePostsIndex() {
  if (postsLoaded.value && POSTS_HAS_EXCERPT) return POSTS_META
  if (postsIndexPromise) return postsIndexPromise

  postsIndexPromise = (async () => {
    const res = await fetch(withBuildId(POSTS_INDEX_URL))
    if (!res.ok) throw new Error('Failed to load posts index.')
    const data = await res.json().catch(() => ({}))
    const list = Array.isArray(data) ? data : data?.posts
    setPostsMeta(list)
    return POSTS_META
  })()

  try {
    return await postsIndexPromise
  } finally {
    postsIndexPromise = null
  }
}

export async function ensurePost(slug) {
  const s = String(slug || '').trim()
  if (!s) return null

  const cached = getCachedPost(s)
  if (cached) return cached

  const pending = POST_PROMISES.get(s)
  if (pending) return await pending

  const task = (async () => {
    const url = `${POST_URL_PREFIX}${encodeURIComponent(s)}.json`
    const res = await fetch(withBuildId(url))
    if (res.status === 404) return null
    if (!res.ok) throw new Error('Failed to load post.')
    const data = await res.json().catch(() => ({}))

    const post = data?.post || data
    setPostCache(post)
    return getCachedPost(s)
  })()

  POST_PROMISES.set(s, task)
  try {
    return await task
  } finally {
    POST_PROMISES.delete(s)
  }
}

// Dev-only: load raw markdown content (without frontmatter) for the local admin editor.
export async function loadPostContent(slug) {
  const s = String(slug || '').trim()
  if (!s) return ''
  if (!import.meta.env.DEV) return ''

  const res = await fetch(`/__posts/${encodeURIComponent(s)}`)
  if (!res.ok) throw new Error('Failed to load post content.')
  return await res.text()
}

export async function getPostBySlug(slug) {
  const meta = getPostMetaBySlug(slug)
  const post = await ensurePost(slug)
  if (!post) return null
  // Prefer the index title/date (stable ordering), but fall back to per-post data.
  return { ...post, ...(meta || {}) }
}

export function prefetchPost(slug) {
  const s = String(slug || '').trim()
  if (!s) return
  if (POST_CACHE.has(s)) return

  const schedule = (fn) => {
    if (typeof requestIdleCallback !== 'undefined') return requestIdleCallback(fn, { timeout: 1500 })
    return window.setTimeout(fn, 200)
  }

  if (typeof window === 'undefined') return
  schedule(() => {
    // Fire-and-forget.
    ensurePost(s).catch(() => {})
  })
}
