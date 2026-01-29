<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAllPosts, postsRevision } from '@/lib/posts'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AdminKeyDialog from '@/components/AdminKeyDialog.vue'
import { ADMIN_REMOTE } from '@/lib/adminConfig'
import { adminKey, adminKeyRemember, adminPostsRevision, bumpAdminPosts, setAdminKey } from '@/lib/adminState'
import { createPost as apiCreatePost, deletePost as apiDeletePost, listPosts } from '@/lib/adminApi'

const route = useRoute()
const router = useRouter()

const keyword = computed(() =>
  String(route.query.q || '')
    .trim()
    .toLowerCase(),
)

const selectedSlug = computed(() => {
  const s = route.query.slug
  return String(Array.isArray(s) ? s[0] : s || '').trim()
})

const isRemote = ADMIN_REMOTE
const keyDialogOpen = ref(false)

const remotePosts = ref([])
const loadingPosts = ref(false)
const loadError = ref('')

async function refreshPosts() {
  if (!isRemote) return
  loadingPosts.value = true
  loadError.value = ''
  try {
    remotePosts.value = await listPosts()
  } catch (err) {
    loadError.value = err?.message || String(err)
  } finally {
    loadingPosts.value = false
  }
}

onMounted(refreshPosts)
watch(adminPostsRevision, refreshPosts)

const allPosts = computed(() => {
  if (isRemote) return remotePosts.value
  postsRevision.value
  return getAllPosts()
})

const posts = computed(() => {
  const all = allPosts.value
  const k = keyword.value
  if (!k) return all
  return all.filter((p) => p.title.toLowerCase().includes(k))
})

const confirmOpen = ref(false)
const pendingPost = ref(null)

function setSelected(slug) {
  const query = { ...route.query, slug }
  return router.replace({ name: 'admin', query })
}

async function adminPost(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || 'Request failed')
  return data
}

async function createPost() {
  try {
    const data = isRemote ? await apiCreatePost() : await adminPost('/__admin/create', {})
    if (!data?.slug) return
    await setSelected(data.slug)
    bumpAdminPosts()
  } catch (err) {
    window.alert(err?.message || String(err))
  }
}

function requestRemove(p) {
  pendingPost.value = p || null
  confirmOpen.value = true
}

async function doRemove() {
  const p = pendingPost.value
  pendingPost.value = null
  if (!p?.slug) return
  try {
    if (isRemote) await apiDeletePost(p.slug)
    else await adminPost('/__admin/delete', { slug: p.slug })

    if (selectedSlug.value === p.slug) {
      const q = { ...route.query }
      delete q.slug
      await router.replace({ name: 'admin', query: q })
    }
    bumpAdminPosts()
  } catch (err) {
    window.alert(err?.message || String(err))
  }
}
</script>

<template>
  <section class="widget admin-widget" aria-label="Admin">
    <div class="admin-widget__header">
      <div class="admin-widget__title">博客管理</div>
      <div class="admin-widget__actions">
        <button v-if="isRemote" class="admin-btn" type="button" @click="keyDialogOpen = true">
          密钥
        </button>
        <button class="admin-btn" type="button" :disabled="isRemote && !adminKey" @click="createPost">
          新建
        </button>
      </div>
    </div>

    <div v-if="isRemote && loadingPosts" class="admin-empty">加载中...</div>
    <div v-else-if="isRemote && loadError" class="admin-empty">{{ loadError }}</div>
    <div v-else-if="posts.length === 0" class="admin-empty">暂无文章</div>

    <div v-else class="admin-list" role="list">
      <div
        v-for="p in posts"
        :key="p.slug"
        class="admin-item"
        :class="{ 'is-active': p.slug === selectedSlug }"
        role="listitem"
      >
        <button class="admin-item__select" type="button" @click="setSelected(p.slug)">
          <div class="admin-item__title" :title="p.title">{{ p.title }}</div>
          <div class="admin-item__meta">{{ p.date }}</div>
        </button>

        <div class="admin-item__actions">
          <button
            class="icon-btn icon-btn--danger"
            type="button"
            title="删除"
            :disabled="isRemote && !adminKey"
            @click="requestRemove(p)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 7h12l-1 14H7L6 7Zm3-3h6l1 2H8l1-2Zm-3 2h12v2H6V6Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-model:open="confirmOpen"
      title="确认删除"
      :message="`确认删除「${String(pendingPost?.title || pendingPost?.slug || '').trim()}」？`"
      confirm-text="删除"
      :danger="true"
      @confirm="doRemove"
    />

    <AdminKeyDialog
      v-model:open="keyDialogOpen"
      :value="adminKey"
      :remember="adminKeyRemember"
      @save="setAdminKey"
    />
  </section>
</template>

<style scoped>
.admin-widget__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
