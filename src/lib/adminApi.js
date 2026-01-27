import { ADMIN_API_BASE, ADMIN_REMOTE } from '@/lib/adminConfig'
import { adminKey } from '@/lib/adminState'
import { getAllPosts, getPostBySlug } from '@/lib/posts'

async function httpJson(url, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) {
    const key = String(adminKey.value || '').trim()
    if (!key) throw new Error('请先设置管理密钥。')
    headers.Authorization = `Bearer ${key}`
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || data?.message || 'Request failed')
  return data
}

export async function listPosts() {
  if (!ADMIN_REMOTE) return getAllPosts()
  const data = await httpJson(`${ADMIN_API_BASE}/api/posts`)
  return Array.isArray(data?.posts) ? data.posts : []
}

export async function getPost(slug) {
  if (!ADMIN_REMOTE) return await getPostBySlug(slug)
  const data = await httpJson(`${ADMIN_API_BASE}/api/posts/${encodeURIComponent(String(slug || ''))}`)
  return data?.post || null
}

export async function createPost() {
  if (!ADMIN_REMOTE) return httpJson('/__admin/create', { method: 'POST', body: {} })
  return httpJson(`${ADMIN_API_BASE}/api/admin/create`, { method: 'POST', body: {}, auth: true })
}

export async function savePost({ slug, title, content }) {
  const payload = {
    slug: String(slug || '').trim(),
    title: String(title || ''),
    content: String(content || ''),
  }

  if (!ADMIN_REMOTE) return httpJson('/__admin/save', { method: 'POST', body: payload })
  return httpJson(`${ADMIN_API_BASE}/api/admin/save`, { method: 'POST', body: payload, auth: true })
}

export async function deletePost(slug) {
  const payload = { slug: String(slug || '').trim() }
  if (!ADMIN_REMOTE) return httpJson('/__admin/delete', { method: 'POST', body: payload })
  return httpJson(`${ADMIN_API_BASE}/api/admin/delete`, { method: 'POST', body: payload, auth: true })
}
