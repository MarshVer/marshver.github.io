<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ensurePostsIndex, getAllPosts, postsRevision } from '@/lib/posts'
import AdminSidebar from '@/components/AdminSidebar.vue'
import { ADMIN_ENABLED } from '@/lib/adminConfig'
import avatarFallbackUrl from '@/assets/avatar.png'

// Prefer local assets for reliability (no third-party image host dependency).
const avatarSrc = ref(avatarFallbackUrl)

function onAvatarError() {
  if (avatarSrc.value === avatarFallbackUrl) return
  avatarSrc.value = avatarFallbackUrl
}

const route = useRoute()
const router = useRouter()

const adminEnabled = ADMIN_ENABLED

const activeName = computed(() => String(route.name || ''))
const isHome = computed(() => activeName.value === 'home')
const isArchives = computed(() => activeName.value === 'archives')
const isTags = computed(() => activeName.value === 'tags')
const isAdmin = computed(() => activeName.value === 'admin')
const isSearchable = computed(() => isHome.value || isArchives.value || isTags.value || isAdmin.value)

const routeQueryQ = computed(() => {
  const q = route.query.q
  return Array.isArray(q) ? q[0] : q || ''
})

const searchText = ref(String(routeQueryQ.value || ''))

watch(routeQueryQ, (v) => {
  const next = String(v || '')
  if (searchText.value !== next) searchText.value = next
})

const menuQuery = computed(() => {
  const q = searchText.value.trim()
  return q ? { q } : {}
})

const archivesCount = computed(() => {
  postsRevision.value
  return getAllPosts().length
})

const tagsCount = computed(() => {
  postsRevision.value
  const set = new Set()
  for (const p of getAllPosts()) {
    const tags = Array.isArray(p?.tags) ? p.tags : []
    for (const t of tags) set.add(String(t || '').trim())
  }
  return set.size
})

function applySearch(value) {
  const q = String(value || '').trim()
  const query = { ...route.query }
  if (q) query.q = q
  else delete query.q
  // Reset pagination when searching on home.
  delete query.page

  if (isSearchable.value) {
    router.replace({ name: route.name, query })
    return
  }

  router.push({ name: 'home', query: q ? { q } : {} })
}

const isComposing = ref(false)
let debounceTimer = null

function onCompositionStart() {
  isComposing.value = true
}

function onCompositionEnd() {
  isComposing.value = false
  scheduleSearch()
}

function scheduleSearch() {
  if (!isSearchable.value) return
  if (isComposing.value) return
  if (debounceTimer) window.clearTimeout(debounceTimer)
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null
    applySearch(searchText.value)
  }, 250)
}

function flushSearch() {
  if (debounceTimer) window.clearTimeout(debounceTimer)
  debounceTimer = null
  applySearch(searchText.value)
}

onBeforeUnmount(() => {
  if (debounceTimer) window.clearTimeout(debounceTimer)
})

onMounted(() => {
  // Keep sidebar counts and route meta stable even when the page is loaded via SPA fallback.
  ensurePostsIndex().catch(() => {})
})
</script>

