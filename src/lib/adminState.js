import { ref } from 'vue'

const STORAGE_KEY = 'blog_admin_key'

export const adminKey = ref(String(localStorage.getItem(STORAGE_KEY) || '').trim())
export const adminPostsRevision = ref(0)

export function setAdminKey(next) {
  const v = String(next || '').trim()
  adminKey.value = v
  if (v) localStorage.setItem(STORAGE_KEY, v)
  else localStorage.removeItem(STORAGE_KEY)
}

export function bumpAdminPosts() {
  adminPostsRevision.value += 1
}

