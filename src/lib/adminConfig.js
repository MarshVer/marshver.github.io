export const ADMIN_API_BASE = String(import.meta.env.VITE_ADMIN_API_BASE || '').replace(/\/+$/g, '')

// Remote admin is typically used on GitHub Pages (no local filesystem).
export const ADMIN_REMOTE = Boolean(ADMIN_API_BASE)

// In production, only enable /admin when a remote API is configured.
export const ADMIN_ENABLED =
  import.meta.env.DEV || (String(import.meta.env.VITE_ENABLE_ADMIN) === 'true' && ADMIN_REMOTE)
