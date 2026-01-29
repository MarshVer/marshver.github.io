// Lazily import `markdown-it` so it doesn't inflate the initial client bundle.
// This module is currently only used by the admin editor preview.

const SITE_ORIGIN_RE = /^https?:\/\//i
const UNSAFE_PROTOCOL_RE = /^(?:javascript|data|vbscript):/i

function escapeHtmlCode(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeHtmlAttr(s) {
  return escapeHtmlCode(s).replaceAll('"', '&quot;')
}

function slugifyHeading(text) {
  const s = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, '-')
    // Keep ASCII alnum, dash/underscore, and common CJK ranges for readable anchors.
    .replace(/[^0-9a-z\-_\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')

  return s
}

function highlightPlain(text, lang) {
  const l = String(lang || '').toLowerCase()

  let re = null
  if (l === 'js' || l === 'javascript' || l === 'ts' || l === 'typescript') {
    re =
      /\b\d+(?:\.\d+)?\b|\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|class|extends|import|from|export|default|async|await|true|false|null|undefined|this|super)\b/g
  } else if (l === 'bash' || l === 'sh' || l === 'shell' || l === 'zsh') {
    re = /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|--[A-Za-z0-9_-]+|\b\d+(?:\.\d+)?\b/g
  } else if (l === 'json') {
    re = /\b\d+(?:\.\d+)?\b|\b(?:true|false|null)\b/g
  } else if (l === 'yaml' || l === 'yml') {
    re = /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|--[A-Za-z0-9_-]+|\b\d+(?:\.\d+)?\b|\b(?:true|false|null)\b/g
  }

  if (!re) return escapeHtmlCode(text)

  let out = ''
  let last = 0
  for (;;) {
    const m = re.exec(text)
    if (!m) break
    const start = m.index
    const end = start + m[0].length
    if (start > last) out += escapeHtmlCode(text.slice(last, start))

    const token = m[0]
    let cls = 'tok tok-plain'
    if (/^\d/.test(token)) cls = 'tok tok-num'
    else if (token.startsWith('$')) cls = 'tok tok-var'
    else if (token.startsWith('--')) cls = 'tok tok-flag'
    else if (l === 'json') cls = 'tok tok-kw'
    else cls = 'tok tok-kw'

    out += `<span class="${cls}">${escapeHtmlCode(token)}</span>`
    last = end
  }

  if (last < text.length) out += escapeHtmlCode(text.slice(last))
  return out
}

function highlightCode(code, langHint = '') {
  const lang = String(langHint || '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()

  const isJs = lang === 'js' || lang === 'javascript' || lang === 'ts' || lang === 'typescript'
  const isShell = lang === 'bash' || lang === 'sh' || lang === 'shell' || lang === 'zsh'
  const isJson = lang === 'json'
  const isYaml = lang === 'yaml' || lang === 'yml'

  const src = String(code ?? '')
  if (!isJs && !isShell && !isJson && !isYaml) return escapeHtmlCode(src)

  const classifyStringToken = (quote, raw, endPos, src) => {
    if (isJson) {
      let k = endPos
      while (k < src.length && /\s/.test(src[k])) k += 1
      if (src[k] === ':') return 'tok tok-key'
    }
    return 'tok tok-str'
  }

  let out = ''
  let i = 0

  while (i < src.length) {
    // JS/TS comments
    if (isJs && src.startsWith('//', i)) {
      const end = src.indexOf('\n', i)
      const j = end === -1 ? src.length : end
      out += `<span class="tok tok-comment">${escapeHtmlCode(src.slice(i, j))}</span>`
      i = j
      continue
    }

    if (isJs && src.startsWith('/*', i)) {
      const end = src.indexOf('*/', i + 2)
      const j = end === -1 ? src.length : end + 2
      out += `<span class="tok tok-comment">${escapeHtmlCode(src.slice(i, j))}</span>`
      i = j
      continue
    }

    // Shell/YAML comments
    if ((isShell || isYaml) && src[i] === '#') {
      const prev = i === 0 ? '\n' : src[i - 1]
      if (prev === '\n' || /\s/.test(prev)) {
        const end = src.indexOf('\n', i)
        const j = end === -1 ? src.length : end
        out += `<span class="tok tok-comment">${escapeHtmlCode(src.slice(i, j))}</span>`
        i = j
        continue
      }
    }

    // Strings (common)
    const ch = src[i]
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      let j = i + 1
      while (j < src.length) {
        const c = src[j]
        if (c === '\\') {
          j += 2
          continue
        }
        if (c === quote) {
          j += 1
          break
        }
        j += 1
      }

      const raw = src.slice(i, j)
      const cls = classifyStringToken(quote, raw, j, src)
      out += `<span class="${cls}">${escapeHtmlCode(raw)}</span>`
      i = j
      continue
    }

    // Plain chunk until the next "special" token start.
    let j = i + 1
    while (j < src.length) {
      const c = src[j]
      if (c === '"' || c === "'" || c === '`') break
      if (isJs && src.startsWith('//', j)) break
      if (isJs && src.startsWith('/*', j)) break
      if ((isShell || isYaml) && c === '#') {
        const prev = j === 0 ? '\n' : src[j - 1]
        if (prev === '\n' || /\s/.test(prev)) break
      }
      j += 1
    }

    out += highlightPlain(src.slice(i, j), lang)
    i = j
  }

  // MarkdownIt expects `highlight()` to return HTML (already escaped).
  return out
}

function defaultLinkOpen(tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options)
}

