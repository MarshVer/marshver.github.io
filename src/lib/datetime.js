export function toTimeDatetime(value) {
  const s = String(value || '').trim()
  if (!s) return ''

  // Accept "YYYY-MM-DD" or "YYYY-MM-DD HH:mm[:ss]" (admin format) and emit ISO-ish value for <time datetime>.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?/)
  if (!m) return s
  if (!m[2]) return m[1]
  return `${m[1]}T${m[2]}:${m[3] || '00'}`
}

