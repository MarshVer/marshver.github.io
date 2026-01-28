import fs from 'node:fs/promises'
import path from 'node:path'

import MarkdownIt from 'markdown-it'

const SITE_ORIGIN_RE = /^https?:\/\//i
const UNSAFE_PROTOCOL_RE = /^(?:javascript|data|vbscript):/i

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

function pad2(n) {
  return String(n).padStart(2, '0')
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

export function buildExcerpt(markdown, maxLen = 160) {
  const s = String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[(.*?)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/>\s?/g, '')
    .replace(/[*_~]+/g, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!s) return ''
  return s.length > maxLen ? `${s.slice(0, maxLen).trim()}...` : s
}

function defaultLinkOpen(tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options)
}

function defaultImage(tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options)
}

export function createMarkdownRenderer() {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: true,
  })

  const baseValidate = md.validateLink
  md.validateLink = (url) => {
    const u = String(url || '').trim()
    if (UNSAFE_PROTOCOL_RE.test(u)) return false
    return baseValidate.call(md, u)
  }

  const baseLinkOpen = md.renderer.rules.link_open || defaultLinkOpen
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const href = String(token.attrGet('href') || '')

    if (SITE_ORIGIN_RE.test(href)) {
      token.attrSet('target', '_blank')
      const rel = String(token.attrGet('rel') || '')
      const parts = new Set(rel.split(/\s+/).filter(Boolean))
      parts.add('noopener')
      parts.add('noreferrer')
      token.attrSet('rel', Array.from(parts).join(' '))
    }

    return baseLinkOpen(tokens, idx, options, env, self)
  }

  const baseImage = md.renderer.rules.image || defaultImage
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    token.attrSet('loading', 'lazy')
    token.attrSet('decoding', 'async')
    return baseImage(tokens, idx, options, env, self)
  }

  return md
}

export async function loadPostsFromDir(postsDir) {
  const entries = await fs.readdir(postsDir, { withFileTypes: true }).catch(() => [])
  const mdFiles = entries
    .filter((e) => e.isFile() && /\.md$/i.test(e.name))
    .map((e) => e.name)

  const md = createMarkdownRenderer()

  const posts = []
  const postsBySlug = new Map()

  for (const file of mdFiles) {
    const slug = file.replace(/\.md$/i, '')
    const filePath = path.join(postsDir, file)
    const raw = await fs.readFile(filePath, 'utf8').catch(() => '')
    if (!raw) continue

    const parsed = parseFrontmatter(raw)
    const date = normalizeDate(parsed.data?.date)
    const title = String(parsed.data?.title || extractTitleFromMarkdown(parsed.content, slug)).trim() || slug
    const content = String(parsed.content || '').trim()
    const excerpt = buildExcerpt(content, 160)
    const html = md.render(content)

    const meta = { slug, title, date, excerpt }
    posts.push(meta)
    postsBySlug.set(slug, { ...meta, html })
  }

  posts.sort((a, b) => compareDateDesc(a.date, b.date) || a.title.localeCompare(b.title))

  return { posts, postsBySlug }
}

