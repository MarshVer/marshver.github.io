import { ref } from 'vue'
import { posts as VIRTUAL_POSTS_META } from 'virtual:blog-posts-meta'

let POSTS_META = Array.isArray(VIRTUAL_POSTS_META) ? VIRTUAL_POSTS_META : []

// Consumers can depend on this to re-compute when posts change in dev (HMR updates).
export const postsRevision = ref(0)

// Vite splits each markdown file into its own module when used via glob + dynamic import.
const POST_MODULES = import.meta.glob('../posts/*.md', {
  query: '?raw',
  import: 'default',
})

function stripFrontmatter(raw) {
  const s = String(raw || '')
  if (!s.startsWith('---')) return s.trim()

  // Frontmatter block: ---\n...\n---\n
  const end = s.indexOf('\n---', 3)
  if (end === -1) return s.trim()

  const rest = s.slice(end + '\n---'.length)
  return rest.replace(/^\r?\n/, '').trim()
}

export function getAllPosts() {
  return POSTS_META
}

export function getPostMetaBySlug(slug) {
  const s = String(slug || '').trim()
  if (!s) return null
  return POSTS_META.find((p) => p.slug === s) || null
}

export async function loadPostContent(slug) {
  const s = String(slug || '').trim()
  if (!s) return ''

  const key = `../posts/${s}.md`
  const loader = POST_MODULES[key]
  if (loader) {
    const raw = await loader()
    return stripFrontmatter(raw)
  }

  // Dev-only fallback: supports newly created files before Vite's glob map updates.
  if (import.meta.env.DEV) {
    const res = await fetch(`/__posts/${encodeURIComponent(s)}`)
    if (!res.ok) throw new Error('Failed to load post content.')
    const text = await res.text()
    return stripFrontmatter(text)
  }

  return ''
}

export async function getPostBySlug(slug) {
  const meta = getPostMetaBySlug(slug)
  if (!meta) return null
  const content = await loadPostContent(meta.slug)
  return { ...meta, content }
}

function compareDateDesc(a, b) {
  if (a === '未设置日期' && b !== '未设置日期') return 1
  if (b === '未设置日期' && a !== '未设置日期') return -1
  return String(b).localeCompare(String(a))
}

export function groupPostsByDate(posts) {
  const map = new Map()
  for (const p of posts || []) {
    const key = p?.date || '未设置日期'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(p)
  }

  const groups = Array.from(map.entries()).map(([date, items]) => ({
    date,
    posts: items.slice().sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || ''))),
  }))

  groups.sort((a, b) => compareDateDesc(a.date, b.date))
  return groups
}

if (import.meta.hot) {
  import.meta.hot.accept('virtual:blog-posts-meta', (mod) => {
    POSTS_META = Array.isArray(mod?.posts) ? mod.posts : []
    postsRevision.value += 1
  })
}
