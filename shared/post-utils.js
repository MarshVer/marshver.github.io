export const DEFAULT_SITE_TIME_ZONE = 'Asia/Shanghai'

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

function datePartsInTimeZone(date, timeZone = DEFAULT_SITE_TIME_ZONE) {
  const d = date instanceof Date ? date : new Date(date)
  if (!Number.isFinite(d.getTime())) return null
  const zone = String(timeZone || DEFAULT_SITE_TIME_ZONE).trim() || DEFAULT_SITE_TIME_ZONE

  let parts
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(d)
  } catch {
    if (zone === DEFAULT_SITE_TIME_ZONE) return null
    return datePartsInTimeZone(d, DEFAULT_SITE_TIME_ZONE)
  }

  const out = {}
  for (const p of parts) {
    if (p.type !== 'literal') out[p.type] = p.value
  }
  if (out.hour === '24') out.hour = '00'
  return out
}

export function formatDateTime(date = new Date(), timeZone = DEFAULT_SITE_TIME_ZONE) {
  const p = datePartsInTimeZone(date, timeZone)
  if (!p) return ''
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`
}

export function extractTitleFromMarkdown(md, fallback) {
  const m = String(md).match(/^#\s+(.+)\s*$/m)
  return (m?.[1] || fallback || '').trim()
}

export function parseFrontmatter(raw) {
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
        // Fall through to best-effort string parsing.
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
    data[m[1]] = parseFrontmatterValue(m[2])
  }

  return { data, content: rest.replace(/^\r?\n/, '') }
}

export function normalizeStringArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean)
  const s = String(value || '').trim()
  if (!s) return []
  return s
    .split(/[,，]/g)
    .map((v) => v.trim())
    .filter(Boolean)
}

export function normalizeDate(value) {
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

export function compareDateDesc(a, b) {
  if (a === '未设置日期' && b !== '未设置日期') return 1
  if (b === '未设置日期' && a !== '未设置日期') return -1
  return String(b).localeCompare(String(a))
}

export function sortPostMeta(posts) {
  return (posts || []).slice().sort((a, b) => compareDateDesc(a.date, b.date) || a.title.localeCompare(b.title))
}

export function normalizePostMeta(p, { includeExcerpt = false } = {}) {
  const slug = String(p?.slug || '').trim()
  if (!slug) return null
  const title = String(p?.title || slug).trim() || slug
  const date = normalizeDate(p?.date)
  const tags = normalizeStringArray(p?.tags ?? p?.tag)
  const categories = normalizeStringArray(p?.categories ?? p?.category)
  const meta = { slug, title, date, tags, categories }
  if (includeExcerpt || Object.prototype.hasOwnProperty.call(p || {}, 'excerpt')) {
    meta.excerpt = String(p?.excerpt || '').trim()
  }
  return meta
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

export function isSafeSlug(slug) {
  const s = String(slug || '')
  if (!s) return false
  if (s.includes('..')) return false
  if (s.includes('/') || s.includes('\\')) return false
  return true
}

export function slugFromTitle(title) {
  let s = String(title || '').trim()
  s = s.replace(/[\\/:*?"<>|]/g, '-')
  s = s
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  s = s.replace(/[. ]+$/g, '')
  if (!s) return ''

  if (RESERVED_WINDOWS_NAMES.has(s.toUpperCase())) {
    s = `_${s}`
  }

  if (s.length > 120) {
    s = s
      .slice(0, 120)
      .trim()
      .replace(/[. ]+$/g, '')
  }
  return s
}

export function buildMarkdownFile({
  title,
  date,
  tags,
  categories,
  content,
  timeZone = DEFAULT_SITE_TIME_ZONE,
}) {
  const t = String(title || '').trim()
  const body = String(content || '')
    .replace(/\r\n/g, '\n')
    .trimEnd()
  const d = String(date || '').trim()
  const tagList = normalizeStringArray(tags)
  const categoryList = normalizeStringArray(categories)

  const fm = [
    '---',
    `title: ${JSON.stringify(t || '未命名')}`,
    `date: ${JSON.stringify(d || formatDateTime(new Date(), timeZone))}`,
  ]
  if (tagList.length) fm.push(`tags: ${JSON.stringify(tagList)}`)
  if (categoryList.length) fm.push(`categories: ${JSON.stringify(categoryList)}`)
  fm.push('---', '', body || '# 未命名\n\n在这里写点什么...\n', '')
  return fm.join('\n')
}

export function toPostObject(slug, rawMd) {
  const s = String(slug || '').trim()
  const parsed = parseFrontmatter(rawMd)
  const date = normalizeDate(parsed.data?.date)
  const title = String(parsed.data?.title || extractTitleFromMarkdown(parsed.content, s)).trim()
  const tags = normalizeStringArray(parsed.data?.tags ?? parsed.data?.tag)
  const categories = normalizeStringArray(parsed.data?.categories ?? parsed.data?.category)
  return {
    slug: s,
    title: title || s,
    date,
    tags,
    categories,
    content: String(parsed.content || '').trim(),
  }
}

export function toPostMeta(slug, rawMd) {
  const p = toPostObject(slug, rawMd)
  return { slug: p.slug, title: p.title, date: p.date, tags: p.tags, categories: p.categories }
}

function parseDateTimeParts(value) {
  const s = normalizeDate(value)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) return null
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4] || '0'),
    minute: Number(m[5] || '0'),
    second: Number(m[6] || '0'),
  }
}

function timeZoneOffsetMinutes(date, timeZone) {
  const p = datePartsInTimeZone(date, timeZone)
  if (!p) return 0
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  )
  return Math.round((asUtc - date.getTime()) / 60000)
}

export function zonedDateTimeToDate(value, timeZone = DEFAULT_SITE_TIME_ZONE) {
  const p = parseDateTimeParts(value)
  if (!p) return null

  const localAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  let offset = timeZoneOffsetMinutes(new Date(localAsUtc), timeZone)
  let utc = localAsUtc - offset * 60000

  const refined = timeZoneOffsetMinutes(new Date(utc), timeZone)
  if (refined !== offset) {
    offset = refined
    utc = localAsUtc - offset * 60000
  }

  const d = new Date(utc)
  return Number.isFinite(d.getTime()) ? d : null
}

export function toIsoDate(value) {
  const s = normalizeDate(value)
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m?.[1] || ''
}

export function toIsoDateTime(value, timeZone = DEFAULT_SITE_TIME_ZONE) {
  const d = zonedDateTimeToDate(value, timeZone)
  return d ? d.toISOString() : ''
}

export function toRfc2822Date(value, timeZone = DEFAULT_SITE_TIME_ZONE) {
  const d = zonedDateTimeToDate(value, timeZone)
  return d ? d.toUTCString() : ''
}

export function toTimeDatetime(value, timeZone = DEFAULT_SITE_TIME_ZONE) {
  const s = normalizeDate(value)
  if (!s || s === '未设置日期') return ''

  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?/)
  if (!m) return s
  if (!m[2]) return m[1]
  return toIsoDateTime(s, timeZone) || `${m[1]}T${m[2]}:${m[3] || '00'}`
}
