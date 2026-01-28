<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ensurePostsIndex, getAllPosts, postsRevision, prefetchPost } from '@/lib/posts'
import { ensureSearchIndex, searchPosts } from '@/lib/search'

const route = useRoute()

const loading = ref(false)
const loadError = ref('')
const searching = ref(false)
const searchError = ref('')
const searchResults = ref([])

const keyword = computed(() =>
  String(route.query.q || '')
    .trim()
    .toLowerCase(),
)
const allPosts = computed(() => {
  postsRevision.value
  return getAllPosts()
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

const filteredPosts = computed(() => {
  return keyword.value ? searchResults.value : allPosts.value
})

watch(
  keyword,
  async (k) => {
    const q = String(k || '').trim()
    searchError.value = ''
    searchResults.value = []
    if (!q) return

    searching.value = true
    try {
      await ensureSearchIndex()
      searchResults.value = searchPosts(q)
    } catch (err) {
      searchError.value = err?.message || String(err)
      const qLower = q.toLowerCase()
      searchResults.value = allPosts.value.filter((p) =>
        String(p?.title || '').toLowerCase().includes(qLower),
      )
    } finally {
      searching.value = false
    }
  },
  { immediate: true },
)

function getYear(date) {
  const m = String(date || '').match(/^(\d{4})/)
  return m?.[1] || '未知'
}

const groups = computed(() => {
  const map = new Map()
  for (const p of filteredPosts.value) {
    const year = getYear(p.date)
    if (!map.has(year)) map.set(year, [])
    map.get(year).push(p)
  }

  const entries = Array.from(map.entries())
  entries.sort(([a], [b]) => {
    if (a === '未知') return 1
    if (b === '未知') return -1
    return String(b).localeCompare(String(a))
  })

  return entries.map(([year, posts]) => ({ year, posts }))
})
</script>

<template>
  <div class="post-block archive">
    <div v-if="loading" class="empty-block">加载中...</div>
    <div v-else-if="loadError" class="empty-block">{{ loadError }}</div>
    <div v-else-if="keyword && searching" class="empty-block">搜索中...</div>
    <div v-else-if="keyword && searchError" class="empty-block">{{ searchError }}</div>
    <div v-else-if="groups.length === 0" class="empty-block">暂无文章</div>

    <div v-else class="archive-timeline">
      <section v-for="g in groups" :key="g.year" class="archive-year">
        <div class="archive-year__title">{{ g.year }}</div>

        <div class="archive-items">
          <div v-for="p in g.posts" :key="p.slug" class="archive-item">
            <span class="archive-date">{{ p.date }}</span>
            <router-link
              class="archive-link"
              :to="{ name: 'post', params: { slug: p.slug } }"
              @mouseenter="prefetchPost(p.slug)"
              @focus="prefetchPost(p.slug)"
            >
              <span v-if="p.titleHtml" v-html="p.titleHtml" />
              <span v-else>{{ p.title }}</span>
            </router-link>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.archive-timeline {
  position: relative;
  padding-left: 30px;
}

.archive-timeline::before {
  content: '';
  position: absolute;
  left: 12px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--next-border);
}

.archive-year {
  padding: 6px 0 2px;
}

.archive-year__title {
  position: relative;
  margin: 16px 0 10px;
  font-size: 15px;
  font-weight: 900;
  color: var(--next-heading);
}

.archive-year__title::before {
  content: '';
  position: absolute;
  left: -22px;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--next-accent);
}

.archive-item {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 8px 0;
}

.archive-item::before {
  content: '';
  position: absolute;
  left: -22px;
  top: 16px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--next-accent);
  background: var(--next-content-bg-alpha);
}

.archive-date {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--next-muted);
}

.archive-link {
  color: var(--next-heading);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.archive-link:hover {
  color: var(--next-accent);
  text-decoration: none;
}

@media (max-width: 640px) {
  .archive-item {
    gap: 10px;
  }

  .archive-link {
    white-space: normal;
  }
}
</style>
