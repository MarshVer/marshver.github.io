<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ensurePostsIndex, getAllPosts, postsRevision, prefetchPost } from '@/lib/posts'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const loadError = ref('')

const keyword = computed(() =>
  String(route.query.q || '')
    .trim()
    .toLowerCase(),
)
const allPosts = computed(() => {
  postsRevision.value
  return getAllPosts()
})
const posts = computed(() => {
  const k = keyword.value
  if (!k) return allPosts.value
  return allPosts.value.filter((p) => p.title.toLowerCase().includes(k))
})

onMounted(async () => {
  if (getAllPosts().length) return
  loading.value = true
  loadError.value = ''
  try {
    await ensurePostsIndex()
  } catch (err) {
    loadError.value = err?.message || String(err)
  } finally {
    loading.value = false
  }
})

let postViewPrefetched = false
function prefetchPostRoute(slug) {
  prefetchPost(slug)
  if (postViewPrefetched) return
  postViewPrefetched = true
  // Hint the browser early so navigation feels instant.
  import('./PostView.vue').catch(() => {})
}

const PAGE_SIZE = 10
const page = computed(() => {
  const raw = Array.isArray(route.query.page) ? route.query.page[0] : route.query.page
  const n = Number.parseInt(String(raw || '1'), 10)
  return Number.isFinite(n) && n > 0 ? n : 1
})

const totalPages = computed(() => Math.max(1, Math.ceil(posts.value.length / PAGE_SIZE)))
const currentPage = computed(() => Math.min(page.value, totalPages.value))

const pagedPosts = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return posts.value.slice(start, start + PAGE_SIZE)
})

function goPage(nextPage) {
  const p = Math.min(Math.max(1, Number(nextPage) || 1), totalPages.value)
  const query = { ...route.query }
  if (p <= 1) delete query.page
  else query.page = String(p)
  router.replace({ name: 'home', query })
}

</script>

<template>
  <div class="home">
    <div v-if="loading" class="post-block empty-block">加载中...</div>
    <div v-else-if="loadError" class="post-block empty-block">{{ loadError }}</div>
    <div v-else-if="posts.length === 0" class="post-block empty-block">暂无文章</div>

    <template v-else>
      <article v-for="p in pagedPosts" :key="p.slug" class="post-block">
        <header>
          <h2 class="post-title">
            <router-link
              :to="{ name: 'post', params: { slug: p.slug } }"
              @mouseenter="prefetchPostRoute(p.slug)"
              @focus="prefetchPostRoute(p.slug)"
            >
              {{ p.title }}
            </router-link>
          </h2>
          <div class="post-meta">
            <time :datetime="p.date">{{ p.date }}</time>
          </div>
        </header>

        <div class="post-excerpt">{{ p.excerpt }}</div>

        <footer class="post-footer">
          <router-link class="post-more" :to="{ name: 'post', params: { slug: p.slug } }">
            阅读全文 »
          </router-link>
        </footer>
      </article>

      <nav v-if="totalPages > 1" class="home-pagination" aria-label="Pagination">
        <button
          class="home-pagination__btn"
          type="button"
          :disabled="currentPage <= 1"
          @click="goPage(currentPage - 1)"
        >
          上一页
        </button>

        <div class="home-pagination__pages" aria-label="Pages">
          <button
            v-for="n in totalPages"
            :key="n"
            class="home-pagination__page"
            :class="{ 'is-active': n === currentPage }"
            type="button"
            @click="goPage(n)"
          >
            {{ n }}
          </button>
        </div>

        <button
          class="home-pagination__btn"
          type="button"
          :disabled="currentPage >= totalPages"
          @click="goPage(currentPage + 1)"
        >
          下一页
        </button>
      </nav>
    </template>
  </div>
</template>
