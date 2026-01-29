const ALLOWED_ORIGINS = new Set([
  'https://marshver.github.io',
  'https://marshver.eu.org',
  // Local dev
  'http://localhost:1117',
  'http://127.0.0.1:1117',
])

const POSTS_INDEX_PATH = 'src/posts/index.json'

function corsHeaders(origin) {
  const h = new Headers()
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    h.set('Access-Control-Allow-Origin', origin)
    h.set('Vary', 'Origin')
  }
  h.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cf-Turnstile-Token, X-Turnstile-Token')
  h.set('Access-Control-Max-Age', '86400')
  return h
}

function json(data, status = 200, headers = undefined) {
  const h = new Headers(headers)
  h.set('Content-Type', 'application/json; charset=utf-8')
  h.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(data ?? {}), { status, headers: h })
}

function jsonCacheable(data, status = 200, headers = undefined, cacheSeconds = 60) {
  const h = new Headers(headers)
  h.set('Content-Type', 'application/json; charset=utf-8')
  const ttl = Math.max(0, Number(cacheSeconds) || 0)
  // Prefer edge caching (Cache API / CDN). Avoid browser caching so admin refreshes are not "stuck" locally.
  h.set('Cache-Control', `public, max-age=0, s-maxage=${ttl}`)
  return new Response(JSON.stringify(data ?? {}), { status, headers: h })
}

function getClientIp(request) {
  const cfip = String(request.headers.get('CF-Connecting-IP') || '').trim()
  if (cfip) return cfip
  const xff = String(request.headers.get('X-Forwarded-For') || '').trim()
  if (xff) return xff.split(',')[0].trim()
  return 'unknown'
}

function parseCsvSet(raw) {
  const s = String(raw || '').trim()
  if (!s) return new Set()
  return new Set(
    s
      .split(/[,\n\r\t ]+/g)
      .map((x) => x.trim())
      .filter(Boolean),
  )
}

function requireAccess(request, env) {
  // Optional hardening: when configured, require Cloudflare Access to be in front of this Worker.
  // This checks the email header injected by Access; it is only trustworthy when Access is enabled.
  const allow = parseCsvSet(env?.ACCESS_EMAIL_ALLOWLIST || env?.ACCESS_EMAILS || '')
  if (allow.size === 0) return true
  const email = String(request.headers.get('Cf-Access-Authenticated-User-Email') || '')
    .trim()
    .toLowerCase()
  if (!email) return false
  for (const v of allow) {
    if (String(v || '').trim().toLowerCase() === email) return true
  }
  return false
}

async function verifyTurnstile(request, env, ip) {
  // Optional hardening: when configured, require a Turnstile token for write endpoints.
  // Frontend should send it via `Cf-Turnstile-Token` (or `X-Turnstile-Token`) header.
  const secret = String(env?.TURNSTILE_SECRET || '').trim()
  if (!secret) return { ok: true }

  const token = String(
    request.headers.get('Cf-Turnstile-Token') ||
      request.headers.get('X-Turnstile-Token') ||
      '',
  ).trim()
  if (!token) return { ok: false, error: 'Turnstile token missing.' }

  const form = new URLSearchParams()
  form.set('secret', secret)
  form.set('response', token)
  const rip = String(ip || '').trim()
  if (rip && rip !== 'unknown') form.set('remoteip', rip)

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  })
  const data = await res.json().catch(() => ({}))
  if (!data?.success) return { ok: false, error: 'Turnstile verification failed.' }
  return { ok: true }
}

function buildRlKey(requestUrl, env, kind, ip) {
  const u = new URL(requestUrl)
  u.pathname = `/_rl/${encodeURIComponent(String(kind || 'x'))}`
  u.search = ''
  u.searchParams.set('ip', String(ip || ''))
  u.searchParams.set('b', String(env?.BRANCH || ''))
  return new Request(u.toString(), { method: 'GET' })
}

async function cacheGetJson(cache, keyRequest) {
  const res = await cache.match(keyRequest)
  if (!res) return null
  return await res.json().catch(() => null)
}

