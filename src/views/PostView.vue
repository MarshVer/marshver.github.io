<script setup>
import { computed, ref, watch } from 'vue'
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
</script>

<template>
  <div>
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
  </div>
</template>
