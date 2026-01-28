import fs from 'node:fs/promises'
import path from 'node:path'

const POSTS_DIR = path.resolve('src/posts')
const OUT_FILE = path.join(POSTS_DIR, 'index.json')

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

async function main() {
  const entries = await fs.readdir(POSTS_DIR, { withFileTypes: true }).catch(() => [])
  const mdFiles = entries
    .filter((e) => e.isFile() && /\.md$/i.test(e.name))
    .map((e) => e.name)

  const posts = []
  for (const file of mdFiles) {
    const slug = file.replace(/\.md$/i, '')
    const filePath = path.join(POSTS_DIR, file)
    const raw = await fs.readFile(filePath, 'utf8').catch(() => '')
    if (!raw) continue
    const parsed = parseFrontmatter(raw)
    const date = normalizeDate(parsed.data?.date)
    const title = String(parsed.data?.title || extractTitleFromMarkdown(parsed.content, slug)).trim() || slug
    const tags = normalizeStringArray(parsed.data?.tags ?? parsed.data?.tag)
    const categories = normalizeStringArray(parsed.data?.categories ?? parsed.data?.category)
    posts.push({ slug, title, date, tags, categories })
  }

  posts.sort((a, b) => compareDateDesc(a.date, b.date) || a.title.localeCompare(b.title))

  const out = `${JSON.stringify({ posts }, null, 2)}\n`
  await fs.writeFile(OUT_FILE, out, 'utf8')
  // eslint-disable-next-line no-console
  console.log(`Wrote ${posts.length} posts -> ${OUT_FILE}`)
}

await main()

