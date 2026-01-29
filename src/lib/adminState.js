import { ref } from 'vue'

const STORAGE_KEY = 'blog_admin_key'
const REMEMBER_KEY = 'blog_admin_key_remember'

function getStorage(kind) {
  try {
    // Storage is unavailable in SSR and can throw in some browser privacy modes.
    if (typeof window === 'undefined') return null
    if (kind === 'local') return window.localStorage || null
    if (kind === 'session') return window.sessionStorage || null
    return null
  } catch {
    return null
  }
}

const local = getStorage('local')
const session = getStorage('session')

function readRememberFlag() {
  const v = String(local?.getItem(REMEMBER_KEY) || '').trim()
  return v === '1' || v.toLowerCase() === 'true'
}

function readInitialKey() {
  const remember = readRememberFlag()
  if (remember) {
    const v = String(local?.getItem(STORAGE_KEY) || '').trim()
    if (v) return { key: v, remember: true }
  }

  const sessionKey = String(session?.getItem(STORAGE_KEY) || '').trim()
  if (sessionKey) return { key: sessionKey, remember: false }

  // Migration: if a legacy key exists in localStorage but "remember" isn't enabled,
  // move it to sessionStorage so it no longer persists by default.
  const legacy = String(local?.getItem(STORAGE_KEY) || '').trim()
  if (legacy) {
    try {
      session?.setItem(STORAGE_KEY, legacy)
    } catch {
      // ignore
    }
    try {
      local?.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    try {
      local?.removeItem(REMEMBER_KEY)
    } catch {
      // ignore
    }
    return { key: legacy, remember: false }
  }

  return { key: '', remember: false }
}

const initial = readInitialKey()

export const adminKeyRemember = ref(Boolean(initial.remember))
export const adminKey = ref(String(initial.key || '').trim())
export const adminPostsRevision = ref(0)

export function setAdminKey(next, remember = undefined) {
  const v = String(next || '').trim()
  const persist = remember === undefined ? Boolean(adminKeyRemember.value) : Boolean(remember)
  adminKeyRemember.value = persist
  adminKey.value = v

  // Default: keep the key only for the current browser session.
  if (session) {
    if (v) session.setItem(STORAGE_KEY, v)
    else session.removeItem(STORAGE_KEY)
  }

  // Optional: persist across sessions when explicitly enabled.
  if (local) {
    if (persist && v) local.setItem(STORAGE_KEY, v)
    else local.removeItem(STORAGE_KEY)

    if (persist) local.setItem(REMEMBER_KEY, '1')
    else local.removeItem(REMEMBER_KEY)
  }
}

export function bumpAdminPosts() {
  adminPostsRevision.value += 1
}
