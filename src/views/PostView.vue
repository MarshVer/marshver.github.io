<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  ensurePost,
  ensurePostsIndex,
  getAllPosts,
  getCachedPost,
  getPostMetaBySlug,
  postsRevision,
} from '@/lib/posts'
import { toTimeDatetime } from '@/lib/datetime'

const route = useRoute()

const slug = computed(() => String(route.params.slug || ''))
const postMeta = computed(() => {
  postsRevision.value
  return getPostMetaBySlug(slug.value)
})

const post = ref(null)
const loading = ref(false)
const loadError = ref('')

async function refreshPost() {
  const s = slug.value
  if (!s) {
    post.value = null
    loadError.value = ''
    loading.value = false
    return
  }

  // Ensure the index is available (for title/prev-next), but don't block content rendering.
  ensurePostsIndex().catch(() => {})

  const cached = getCachedPost(s)
  if (cached) {
    post.value = cached
    loadError.value = ''
    loading.value = false
    return
  }

  loading.value = true
  loadError.value = ''
  post.value = null
  try {
    post.value = await ensurePost(s)
    if (!post.value) loadError.value = '文章不存在'
  } catch (err) {
    loadError.value = err?.message || String(err)
    post.value = null
  } finally {
    loading.value = false
  }
}

watch(slug, refreshPost, { immediate: true })

const allPosts = computed(() => {
  postsRevision.value
  return getAllPosts()
})
const postIndex = computed(() => allPosts.value.findIndex((p) => p.slug === slug.value))
// All posts are sorted DESC by date in getAllPosts().
const prevPost = computed(() => (postIndex.value > 0 ? allPosts.value[postIndex.value - 1] : null))
const nextPost = computed(() =>
  postIndex.value >= 0 && postIndex.value < allPosts.value.length - 1
    ? allPosts.value[postIndex.value + 1]
    : null,
)

const effectiveMeta = computed(() => postMeta.value || post.value)
const html = computed(() => (post.value ? String(post.value.html || '') : ''))

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '')
}

const tocItems = computed(() => {
  const src = html.value
  if (!src) return []

  const out = []
  const re = /<(h[1-4])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi
  let m
  while ((m = re.exec(src))) {
    const tag = String(m[1] || '').toLowerCase()
    const level = Number(tag.slice(1)) || 0
    const id = String(m[2] || '').trim()
    // Headings include our injected permalink anchor text '#', strip it for a clean TOC label.
    const text = decodeHtmlEntities(stripTags(m[3] || '')).trim().replace(/^#\s*/, '').trim()
    if (!id || !text) continue
    out.push({ id, text, level })
  }

  return out
})

const activeTocId = ref('')
let tocRaf = null

function computeActiveTocId() {
  if (typeof document === 'undefined') return ''
  const headings = Array.from(
    document.querySelectorAll(
      '.markdown h1[id], .markdown h2[id], .markdown h3[id], .markdown h4[id]',
    ),
  )
  if (headings.length === 0) return ''

  // Pick the last heading above the viewport "anchor line".
  const anchorY = 120
  let bestId = ''
  let bestTop = -Infinity
  for (const el of headings) {
    const top = el.getBoundingClientRect().top
    if (top <= anchorY && top > bestTop) {
      bestTop = top
      bestId = String(el.id || '')
    }
  }

  if (!bestId) bestId = String(headings[0].id || '')
  return bestId
}

function scheduleTocUpdate() {
  if (typeof window === 'undefined') return
  if (tocRaf) return
  tocRaf = window.requestAnimationFrame(() => {
    tocRaf = null
    activeTocId.value = computeActiveTocId()
  })
}

function scrollToHeading(id) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(String(id || ''))
  if (!el) return
  activeTocId.value = String(id || '')
  const reduce =
    typeof window !== 'undefined' &&
    typeof window.matchMedia !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

const progress = ref(0)
const showBackToTop = ref(false)
let onScroll = null

onMounted(() => {
  if (typeof window === 'undefined') return

  const update = () => {
    const doc = document.documentElement
    const scrollTop = window.scrollY || doc.scrollTop || 0
    const scrollHeight = Math.max(0, (doc.scrollHeight || 0) - (doc.clientHeight || 0))
    const p = scrollHeight ? (scrollTop / scrollHeight) * 100 : 0
    progress.value = Math.max(0, Math.min(100, p))
    showBackToTop.value = scrollTop > 700
  }

  onScroll = () => update()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
  update()

  // Keep TOC highlight in sync with scroll position.
  window.addEventListener('scroll', scheduleTocUpdate, { passive: true })
  window.addEventListener('resize', scheduleTocUpdate, { passive: true })
  scheduleTocUpdate()
})

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return
  if (onScroll) {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
  }
  window.removeEventListener('scroll', scheduleTocUpdate)
  window.removeEventListener('resize', scheduleTocUpdate)
  if (tocRaf) window.cancelAnimationFrame(tocRaf)
  tocRaf = null
  onScroll = null
})