async function cachePutJson(cache, keyRequest, data, ttlSeconds) {
  const ttl = Math.max(0, Number(ttlSeconds) || 0)
  const h = new Headers()
  h.set('Content-Type', 'application/json; charset=utf-8')
  h.set('Cache-Control', `public, max-age=${ttl}`)
  await cache.put(keyRequest, new Response(JSON.stringify(data ?? {}), { headers: h }))
}

async function checkFixedWindowLimit(cache, keyRequest, { limit, windowSeconds }) {
  const now = Date.now()
  const win = Math.max(1, Number(windowSeconds) || 60) * 1000
  const max = Math.max(1, Number(limit) || 1)

  const cur = (await cacheGetJson(cache, keyRequest)) || {}
  let resetAt = Number(cur.resetAt) || 0
  let count = Number(cur.count) || 0

  if (!resetAt || now >= resetAt) {
    resetAt = now + win
    count = 0
  }

  count += 1
  const allowed = count <= max

  // Keep a small buffer so edge caches don't expire early.
  await cachePutJson(cache, keyRequest, { count, resetAt }, Math.ceil(win / 1000) + 5)

  const retryAfter = allowed ? 0 : Math.max(1, Math.ceil((resetAt - now) / 1000))
  return { allowed, retryAfter }
}

async function getBan(cache, keyRequest) {
  const now = Date.now()
  const v = (await cacheGetJson(cache, keyRequest)) || null
  const until = Number(v?.until) || 0
  if (until && now < until) return { banned: true, retryAfter: Math.max(1, Math.ceil((until - now) / 1000)) }
  return { banned: false, retryAfter: 0 }
}

async function setBan(cache, keyRequest, banSeconds) {
  const now = Date.now()
  const secs = Math.max(1, Number(banSeconds) || 60)
  const until = now + secs * 1000
  await cachePutJson(cache, keyRequest, { until }, secs + 5)
  return { banned: true, retryAfter: secs }
}

function stableJson(value) {
  return `${JSON.stringify(value ?? null, null, 2)}\n`
}

function getCacheOrigin(origin) {
  const o = String(origin || '')
  return ALLOWED_ORIGINS.has(o) ? o : ''
}

function buildCacheKey(requestUrl, env, pathname, origin, extraParams = undefined) {
  const u = new URL(requestUrl)
  u.pathname = pathname
  u.search = ''
  u.searchParams.set('__cache', '1')
  u.searchParams.set('b', String(env?.BRANCH || ''))
  const o = getCacheOrigin(origin)
  if (o) u.searchParams.set('o', o)
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      if (v === undefined || v === null || v === '') continue
      u.searchParams.set(k, String(v))
    }
  }
  return new Request(u.toString(), { method: 'GET' })
}

