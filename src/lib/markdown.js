import MarkdownIt from 'markdown-it'

const SITE_ORIGIN_RE = /^https?:\/\//i
const UNSAFE_PROTOCOL_RE = /^(?:javascript|data|vbscript):/i

function defaultLinkOpen(tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options)
}

function defaultImage(tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options)
}

export function createMarkdownRenderer() {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: true,
  })

  const baseValidate = md.validateLink
  md.validateLink = (url) => {
    const u = String(url || '').trim()
    if (UNSAFE_PROTOCOL_RE.test(u)) return false
    return baseValidate.call(md, u)
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

  return md
}

const DEFAULT_MD = createMarkdownRenderer()

export function renderMarkdown(markdown) {
  return DEFAULT_MD.render(String(markdown || ''))
}
