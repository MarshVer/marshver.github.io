const ALLOWED_ORIGINS = new Set([
  'https://marshver.github.io',
  // Local dev
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

function corsHeaders(origin) {
  const h = new Headers()
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    h.set('Access-Control-Allow-Origin', origin)
    h.set('Vary', 'Origin')
  }
  h.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  h.set('Access-Control-Max-Age', '86400')
  return h
}

function json(data, status = 200, headers = undefined) {
  const h = new Headers(headers)
  h.set('Content-Type', 'application/json; charset=utf-8')
  h.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(data ?? {}), { status, headers: h })
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

  const data = {}
  for (const line of fmBlock.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    let value = m[2].trim()
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value)
      } catch {
        value = value.slice(1, -1)
      }
    } else {
      value = value.replace(/^['"]/, '').replace(/['"]$/, '')
    }
    data[key] = value
  }

  return { data, content: rest.replace(/^\r?\n/, '') }
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
  return {
    slug,
    title: title || slug,
    date,
    content: String(parsed.content || '').trim(),
  }
}

async function getFile(env, repoPath) {
  const { res, data } = await ghJson(
    env,
    'GET',
    `/repos/${env.OWNER}/${env.REPO}/contents/${repoPath}?ref=${encodeURIComponent(env.BRANCH)}`,
  )
  return { res, data }
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

async function putFile(env, repoPath, contentText, message, sha) {
  const body = {
    message,
    content: encodeBase64Utf8(contentText),
    branch: env.BRANCH,
  }
  if (sha) body.sha = sha

  const { res, data } = await ghJson(
    env,
    'PUT',
    `/repos/${env.OWNER}/${env.REPO}/contents/${repoPath}`,
    body,
  )
  if (!res.ok) throw new Error(data?.message || `GitHub PUT failed: ${res.status}`)
  return data
}

async function deleteFile(env, repoPath, message, sha) {
  const { res, data } = await ghJson(
    env,
    'DELETE',
    `/repos/${env.OWNER}/${env.REPO}/contents/${repoPath}`,
    {
      message,
      sha,
      branch: env.BRANCH,
    },
  )
  if (!res.ok) throw new Error(data?.message || `GitHub DELETE failed: ${res.status}`)
  return data
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') || ''
    const cors = corsHeaders(origin)

    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: cors })

    try {
      if (!env?.GITHUB_TOKEN || !env?.OWNER || !env?.REPO || !env?.BRANCH) {
        return json({ error: 'Worker env vars missing.' }, 500, cors)
      }

      // Public read APIs
      if (request.method === 'GET' && url.pathname === '/api/posts') {
        const { res, data } = await ghJson(
          env,
          'GET',
          `/repos/${env.OWNER}/${env.REPO}/contents/src/posts?ref=${encodeURIComponent(env.BRANCH)}`,
        )
        if (!res.ok)
          return json({ error: data?.message || 'GitHub list failed.' }, res.status, cors)

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
            const p = toPostObject(slug, raw)
            // List endpoint returns metadata only (content fetched via /api/posts/:slug)
            return { slug: p.slug, title: p.title, date: p.date }
          }),
        )

        items.sort((a, b) => compareDateDesc(a.date, b.date) || a.title.localeCompare(b.title))
        return json({ posts: items }, 200, cors)
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/posts/')) {
        const slug = decodeURIComponent(url.pathname.slice('/api/posts/'.length))
        if (!isSafeSlug(slug)) return json({ error: 'Invalid slug.' }, 400, cors)

        const repoPath = `src/posts/${slug}.md`
        const { res, data } = await getFile(env, repoPath)
        if (res.status === 404) return json({ error: 'Not found.' }, 404, cors)
        if (!res.ok)
          return json({ error: data?.message || 'GitHub read failed.' }, res.status, cors)

        const raw = decodeBase64Utf8(data?.content || '')
        const p = toPostObject(slug, raw)
        return json({ post: p }, 200, cors)
      }

      // Admin write APIs
      if (url.pathname.startsWith('/api/admin/')) {
        if (!requireAdmin(request, env)) return json({ error: 'Unauthorized.' }, 401, cors)
      }

      if (request.method === 'POST' && url.pathname === '/api/admin/create') {
        const stamp = String(Date.now())
        const slug = await ensureUniqueSlug(env, stamp)
        const now = formatDateTime(new Date())
        const md = buildMarkdownFile({ title: '未命名', date: now, content: '' })
        await putFile(env, `src/posts/${slug}.md`, md, `admin: create ${slug}`)
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
        const md = buildMarkdownFile({ title: title || nextSlug, date: now, content })

        if (nextSlug === slug) {
          const repoPath = `src/posts/${slug}.md`
          const cur = await getFile(env, repoPath)
          const sha = cur.res.ok ? String(cur.data?.sha || '') : ''
          await putFile(env, repoPath, md, `admin: save ${slug}`, sha || undefined)
          return json({ slug, date: now }, 200, cors)
        }

        // Rename: write new file then delete old file (2 commits).
        await putFile(env, `src/posts/${nextSlug}.md`, md, `admin: rename ${slug} -> ${nextSlug}`)

        const oldRepoPath = `src/posts/${slug}.md`
        const old = await getFile(env, oldRepoPath)
        if (old.res.ok) {
          const sha = String(old.data?.sha || '')
          if (sha) await deleteFile(env, oldRepoPath, `admin: delete ${slug}`, sha)
        }

        return json({ slug: nextSlug, date: now }, 200, cors)
      }

      if (request.method === 'POST' && url.pathname === '/api/admin/delete') {
        const body = await readJsonBody(request)
        const slug = String(body?.slug || '').trim()
        if (!isSafeSlug(slug)) return json({ error: 'Invalid slug.' }, 400, cors)

        const repoPath = `src/posts/${slug}.md`
        const cur = await getFile(env, repoPath)
        if (cur.res.status === 404) return json({ ok: true }, 200, cors)
        if (!cur.res.ok)
          return json({ error: cur.data?.message || 'GitHub read failed.' }, cur.res.status, cors)

        const sha = String(cur.data?.sha || '')
        if (!sha) return json({ error: 'Missing sha.' }, 500, cors)
        await deleteFile(env, repoPath, `admin: delete ${slug}`, sha)
        return json({ ok: true }, 200, cors)
      }

      return json({ error: 'Not found.' }, 404, cors)
    } catch (err) {
      return json({ error: err?.message || String(err) }, 500, cors)
    }
  },
}
