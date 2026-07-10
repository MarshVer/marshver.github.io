const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function isVisible(el) {
  if (!el) return false
  const style = window.getComputedStyle(el)
  if (style.visibility === 'hidden' || style.display === 'none') return false
  return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
}

export function getFocusableElements(root) {
  if (!root || typeof window === 'undefined') return []
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false
    return isVisible(el)
  })
}

export function focusFirstDescendant(root, preferred = null) {
  if (!root || typeof window === 'undefined') return
  const target = preferred || getFocusableElements(root)[0] || root
  if (typeof target.focus === 'function') target.focus({ preventScroll: true })
}

export function trapFocusKeydown(event, root) {
  if (!root || event.key !== 'Tab') return false

  const focusable = getFocusableElements(root)
  if (focusable.length === 0) {
    event.preventDefault()
    root.focus({ preventScroll: true })
    return true
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement

  if (!root.contains(active)) {
    event.preventDefault()
    first.focus({ preventScroll: true })
    return true
  }

  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus({ preventScroll: true })
    return true
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus({ preventScroll: true })
    return true
  }

  return false
}

export function restoreFocus(el) {
  if (!el || typeof el.focus !== 'function') return
  if (typeof document !== 'undefined' && document.contains(el)) {
    el.focus({ preventScroll: true })
  }
}
