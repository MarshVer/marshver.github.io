<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { getAllPosts, postsRevision } from '@/lib/posts'

const route = useRoute()

const keyword = computed(() =>
  String(route.query.q || '')
    .trim()
    .toLowerCase(),
)
const allPosts = computed(() => {
  postsRevision.value
  return getAllPosts()
})

const filteredPosts = computed(() => {
  const k = keyword.value
  if (!k) return allPosts.value
  return allPosts.value.filter((p) => p.title.toLowerCase().includes(k))
})

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
    <div v-if="groups.length === 0" class="empty-block">暂无文章</div>

    <div v-else class="archive-timeline">
      <section v-for="g in groups" :key="g.year" class="archive-year">
        <div class="archive-year__title">{{ g.year }}</div>

        <div class="archive-items">
          <div v-for="p in g.posts" :key="p.slug" class="archive-item">
            <span class="archive-date">{{ p.date }}</span>
            <router-link class="archive-link" :to="{ name: 'post', params: { slug: p.slug } }">
              {{ p.title }}
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
