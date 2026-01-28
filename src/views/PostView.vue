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
    const text = decodeHtmlEntities(stripTags(m[3] || '')).trim()
    if (!id || !text) continue
    out.push({ id, text, level })
  }

  return out
})

function scrollToHeading(id) {
  if (typeof document === 'undefined') return
  const el = document.getElementById(String(id || ''))
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
})

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return
  if (onScroll) {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
  }
  onScroll = null
})

function backToTop() {
  if (typeof window === 'undefined') return
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <div>
    <div class="reading-progress" :style="{ width: progress + '%' }" aria-hidden="true" />

    <div v-if="!effectiveMeta" class="post-block empty-block">
      <h1 class="post-title">文章不存在</h1>
      <div class="post-excerpt">请检查链接，或返回首页查看文章列表。</div>
      <router-link class="post-more" to="/">返回首页 »</router-link>
    </div>

    <article v-else class="post-block post-single">
      <header>
        <h1 class="post-title">{{ effectiveMeta.title }}</h1>
        <div class="post-meta">
          <time :datetime="effectiveMeta.date">{{ effectiveMeta.date }}</time>
        </div>
      </header>

      <div v-if="loading" class="post-excerpt">加载中...</div>
      <div v-else-if="loadError" class="post-excerpt">{{ loadError }}</div>

      <details v-if="tocItems.length" class="post-toc" open>
        <summary class="post-toc__summary">目录</summary>
        <nav class="post-toc__list" aria-label="Table of contents">
          <a
            v-for="it in tocItems"
            :key="it.id"
            class="post-toc__item"
            :class="`post-toc__item--lvl${it.level}`"
            :href="`#${it.id}`"
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