<template>
  <div class="layout">
    <div class="site-main">
      <div class="container">
        <div class="main-grid">
          <main class="content">
            <router-view />
          </main>

          <aside class="sidebar" aria-label="Sidebar">
            <div class="sidebar__inner">
              <section class="widget menu-widget" aria-label="Menu">
                <input
                  v-model="searchText"
                  class="search-input"
                  type="search"
                  placeholder="搜索标题"
                  aria-label="Search posts by title"
                  @compositionstart="onCompositionStart"
                  @compositionend="onCompositionEnd"
                  @input="scheduleSearch()"
                  @keydown.enter.prevent="flushSearch()"
                />

                <nav class="side-nav" aria-label="Site links">
                  <router-link
                    class="side-link"
                    :class="{ 'is-active': isHome }"
                    :to="{ name: 'home', query: menuQuery }"
                  >
                    <span class="side-link__icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                      </svg>
                    </span>
                    <span class="side-link__text">首页</span>
                  </router-link>
                  <router-link
                    class="side-link"
                    :class="{ 'is-active': isArchives }"
                    :to="{ name: 'archives', query: menuQuery }"
                  >
                    <span class="side-link__icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path
                          d="M20.54 5.23 19.15 3.5a2 2 0 0 0-1.57-.75H6.42a2 2 0 0 0-1.57.75L3.46 5.23A2 2 0 0 0 3 6.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.5a2 2 0 0 0-.46-1.27ZM6.42 4.75h11.16l.9 1.12H5.52l.9-1.12ZM19 19H5V7.87h14V19Zm-5-8h-4v2h4v-2Z"
                        />
                      </svg>
                    </span>
                    <span class="side-link__text">归档</span>
                    <span class="side-link__badge" aria-label="Archives count">
                      {{ archivesCount }}
                    </span>
                  </router-link>

                  <router-link
                    class="side-link"
                    :class="{ 'is-active': isTags }"
                    :to="{ name: 'tags', query: menuQuery }"
                  >
                    <span class="side-link__icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path
                          d="M20.59 13.41 12 22l-8.59-8.59A2 2 0 0 1 3 12V4a2 2 0 0 1 2-2h8a2 2 0 0 1 1.41.59l6.18 6.18a2 2 0 0 1 0 2.83ZM7.5 7A1.5 1.5 0 1 0 7.5 10 1.5 1.5 0 0 0 7.5 7Z"
                        />
                      </svg>
                    </span>
                    <span class="side-link__text">标签</span>
                    <span class="side-link__badge" aria-label="Tags count">
                      {{ tagsCount }}
                    </span>
                  </router-link>

                  <router-link
                    v-if="adminEnabled"
                    class="side-link"
                    :class="{ 'is-active': isAdmin }"
                    :to="{ name: 'admin', query: menuQuery }"
                  >
                    <span class="side-link__icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false">
                        <path
                          d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.53 7.53 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 1h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.23-1.12.54-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.72 7.52a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.4 1.04.71 1.62.94l.36 2.54c.04.24.25.42.49.42h3.8c.24 0 .45-.18.49-.42l.36-2.54c.58-.23 1.12-.54 1.62-.94l2.39.96c.22.09.48 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"
                        />
                      </svg>
                    </span>
                    <span class="side-link__text">管理</span>
                  </router-link>
                </nav>
              </section>

              <AdminSidebar v-if="adminEnabled && isAdmin" />

              <section v-else class="widget">
                <div class="author">
                  <img
                    class="author__avatar"
                    :src="avatarSrc"
                    alt="MarshVer"
                    @error="onAvatarError"
                  />
                  <div class="author__name">MarshVer</div>
                  <div class="author__desc">个人博客</div>

                  <div class="author-actions" aria-label="Author links">
                    <a
                      class="action-btn"
                      href="https://github.com/MarshVer?tab=repositories"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          d="M12 2C6.48 2 2 6.58 2 12.26c0 4.5 2.87 8.31 6.84 9.66.5.1.68-.22.68-.48v-1.7c-2.78.62-3.37-1.38-3.37-1.38-.45-1.2-1.11-1.52-1.11-1.52-.9-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.58 2.36 1.12 2.94.86.1-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.05 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.05.8-.23 1.66-.34 2.51-.35.85.01 1.71.12 2.51.35 1.9-1.32 2.74-1.05 2.74-1.05.56 1.4.21 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.92-2.34 4.79-4.57 5.05.36.32.69.94.69 1.9v2.82c0 .26.18.58.69.48 3.96-1.35 6.83-5.16 6.83-9.66C22 6.58 17.52 2 12 2Z"
                        />
                      </svg>
                      <span>GitHub</span>
                    </a>

                    <a class="action-btn" href="mailto:1954440662@qq.com">
                      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path
                          d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2Zm0 4-8 5-8-5V6l8 5 8-5v2Z"
                        />
                      </svg>
                      <span>E-Mail</span>
                    </a>
                  </div>
                </div>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </div>

    <footer class="footer">
      <div class="container footer__inner">© 2026 MarshVer</div>
    </footer>
  </div>
</template>