async function purgeReadCaches(requestUrl, env, pathname, slugs = []) {
  const cache = caches?.default
  if (!cache) return

  const origins = ['', ...Array.from(ALLOWED_ORIGINS)]
  const tasks = []

  // List cache (and any generic key variants).
  for (const origin of origins) {
    tasks.push(cache.delete(buildCacheKey(requestUrl, env, pathname, origin)))
  }

  // Per-post caches.
  for (const slug of slugs) {
    for (const origin of origins) {
      tasks.push(cache.delete(buildCacheKey(requestUrl, env, `/api/posts/${encodeURIComponent(slug)}`, origin)))
    }
  }

  await Promise.allSettled(tasks)
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function formatDateTime(d = new Date()) {
  const yyyy = d.getFullYear()
  const mm = pad2(d.getMonth() + 1)
  const dd = pad2(d.getDate())
  const hh = pad2(d.getHours())
  const mi = pad2(d.getMinutes())
  const ss = pad2(d.getSeconds())
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

function isSafeSlug(slug) {
  const s = String(slug || '')
  if (!s) return false
  if (s.includes('..')) return false
  if (s.includes('/') || s.includes('\\')) return false
  return true
}

function slugFromTitle(title) {
  let s = String(title || '').trim()
  // Avoid Windows forbidden characters in file names (also keeps GitHub paths clean).
  s = s.replace(/[\\/:*?"<>|]/g, '-')
  // Keep it readable; avoid accidental newlines/tabs.
  s = s
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Windows doesn't allow trailing dots/spaces.
  s = s.replace(/[. ]+$/g, '')
  if (!s) return ''
  if (s.length > 120)
    s = s
      .slice(0, 120)
      .trim()
      .replace(/[. ]+$/g, '')
  return s
}

function extractTitleFromMarkdown(md, fallback) {
  const m = String(md).match(/^#\s+(.+)\s*$/m)
  return (m?.[1] || fallback || '').trim()
}

function parseFrontmatter(raw) {
  const s = String(raw || '')
  if (!s.startsWith('---')) return { data: {}, content: s }

  const end = s.indexOf('\n---', 3)
  if (end === -1) return { data: {}, content: s }

  const fmBlock = s.slice(3, end).replace(/^\r?\n/, '')
  const rest = s.slice(end + '\n---'.length)

  function parseFrontmatterValue(rawValue) {
    let value = String(rawValue ?? '').trim()
    if (!value) return ''

    if (
      (value.startsWith('[') && value.endsWith(']')) ||
      (value.startsWith('{') && value.endsWith('}'))
    ) {
      try {
        return JSON.parse(value)
      } catch {
        // fall through
      }
    }

    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        return JSON.parse(value)
      } catch {
        return value.slice(1, -1)
      }
    }

    return value.replace(/^['"]/, '').replace(/['"]$/, '')
  }

  const data = {}
  for (const line of fmBlock.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    data[key] = parseFrontmatterValue(m[2])
  }

  return { data, content: rest.replace(/^\r?\n/, '') }
}

function normalizeStringArray(value) {
  if (!value) return []
  if (Array.isArray(value))
    return value.map((v) => String(v || '').trim()).filter(Boolean)
  const s = String(value || '').trim()
  if (!s) return []
  return s
    .split(/[,，]/g)
    .map((v) => v.trim())
    .filter(Boolean)
}

function normalizeDate(value) {
  if (!value) return '未设置日期'
  const s = String(value).trim()
  if (!s) return '未设置日期'
  const normalized = s.replace('T', ' ').replace(/Z$/i, '')
  const m = normalized.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?/)
  if (!m) return s
  if (!m[2]) return m[1]
  const sec = m[3] || '00'
  return `${m[1]} ${m[2]}:${sec}`
}

function compareDateDesc(a, b) {
  if (a === '未设置日期' && b !== '未设置日期') return 1
  if (b === '未设置日期' && a !== '未设置日期') return -1
  return String(b).localeCompare(String(a))
}

function normalizePostMeta(p) {
  const slug = String(p?.slug || '').trim()
  if (!slug) return null
  const title = String(p?.title || slug).trim() || slug
  const date = normalizeDate(p?.date)
  const tags = normalizeStringArray(p?.tags ?? p?.tag)
  const categories = normalizeStringArray(p?.categories ?? p?.category)
  return { slug, title, date, tags, categories }
}

function sortPostMeta(posts) {
  return (posts || []).slice().sort((a, b) => compareDateDesc(a.date, b.date) || a.title.localeCompare(b.title))
}

function buildMarkdownFile({ title, date, content }) {
  const t = String(title || '').trim()
  const body = String(content || '')
    .replace(/\r\n/g, '\n')
    .trimEnd()
  const d = String(date || '').trim()

  return [
    '---',
    `title: ${JSON.stringify(t || '未命名')}`,
    `date: ${JSON.stringify(d || formatDateTime(new Date()))}`,
    '---',
    '',
    body || '# 未命名\n\n在这里写点什么...\n',
    '',
  ].join('\n')
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''))
  let bin = ''
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function decodeBase64Utf8(b64) {
  const cleaned = String(b64 || '')
    .replace(/\n/g, '')
    .trim()
  const bin = atob(cleaned)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

async function readJsonBody(req) {
  const text = await req.text()
  if (!text) return {}
  return JSON.parse(text)
}

async function ghFetch(env, method, apiPath, body) {
  const url = `https://api.github.com${apiPath}`
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'blog-worker',
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
  }
  const init = { method, headers }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const res = await fetch(url, init)
  return res
}

async function ghJson(env, method, apiPath, body) {
  const res = await ghFetch(env, method, apiPath, body)
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

function requireAdmin(request, env) {
  const auth = String(request.headers.get('Authorization') || '')
  const m = auth.match(/^Bearer\s+(.+)$/i)
  const token = m?.[1] || ''
  if (!env.ADMIN_KEY || token !== env.ADMIN_KEY) {
    return false
  }
  return true
}

function toPostObject(slug, rawMd) {
  const parsed = parseFrontmatter(rawMd)
  const date = normalizeDate(parsed.data?.date)
  const title = String(parsed.data?.title || extractTitleFromMarkdown(parsed.content, slug)).trim()
  const tags = normalizeStringArray(parsed.data?.tags ?? parsed.data?.tag)
  const categories = normalizeStringArray(parsed.data?.categories ?? parsed.data?.category)
  return {
    slug,
    title: title || slug,
    date,
    tags,
    categories,
    content: String(parsed.content || '').trim(),
  }
}

function toPostMeta(slug, rawMd) {
  const p = toPostObject(slug, rawMd)
  return { slug: p.slug, title: p.title, date: p.date, tags: p.tags, categories: p.categories }
}

async function getFile(env, repoPath) {
  const { res, data } = await ghJson(
    env,
    'GET',
    `/repos/${env.OWNER}/${env.REPO}/contents/${repoPath}?ref=${encodeURIComponent(env.BRANCH)}`,
  )
  return { res, data }
}

async function readPostsIndex(env) {
  const { res, data } = await getFile(env, POSTS_INDEX_PATH)
  if (res.status === 404) return { posts: [], missing: true }
  if (!res.ok) throw new Error(data?.message || `GitHub read failed: ${res.status}`)

  const raw = decodeBase64Utf8(data?.content || '')
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Invalid posts index JSON.')
  }

  const list = Array.isArray(parsed) ? parsed : parsed?.posts
  const posts = sortPostMeta((Array.isArray(list) ? list : []).map(normalizePostMeta).filter(Boolean))
  return { posts, missing: false }
}

async function rebuildPostsIndexFromRepo(env) {
  const { res, data } = await ghJson(
    env,
    'GET',
    `/repos/${env.OWNER}/${env.REPO}/contents/src/posts?ref=${encodeURIComponent(env.BRANCH)}`,
  )
  if (!res.ok) throw new Error(data?.message || `GitHub list failed: ${res.status}`)

  const files = Array.isArray(data)
    ? data.filter((it) => it?.type === 'file' && /\.md$/i.test(String(it?.name || '')))
    : []

  const items = await Promise.all(
    files.map(async (f) => {
      const repoPath = String(f.path || '')
      const slug = String(f.name || '').replace(/\.md$/i, '')
      const file = await getFile(env, repoPath)
      if (!file.res.ok) throw new Error(`Failed to load ${repoPath}`)
      const raw = decodeBase64Utf8(file.data?.content || '')
      return toPostMeta(slug, raw)
    }),
  )

  return sortPostMeta(items.map(normalizePostMeta).filter(Boolean))
}

function applyIndexUpdates(currentPosts, { removeSlugs = [], upserts = [] } = {}) {
  const removeSet = new Set((removeSlugs || []).map((s) => String(s || '').trim()).filter(Boolean))
  let posts = (currentPosts || []).filter((p) => !removeSet.has(p.slug))

  for (const item of upserts || []) {
    const slug = String(item?.slug || '').trim()
    const rawMd = String(item?.rawMd || '')
    if (!slug || !rawMd) continue
    const meta = normalizePostMeta(toPostMeta(slug, rawMd))
    if (!meta) continue
    const i = posts.findIndex((p) => p.slug === meta.slug)
    if (i >= 0) posts[i] = meta
    else posts.push(meta)
  }

  return sortPostMeta(posts)
}

async function getPostsIndexOrRebuild(env) {
  let index
  try {
    index = await readPostsIndex(env)
  } catch {
    index = { posts: [], missing: true }
  }
  if (!index.missing) return index.posts
  return await rebuildPostsIndexFromRepo(env)
}

async function ensureUniqueSlug(env, baseSlug, ignoreSlug) {
  const base = String(baseSlug || '').trim()
  const ignore = String(ignoreSlug || '').trim()
  if (!base) return ''
  if (ignore && base.toLowerCase() === ignore.toLowerCase()) return ignore

  let slug = base
  let i = 2
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const repoPath = `src/posts/${slug}.md`
    const { res } = await getFile(env, repoPath)
    if (res.status === 404) return slug
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
    slug = `${base}-${i}`
    i += 1
  }
}

async function getHeadCommitSha(env) {
  const { res, data } = await ghJson(
    env,
    'GET',
    `/repos/${env.OWNER}/${env.REPO}/git/ref/heads/${encodeURIComponent(env.BRANCH)}`,
  )
  if (!res.ok) throw new Error(data?.message || `GitHub ref failed: ${res.status}`)
  return String(data?.object?.sha || '')
}

async function getCommitTreeSha(env, commitSha) {
  const { res, data } = await ghJson(
    env,
    'GET',
    `/repos/${env.OWNER}/${env.REPO}/git/commits/${encodeURIComponent(commitSha)}`,
  )
  if (!res.ok) throw new Error(data?.message || `GitHub commit failed: ${res.status}`)
  return String(data?.tree?.sha || '')
}

async function createBlob(env, contentText) {
  const { res, data } = await ghJson(env, 'POST', `/repos/${env.OWNER}/${env.REPO}/git/blobs`, {
    content: encodeBase64Utf8(String(contentText ?? '')),
    encoding: 'base64',
  })
  if (!res.ok) throw new Error(data?.message || `GitHub blob failed: ${res.status}`)
  return String(data?.sha || '')
}

async function createTree(env, baseTreeSha, treeItems) {
  const { res, data } = await ghJson(env, 'POST', `/repos/${env.OWNER}/${env.REPO}/git/trees`, {
    base_tree: baseTreeSha,
    tree: treeItems,
  })
  if (!res.ok) throw new Error(data?.message || `GitHub tree failed: ${res.status}`)
  return String(data?.sha || '')
}

async function createCommit(env, message, treeSha, parentCommitSha) {
  const { res, data } = await ghJson(env, 'POST', `/repos/${env.OWNER}/${env.REPO}/git/commits`, {
    message,
    tree: treeSha,
    parents: [parentCommitSha],
  })
  if (!res.ok) throw new Error(data?.message || `GitHub commit create failed: ${res.status}`)
  return String(data?.sha || '')
}

async function updateRef(env, commitSha) {
  const { res, data } = await ghJson(
    env,
    'PATCH',
    `/repos/${env.OWNER}/${env.REPO}/git/refs/heads/${encodeURIComponent(env.BRANCH)}`,
    { sha: commitSha, force: false },
  )
  if (!res.ok) throw new Error(data?.message || `GitHub ref update failed: ${res.status}`)
}

async function commitFiles(env, message, changes) {
  const list = Array.isArray(changes) ? changes : []
  if (list.length === 0) return

  let lastErr
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const headCommitSha = await getHeadCommitSha(env)
      const baseTreeSha = await getCommitTreeSha(env, headCommitSha)

      const tree = []
      for (const ch of list) {
        const p = String(ch?.path || '').replace(/^\/+/, '')
        if (!p) continue

        if (ch?.delete) {
          tree.push({ path: p, mode: '100644', type: 'blob', sha: null })
          continue
        }

        const blobSha = await createBlob(env, String(ch?.content ?? ''))
        tree.push({ path: p, mode: '100644', type: 'blob', sha: blobSha })
      }

      const treeSha = await createTree(env, baseTreeSha, tree)
      const commitSha = await createCommit(env, message, treeSha, headCommitSha)
      await updateRef(env, commitSha)
      return
    } catch (err) {
      lastErr = err
      const msg = String(err?.message || '')
      // Best-effort retry on concurrent updates (non-fast-forward).
      if (attempt === 0 && /non-fast-forward|Reference update failed|422/.test(msg)) continue
      break
    }
  }

  throw lastErr || new Error('Commit failed.')
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') || ''
    const corsOrigin = getCacheOrigin(origin)
    const cors = corsHeaders(corsOrigin)
    const ip = getClientIp(request)
    const cache = caches?.default

    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: cors })

    try {
      if (!env?.GITHUB_TOKEN || !env?.OWNER || !env?.REPO || !env?.BRANCH) {
        return json({ error: 'Worker env vars missing.' }, 500, cors)
      }

      // Admin hardening: rate limit + failure backoff/ban + optional Cloudflare Access allowlist.
      if (url.pathname.startsWith('/api/admin/')) {
        if (cache) {
          const banKey = buildRlKey(request.url, env, 'ban', ip)
          const ban = await getBan(cache, banKey)
          if (ban.banned) {
            const h = new Headers(cors)
            h.set('Retry-After', String(ban.retryAfter))
            return json({ error: 'Too many attempts. Try again later.' }, 429, h)
          }

          const adminMax = Math.max(1, Number(env?.ADMIN_RL_MAX) || 30)
          const adminWindow = Math.max(1, Number(env?.ADMIN_RL_WINDOW) || 60)
          const rlKey = buildRlKey(request.url, env, 'admin', ip)
          const rl = await checkFixedWindowLimit(cache, rlKey, {
            limit: adminMax,
            windowSeconds: adminWindow,
          })
          if (!rl.allowed) {
            const h = new Headers(cors)
            h.set('Retry-After', String(rl.retryAfter))
            return json({ error: 'Rate limited. Try again later.' }, 429, h)
          }
        }

        if (!requireAccess(request, env)) {
          return json({ error: 'Forbidden.' }, 403, cors)
        }

        if (request.method === 'POST') {
          const turnstile = await verifyTurnstile(request, env, ip)
          if (!turnstile.ok) {
            return json({ error: turnstile.error || 'Forbidden.' }, 403, cors)
          }
        }

        if (!requireAdmin(request, env)) {
          if (cache) {
            const failMax = Math.max(1, Number(env?.ADMIN_FAIL_MAX) || 5)
            const failWindow = Math.max(1, Number(env?.ADMIN_FAIL_WINDOW) || 600)
            const banSeconds = Math.max(1, Number(env?.ADMIN_BAN_SECONDS) || 900)

            const failKey = buildRlKey(request.url, env, 'fail', ip)
            const fail = await checkFixedWindowLimit(cache, failKey, {
              limit: failMax,
              windowSeconds: failWindow,
            })

            if (!fail.allowed) {
              const banKey = buildRlKey(request.url, env, 'ban', ip)
              const ban = await setBan(cache, banKey, banSeconds)
              const h = new Headers(cors)
              h.set('Retry-After', String(ban.retryAfter))
              return json({ error: 'Too many failed attempts. Try again later.' }, 429, h)
            }
          }

          return json({ error: 'Unauthorized.' }, 401, cors)
        }

        // Successful auth: clear failure counters so accidental typos don't lock you out.
        if (cache) {
          await cache.delete(buildRlKey(request.url, env, 'fail', ip))
          await cache.delete(buildRlKey(request.url, env, 'ban', ip))
        }
      }

      // Public read APIs
      if (request.method === 'GET' && url.pathname === '/api/posts') {
        if (cache) {
          const key = buildCacheKey(request.url, env, '/api/posts', corsOrigin)
          const cached = await cache.match(key)
          if (cached) return cached
        }

        const index = await readPostsIndex(env)
        if (index.missing) return json({ error: 'Posts index missing.' }, 500, cors)

        const response = jsonCacheable({ posts: index.posts }, 200, cors, 60)
        if (cache) {
          const key = buildCacheKey(request.url, env, '/api/posts', corsOrigin)
          await cache.put(key, response.clone())
        }
        return response
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/posts/')) {
        const slug = decodeURIComponent(url.pathname.slice('/api/posts/'.length))
        if (!isSafeSlug(slug)) return json({ error: 'Invalid slug.' }, 400, cors)

        if (cache) {
          const key = buildCacheKey(request.url, env, `/api/posts/${encodeURIComponent(slug)}`, corsOrigin)
          const cached = await cache.match(key)
          if (cached) return cached
        }

        const repoPath = `src/posts/${slug}.md`
        const { res, data } = await getFile(env, repoPath)
        if (res.status === 404) return json({ error: 'Not found.' }, 404, cors)
        if (!res.ok)
          return json({ error: data?.message || 'GitHub read failed.' }, res.status, cors)

        const raw = decodeBase64Utf8(data?.content || '')
        const p = toPostObject(slug, raw)
        const response = jsonCacheable({ post: p }, 200, cors, 300)
        if (cache) {
          const key = buildCacheKey(request.url, env, `/api/posts/${encodeURIComponent(slug)}`, corsOrigin)
          await cache.put(key, response.clone())
        }
        return response
      }

      if (request.method === 'POST' && url.pathname === '/api/admin/create') {
        const stamp = String(Date.now())
        const slug = await ensureUniqueSlug(env, stamp)
        const now = formatDateTime(new Date())
        const rawMd = buildMarkdownFile({ title: '未命名', date: now, content: '' })
        const currentIndex = await getPostsIndexOrRebuild(env)
        const nextIndex = applyIndexUpdates(currentIndex, { upserts: [{ slug, rawMd }] })
        const indexJson = stableJson({ posts: nextIndex })

        await commitFiles(env, `admin: create ${slug}`, [
          { path: `src/posts/${slug}.md`, content: rawMd },
          { path: POSTS_INDEX_PATH, content: indexJson },
        ])
        await purgeReadCaches(request.url, env, '/api/posts')
        return json({ slug, date: now }, 200, cors)
      }

      if (request.method === 'POST' && url.pathname === '/api/admin/save') {
        const body = await readJsonBody(request)
        const slug = String(body?.slug || '').trim()
        if (!isSafeSlug(slug)) return json({ error: 'Invalid slug.' }, 400, cors)

        const title = String(body?.title || '').trim()
        const content = String(body?.content || '')

        const desired = slugFromTitle(title) || slug
        const nextSlug = await ensureUniqueSlug(env, desired, slug)

        const now = formatDateTime(new Date())
        const rawMd = buildMarkdownFile({ title: title || nextSlug, date: now, content })

        if (nextSlug === slug) {
          const currentIndex = await getPostsIndexOrRebuild(env)
          const nextIndex = applyIndexUpdates(currentIndex, { upserts: [{ slug, rawMd }] })
          const indexJson = stableJson({ posts: nextIndex })

          await commitFiles(env, `admin: save ${slug}`, [
            { path: `src/posts/${slug}.md`, content: rawMd },
            { path: POSTS_INDEX_PATH, content: indexJson },
          ])
          await purgeReadCaches(request.url, env, '/api/posts', [slug])
          return json({ slug, date: now }, 200, cors)
        }

        const currentIndex = await getPostsIndexOrRebuild(env)
        const nextIndex = applyIndexUpdates(currentIndex, {
          removeSlugs: [slug],
          upserts: [{ slug: nextSlug, rawMd }],
        })
        const indexJson = stableJson({ posts: nextIndex })

        await commitFiles(env, `admin: rename ${slug} -> ${nextSlug}`, [
          { path: `src/posts/${nextSlug}.md`, content: rawMd },
          { path: `src/posts/${slug}.md`, delete: true },
          { path: POSTS_INDEX_PATH, content: indexJson },
        ])
        await purgeReadCaches(request.url, env, '/api/posts', [slug, nextSlug])
        return json({ slug: nextSlug, date: now }, 200, cors)
      }

      if (request.method === 'POST' && url.pathname === '/api/admin/delete') {
        const body = await readJsonBody(request)
        const slug = String(body?.slug || '').trim()
        if (!isSafeSlug(slug)) return json({ error: 'Invalid slug.' }, 400, cors)

        const currentIndex = await getPostsIndexOrRebuild(env)
        const nextIndex = applyIndexUpdates(currentIndex, { removeSlugs: [slug] })
        const indexJson = stableJson({ posts: nextIndex })

        await commitFiles(env, `admin: delete ${slug}`, [
          { path: `src/posts/${slug}.md`, delete: true },
          { path: POSTS_INDEX_PATH, content: indexJson },
        ])
        await purgeReadCaches(request.url, env, '/api/posts', [slug])
        return json({ ok: true }, 200, cors)
      }

      return json({ error: 'Not found.' }, 404, cors)
    } catch (err) {
      return json({ error: err?.message || String(err) }, 500, cors)
    }
  },
}
