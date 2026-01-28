<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ensurePostsIndex, getAllPosts, postsRevision } from '@/lib/posts'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const loadError = ref('')

const keyword = computed(() =>
  String(route.query.q || '')
    .trim()
    .toLowerCase(),
)

const selectedTag = computed(() => {
  const v = route.query.tag
  return String(Array.isArray(v) ? v[0] : v || '').trim()
})

const selectedCategory = computed(() => {
  const v = route.query.category
  return String(Array.isArray(v) ? v[0] : v || '').trim()
})

const allPosts = computed(() => {
  postsRevision.value
  return getAllPosts()
})

function normalizeArray(value) {
  return Array.isArray(value) ? value.map((v) => String(v || '').trim()).filter(Boolean) : []
}

const tagStats = computed(() => {
  const map = new Map()
  for (const p of allPosts.value) {
    for (const t of normalizeArray(p?.tags)) {
      map.set(t, (map.get(t) || 0) + 1)
    }
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
})

const categoryStats = computed(() => {
  const map = new Map()
  for (const p of allPosts.value) {
    for (const c of normalizeArray(p?.categories)) {
      map.set(c, (map.get(c) || 0) + 1)
    }
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
})

const filteredPosts = computed(() => {
  const k = keyword.value
  const tag = selectedTag.value
  const category = selectedCategory.value

  return allPosts.value.filter((p) => {
    if (k && !String(p?.title || '').toLowerCase().includes(k)) return false
    if (tag) {
      const tags = normalizeArray(p?.tags)
      if (!tags.includes(tag)) return false
    }
    if (category) {
      const cats = normalizeArray(p?.categories)
      if (!cats.includes(category)) return false
    }
    return true
  })
})

function setQuery(updates) {
  const next = { ...route.query, ...updates }
  // Clean empty values.
  for (const k of Object.keys(next)) {
    const v = next[k]
    if (v === undefined || v === null || String(v).trim() === '') delete next[k]
  }
  router.replace({ name: 'tags', query: next })
}

function pickTag(name) {
  setQuery({ tag: name || undefined, page: undefined })
}

function pickCategory(name) {
  setQuery({ category: name || undefined, page: undefined })
}

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
</script>

<template>
  <div class="post-block tags">
    <div v-if="loading" class="empty-block">加载中...</div>
    <div v-else-if="loadError" class="empty-block">{{ loadError }}</div>

    <template v-else>
      <header class="tags-head">
        <h1 class="tags-title">标签</h1>
        <div class="tags-sub">
          <span v-if="selectedTag">当前标签：{{ selectedTag }}</span>
          <span v-else-if="selectedCategory">当前分类：{{ selectedCategory }}</span>
          <span v-else>选择一个标签/分类查看文章</span>
        </div>
      </header>

      <section v-if="tagStats.length" class="tags-section" aria-label="Tags">
        <div class="tags-section__title">标签</div>
        <div class="chips">
          <button
            class="chip"
            :class="{ 'is-active': !selectedTag }"
            type="button"
            @click="pickTag('')"
          >
            全部
          </button>
          <button
            v-for="t in tagStats"
            :key="t.name"
            class="chip"
            :class="{ 'is-active': t.name === selectedTag }"
            type="button"
            @click="pickTag(t.name)"
          >
            {{ t.name }} <span class="chip__count">{{ t.count }}</span>
          </button>
        </div>
      </section>

      <section v-if="categoryStats.length" class="tags-section" aria-label="Categories">
        <div class="tags-section__title">分类</div>
        <div class="chips">
          <button
            class="chip"
            :class="{ 'is-active': !selectedCategory }"
            type="button"
            @click="pickCategory('')"
          >
            全部
          </button>
          <button
            v-for="c in categoryStats"
            :key="c.name"
            class="chip"
            :class="{ 'is-active': c.name === selectedCategory }"
            type="button"
            @click="pickCategory(c.name)"
          >
            {{ c.name }} <span class="chip__count">{{ c.count }}</span>
          </button>
        </div>
      </section>

      <section class="tags-results" aria-label="Posts">
        <div v-if="filteredPosts.length === 0" class="empty-block">暂无文章</div>

        <article v-for="p in filteredPosts" :key="p.slug" class="tag-post">
          <router-link class="tag-post__title" :to="{ name: 'post', params: { slug: p.slug } }">
            {{ p.title }}
          </router-link>
          <div class="tag-post__meta">
            <time :datetime="p.date">{{ p.date }}</time>
          </div>
          <div v-if="p.excerpt" class="tag-post__excerpt">{{ p.excerpt }}</div>
        </article>
      </section>
    </template>
  </div>
</template>

<style scoped>
.tags-head {
  margin-bottom: 14px;
}

.tags-title {
  margin: 0;
  font-size: 18px;
  color: var(--next-heading);
}

.tags-sub {
  margin-top: 8px;
  color: var(--next-muted);
  font-size: 12px;
}

.tags-section {
  margin-top: 16px;
}

.tags-section__title {
  font-weight: 900;
  color: var(--next-heading);
  margin-bottom: 10px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 999px;
  border: 1px solid var(--next-border);
  background: rgba(255, 255, 255, 0.03);
  color: var(--next-text);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
}

.chip:hover {
  border-color: rgba(255, 255, 255, 0.22);
}

.chip.is-active {
  border-color: rgba(73, 177, 245, 0.7);
  box-shadow: 0 0 0 3px rgba(73, 177, 245, 0.12);
}

.chip__count {
  color: var(--next-muted);
  font-weight: 700;
}

.tags-results {
  margin-top: 18px;
}

.tag-post {
  padding: 14px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.tag-post:first-child {
  border-top: 0;
}

.tag-post__title {
  color: var(--next-heading);
  font-weight: 900;
}

.tag-post__meta {
  margin-top: 6px;
  color: var(--next-muted);
  font-size: 12px;
}

.tag-post__excerpt {
  margin-top: 10px;
  color: var(--next-text);
  opacity: 0.95;
  font-size: 13px;
  line-height: 1.85;
}
</style>

