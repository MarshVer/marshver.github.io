import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs/promises'
import path from 'node:path'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import VueDevTools from 'vite-plugin-vue-devtools'

function blogPostsPlugin({ enableAdmin = false } = {}) {
  const postsDir = fileURLToPath(new URL('./src/posts', import.meta.url))
  const postsDirResolved = path.resolve(postsDir)

  const VIRTUAL_ID = 'virtual:blog-posts'
  const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`

  const RESERVED_WINDOWS_NAMES = new Set(
    [
      'CON',
      'PRN',
      'AUX',
      'NUL',
      ...Array.from({ length: 9 }, (_, i) => `COM${i + 1}`),
      ...Array.from({ length: 9 }, (_, i) => `LPT${i + 1}`),
    ].map((s) => s.toUpperCase()),
  )

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
    // Avoid Windows forbidden characters in file names.
    s = s.replace(/[\\/:*?"<>|]/g, '-')
    // Keep it readable; avoid accidental newlines/tabs.
    s = s.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
    // Windows doesn't allow trailing dots/spaces.
    s = s.replace(/[. ]+$/g, '')

    if (!s) return ''

    if (RESERVED_WINDOWS_NAMES.has(s.toUpperCase())) {
      s = `_${s}`
    }

    // Keep paths reasonable.
    if (s.length > 120) s = s.slice(0, 120).trim().replace(/[. ]+$/g, '')
    return s
  }

  function fileNameToSlug(name) {
    return String(name || '').replace(/\.md$/i, '')
  }

  function json(res, statusCode, data) {
    const body = JSON.stringify(data || {})
    res.statusCode = statusCode
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(body)
  }

  async function readJsonBody(req) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const text = Buffer.concat(chunks).toString('utf8')
    if (!text) return {}
    return JSON.parse(text)
  }

  async function fileExists(filePath) {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  function extractTitleFromMarkdown(md, fallback) {
    const m = String(md).match(/^#\s+(.+)\s*$/m)
    return (m?.[1] || fallback || '').trim()
  }

  function parseFrontmatter(raw) {
    const s = String(raw || '')
    if (!s.startsWith('---')) return { data: {}, content: s }

    // Frontmatter block: ---\n...\n---\n
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
      // Support values written by JSON.stringify(...) in admin: "..."
      if (value.startsWith('"') && value.endsWith('"')) {
        try {
          value = JSON.parse(value)
        } catch {
          value = value.slice(1, -1)
        }
      } else {
        // strip optional quotes (best-effort)
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

    // Prefer `YYYY-MM-DD HH:mm:ss` (admin writes this).
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

  async function readAllPostsFromFs() {
    let entries = []
    try {
      entries = await fs.readdir(postsDir, { withFileTypes: true })
    } catch {
      entries = []
    }

    const mdFiles = entries
      .filter((e) => e.isFile() && /\.md$/i.test(e.name))
      .map((e) => e.name)

    const posts = []
    for (const file of mdFiles) {
      const filePath = path.join(postsDir, file)
      let raw = ''
      try {
        raw = await fs.readFile(filePath, 'utf8')
      } catch {
        continue
      }

      const slug = fileNameToSlug(file)
      const parsed = parseFrontmatter(raw)
      const date = normalizeDate(parsed.data?.date)
      const title = String(parsed.data?.title || extractTitleFromMarkdown(parsed.content, slug)).trim()

      posts.push({
        slug,
        title: title || slug,
        date,
        content: String(parsed.content || '').trim(),
      })
    }

    posts.sort((a, b) => compareDateDesc(a.date, b.date) || a.title.localeCompare(b.title))
    return posts
  }

  async function ensureUniqueSlug(baseSlug, ignoreSlug) {
    const base = String(baseSlug || '').trim()
    const ignore = String(ignoreSlug || '').trim()
    if (!base) return ''

    if (ignore && base.toLowerCase() === ignore.toLowerCase()) return ignore

    let slug = base
    let i = 2
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const filePath = path.join(postsDir, `${slug}.md`)
      const exists = await fileExists(filePath)
      if (!exists) return slug
      slug = `${base}-${i}`
      i += 1
    }
  }

  function buildMarkdownFile({ title, date, content }) {
    const t = String(title || '').trim()
    const body = String(content || '').replace(/\r\n/g, '\n').trimEnd()
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

  function resolvePostPath(slug) {
    const filePath = path.resolve(postsDir, `${slug}.md`)
    const rel = path.relative(postsDir, filePath)
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null
    return filePath
  }

  return {
    name: 'blog-posts',

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID
      return null
    },

    async load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null
      const posts = await readAllPostsFromFs()
      return `export const posts = ${JSON.stringify(posts)};\nexport default posts;\n`
    },

    handleHotUpdate(ctx) {
      const filePath = path.resolve(String(ctx.file || ''))
      const fp = filePath.toLowerCase()
      const dir = (postsDirResolved + path.sep).toLowerCase()
      if (!fp.startsWith(dir)) return
      if (!/\.md$/i.test(filePath)) return

      const mod = ctx.server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID)
      if (!mod) return

      ctx.server.moduleGraph.invalidateModule(mod)
      return [mod]
    },

    configureServer(server) {
      if (!enableAdmin) return

      server.middlewares.use(async (req, res, next) => {
        const url = String(req.url || '')
        if (!url.startsWith('/__admin/')) return next()

        try {
          if (req.method === 'POST' && url.startsWith('/__admin/create')) {
            const stamp = String(Date.now())
            const slug = await ensureUniqueSlug(stamp)
            const filePath = resolvePostPath(slug)
            if (!filePath) return json(res, 400, { error: 'Invalid slug.' })

            const now = formatDateTime(new Date())
            const md = buildMarkdownFile({ title: '未命名', date: now, content: '' })
            await fs.writeFile(filePath, md, 'utf8')
            return json(res, 200, { slug, date: now })
          }

          if (req.method === 'POST' && url.startsWith('/__admin/save')) {
            const body = await readJsonBody(req)
            const slug = String(body?.slug || '').trim()
            if (!isSafeSlug(slug)) return json(res, 400, { error: 'Invalid slug.' })

            const title = String(body?.title || '').trim()
            const content = String(body?.content || '')

            const desired = slugFromTitle(title) || slug
            const nextSlug = await ensureUniqueSlug(desired, slug)

            const oldPath = resolvePostPath(slug)
            const newPath = resolvePostPath(nextSlug)
            if (!oldPath || !newPath) return json(res, 400, { error: 'Invalid path.' })

            // Rename first so watchers see the final file name.
            if (nextSlug !== slug) {
              const oldExists = await fileExists(oldPath)
              if (oldExists) {
                await fs.rename(oldPath, newPath)
              }
            }

            const now = formatDateTime(new Date())
            const md = buildMarkdownFile({ title: title || nextSlug, date: now, content })
            await fs.writeFile(newPath, md, 'utf8')

            return json(res, 200, { slug: nextSlug, date: now })
          }

          if (req.method === 'POST' && url.startsWith('/__admin/delete')) {
            const body = await readJsonBody(req)
            const slug = String(body?.slug || '').trim()
            if (!isSafeSlug(slug)) return json(res, 400, { error: 'Invalid slug.' })

            const filePath = resolvePostPath(slug)
            if (!filePath) return json(res, 400, { error: 'Invalid path.' })

            const exists = await fileExists(filePath)
            if (exists) await fs.unlink(filePath)
            return json(res, 200, { ok: true })
          }

          return json(res, 404, { error: 'Not found.' })
        } catch (err) {
          return json(res, 500, { error: err?.message || String(err) })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const enableAdmin = command === 'serve' && process.env.NODE_ENV !== 'production'
  const plugins = [vue(), blogPostsPlugin({ enableAdmin })]

  // Only enable DevTools overlay in dev server.
  if (enableAdmin) {
    plugins.unshift(VueDevTools())
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
