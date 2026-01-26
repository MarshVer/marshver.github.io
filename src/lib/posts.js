import { ref } from 'vue'
import { posts as VIRTUAL_POSTS } from 'virtual:blog-posts'

let POSTS = Array.isArray(VIRTUAL_POSTS) ? VIRTUAL_POSTS : []

// Consumers can depend on this to re-compute when posts change in dev (HMR updates).
export const postsRevision = ref(0)

export function getAllPosts() {
  return POSTS
}

export function getPostBySlug(slug) {
  const s = String(slug || '').trim()
  if (!s) return null
  return getAllPosts().find((p) => p.slug === s) || null
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
  import.meta.hot.accept('virtual:blog-posts', (mod) => {
    POSTS = Array.isArray(mod?.posts) ? mod.posts : []
    postsRevision.value += 1
  })
}