watch(html, () => {
  // Content changes after route navigation; wait for DOM to paint, then recompute active heading.
  scheduleTocUpdate()
})

function backToTop() {
  if (typeof window === 'undefined') return
  const reduce =
    typeof window !== 'undefined' &&
    typeof window.matchMedia !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
}
</script>

<template>
  <div>
    <progress class="reading-progress" :value="progress" max="100" aria-hidden="true" />

    <div v-if="!effectiveMeta" class="post-block empty-block">
      <h1 class="post-title">文章不存在</h1>
      <div class="post-excerpt">请检查链接，或返回首页查看文章列表。</div>
      <router-link class="post-more" to="/">返回首页 »</router-link>
    </div>

    <article v-else class="post-block post-single">
      <header>
        <h1 class="post-title">{{ effectiveMeta.title }}</h1>
        <div class="post-meta">
          <time :datetime="toTimeDatetime(effectiveMeta.date)">{{ effectiveMeta.date }}</time>
        </div>
      </header>

      <div v-if="loading" class="post-excerpt">加载中...</div>
      <div v-else-if="loadError" class="post-excerpt">{{ loadError }}</div>

      <!-- On small screens the sidebar stacks above content; keep an inline TOC there. -->
      <details v-if="tocItems.length" class="post-toc-inline" open>
        <summary class="post-toc-inline__summary">目录</summary>
        <nav class="post-toc__list" aria-label="Table of contents">
          <a
            v-for="it in tocItems"
            :key="it.id"
            class="post-toc__item"
            :class="[`post-toc__item--lvl${it.level}`, { 'is-active': it.id === activeTocId }]"
            :href="`#${it.id}`"
            :aria-current="it.id === activeTocId ? 'location' : undefined"
            @click.prevent="scrollToHeading(it.id)"
          >
            {{ it.text }}
          </a>
        </nav>
      </details>

      <div class="markdown" v-html="html" />

      <nav v-if="prevPost || nextPost" class="post-nav" aria-label="Post navigation">
        <router-link
          v-if="prevPost"
          class="post-nav__item post-nav__item--prev"
          :to="{ name: 'post', params: { slug: prevPost.slug } }"
        >
          上一篇：{{ prevPost.title }}
        </router-link>
        <router-link
          v-if="nextPost"
          class="post-nav__item post-nav__item--next"
          :to="{ name: 'post', params: { slug: nextPost.slug } }"
        >
          下一篇：{{ nextPost.title }}
        </router-link>
      </nav>
    </article>

    <!-- Default desktop placement: TOC goes to the right sidebar area (not inside the article preview). -->
    <teleport v-if="tocItems.length" to="#post-toc-slot">
      <section class="widget post-toc-sidebar" aria-label="Table of contents">
        <div class="post-toc__title">目录</div>
        <nav class="post-toc__list">
          <a
            v-for="it in tocItems"
            :key="it.id"
            class="post-toc__item"
            :class="[`post-toc__item--lvl${it.level}`, { 'is-active': it.id === activeTocId }]"
            :href="`#${it.id}`"
            :aria-current="it.id === activeTocId ? 'location' : undefined"
            @click.prevent="scrollToHeading(it.id)"
          >
            {{ it.text }}
          </a>
        </nav>
      </section>
    </teleport>

    <aside v-if="tocItems.length" class="post-toc-float" aria-label="Table of contents">
      <div class="post-toc__title">目录</div>
      <nav class="post-toc__list">
        <a
          v-for="it in tocItems"
          :key="it.id"
          class="post-toc__item"
          :class="[`post-toc__item--lvl${it.level}`, { 'is-active': it.id === activeTocId }]"
          :href="`#${it.id}`"
          :aria-current="it.id === activeTocId ? 'location' : undefined"
          @click.prevent="scrollToHeading(it.id)"
        >
          {{ it.text }}
        </a>
      </nav>
    </aside>

    <button
      v-if="showBackToTop"
      class="back-to-top"
      type="button"
      aria-label="Back to top"
      @click="backToTop"
    >
      ↑
    </button>
  </div>
</template>