function defaultHeadingOpen(tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options)
}

function defaultImage(tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options)
}

export async function createMarkdownRenderer() {
  return await getDefaultRenderer()
}

function createMarkdownRendererSync(MarkdownItCtor) {
  const md = new MarkdownItCtor({
    html: false,
    // Keep auto-linking, but tighten validation to avoid false-positives in mixed-language text.
    linkify: true,
    typographer: true,
    breaks: true,
    highlight: (str, lang) => highlightCode(str, lang),
  })

  const baseValidate = md.validateLink
  md.validateLink = (url) => {
    const u = String(url || '').trim()
    if (UNSAFE_PROTOCOL_RE.test(u)) return false
    if (!baseValidate.call(md, u)) return false

    // Reduce linkify false-positives like "http://和https" (punycode host with no dot).
    if (/^https?:\/\//i.test(u)) {
      try {
        const parsed = new URL(u)
        const host = String(parsed.hostname || '').trim().toLowerCase()
        const isLocalhost = host === 'localhost'
        const hasDot = host.includes('.')
        const isIPv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
        const isIPv6 = host.includes(':')
        if (!isLocalhost && !hasDot && !isIPv4 && !isIPv6) return false
      } catch {
        // ignore
      }
    }

    return true
  }

  const baseLinkOpen = md.renderer.rules.link_open || defaultLinkOpen
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const href = String(token.attrGet('href') || '')

    if (SITE_ORIGIN_RE.test(href)) {
      token.attrSet('target', '_blank')
      const rel = String(token.attrGet('rel') || '')
      const parts = new Set(rel.split(/\s+/).filter(Boolean))
      parts.add('noopener')
      parts.add('noreferrer')
      token.attrSet('rel', Array.from(parts).join(' '))
    }

    return baseLinkOpen(tokens, idx, options, env, self)
  }

  const baseImage = md.renderer.rules.image || defaultImage
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    token.attrSet('loading', 'lazy')
    token.attrSet('decoding', 'async')
    return baseImage(tokens, idx, options, env, self)
  }

  // Add stable IDs to headings and render a small permalink anchor.
  md.core.ruler.push('heading_ids', (state) => {
    const seen = new Map()
    const tokens = state.tokens || []

    for (let i = 0; i < tokens.length; i += 1) {
      const t = tokens[i]
      if (t.type !== 'heading_open') continue

      const inline = tokens[i + 1]
      if (!inline || inline.type !== 'inline') continue

      const text = String(inline.content || '')
      let id = slugifyHeading(text)
      if (!id) id = `h${String(t.tag || 'h').replace(/^h/i, '') || 'x'}`

      const count = (seen.get(id) || 0) + 1
      seen.set(id, count)
      if (count > 1) id = `${id}-${count}`

      t.attrSet('id', id)
    }
  })

  const baseHeadingOpen = md.renderer.rules.heading_open || defaultHeadingOpen
  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const id = String(token.attrGet('id') || '').trim()
    const open = baseHeadingOpen(tokens, idx, options, env, self)
    if (!id) return open
    return `${open}<a class="header-anchor" href="#${escapeHtmlAttr(id)}" aria-label="Permalink">#</a>`
  }

  return md
}

let DEFAULT_MD_PROMISE = null

async function getDefaultRenderer() {
  if (DEFAULT_MD_PROMISE) return await DEFAULT_MD_PROMISE

  DEFAULT_MD_PROMISE = (async () => {
    const mod = await import('markdown-it')
    const MarkdownItCtor = mod?.default || mod
    return createMarkdownRendererSync(MarkdownItCtor)
  })()

  return await DEFAULT_MD_PROMISE
}

// Back-compat alias.
export async function createMarkdownRendererAsync() {
  return await getDefaultRenderer()
}

export async function renderMarkdown(markdown) {
  const md = await getDefaultRenderer()
  return md.render(String(markdown || ''))
}
