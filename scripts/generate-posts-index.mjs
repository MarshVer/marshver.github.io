import fs from 'node:fs/promises'
import path from 'node:path'

import {
  normalizePostMeta,
  sortPostMeta,
  toPostMeta,
} from '../shared/post-utils.js'

const POSTS_DIR = path.resolve('src/posts')
const OUT_FILE = path.join(POSTS_DIR, 'index.json')

async function main() {
  const entries = await fs.readdir(POSTS_DIR, { withFileTypes: true }).catch(() => [])
  const mdFiles = entries
    .filter((e) => e.isFile() && /\.md$/i.test(e.name))
    .map((e) => e.name)

  const posts = []
  for (const file of mdFiles) {
    const slug = file.replace(/\.md$/i, '')
    const filePath = path.join(POSTS_DIR, file)
    const raw = await fs.readFile(filePath, 'utf8').catch(() => '')
    if (!raw) continue
    const meta = normalizePostMeta(toPostMeta(slug, raw))
    if (meta) posts.push(meta)
  }

  const sorted = sortPostMeta(posts)

  const out = `${JSON.stringify({ posts: sorted }, null, 2)}\n`
  await fs.writeFile(OUT_FILE, out, 'utf8')
  // eslint-disable-next-line no-console
  console.log(`Wrote ${sorted.length} posts -> ${OUT_FILE}`)
}

await main()
