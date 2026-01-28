import { ref } from 'vue'

const STORAGE_KEY = 'blog_admin_key'

function getStorage() {
  try {
    // `localStorage` is unavailable in SSR and can throw in some browser privacy modes.
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

const storage = getStorage()

export const adminKey = ref(String(storage?.getItem(STORAGE_KEY) || '').trim())
export const adminPostsRevision = ref(0)

export function setAdminKey(next) {
  const v = String(next || '').trim()
  adminKey.value = v
  if (!storage) return
  if (v) storage.setItem(STORAGE_KEY, v)
  else storage.removeItem(STORAGE_KEY)
}

export function bumpAdminPosts() {
  adminPostsRevision.value += 1
}
