import { ADMIN_TURNSTILE_SITE_KEY } from '@/lib/adminConfig'

const SCRIPT_ID = 'cf-turnstile-api'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let scriptPromise = null
let container = null
let widgetId = null
let tokenPromise = null
let activeRequest = null

function loadScript() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Turnstile failed to load.')), {
        once: true,
      })
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('Turnstile failed to load.')), {
      once: true,
    })
    document.head.appendChild(script)
  })

  return scriptPromise
}

function ensureContainer() {
  if (container?.isConnected) return container
  container = document.createElement('div')
  container.id = 'admin-turnstile'
  container.className = 'admin-turnstile-host'
  document.body.appendChild(container)
  return container
}

function settleActive(err, token = '') {
  const current = activeRequest
  activeRequest = null
  if (!current) return
  window.clearTimeout(current.timeout)
  if (err) current.reject(err)
  else current.resolve(token)
}

function ensureWidget() {
  const turnstile = window.turnstile
  if (!turnstile) throw new Error('Turnstile is unavailable.')

  if (widgetId !== null) return widgetId

  widgetId = turnstile.render(ensureContainer(), {
    sitekey: ADMIN_TURNSTILE_SITE_KEY,
    size: 'invisible',
    execution: 'execute',
    callback(token) {
      const value = String(token || '').trim()
      if (!value) settleActive(new Error('Turnstile returned an empty token.'))
      else settleActive(null, value)
    },
    'error-callback'() {
      settleActive(new Error('Turnstile verification failed.'))
    },
    'expired-callback'() {
      settleActive(new Error('Turnstile token expired.'))
    },
  })

  if (widgetId === undefined || widgetId === null) {
    widgetId = null
    throw new Error('Turnstile widget failed to render.')
  }

  return widgetId
}

export async function getTurnstileToken() {
  if (!ADMIN_TURNSTILE_SITE_KEY) return ''
  if (typeof window === 'undefined' || typeof document === 'undefined') return ''
  if (tokenPromise) return await tokenPromise

  tokenPromise = (async () => {
    await loadScript()
    const turnstile = window.turnstile
    const id = ensureWidget()

    return await new Promise((resolve, reject) => {
      activeRequest = {
        resolve,
        reject,
        timeout: window.setTimeout(() => {
          settleActive(new Error('Turnstile timed out.'))
        }, 15000),
      }

      try {
        turnstile.reset(id)
        turnstile.execute(id)
      } catch (err) {
        settleActive(err)
      }
    })
  })()

  try {
    return await tokenPromise
  } finally {
    tokenPromise = null
  }
}
