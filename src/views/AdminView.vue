<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MarkdownIt from 'markdown-it'
import { getPostBySlug, postsRevision } from '@/lib/posts'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AdminKeyDialog from '@/components/AdminKeyDialog.vue'
import { ADMIN_REMOTE } from '@/lib/adminConfig'
import { adminKey, adminPostsRevision, bumpAdminPosts, setAdminKey } from '@/lib/adminState'
import { deletePost as apiDeletePost, getPost as apiGetPost, savePost as apiSavePost } from '@/lib/adminApi'

const route = useRoute()
const router = useRouter()

const selectedSlug = computed(() => {
  const s = route.query.slug
  return String(Array.isArray(s) ? s[0] : s || '').trim()
})

const isRemote = ADMIN_REMOTE
const keyDialogOpen = ref(false)

const remotePost = ref(null)
const loadingPost = ref(false)
const loadError = ref('')

const localPost = computed(() => {
  postsRevision.value
  return selectedSlug.value ? getPostBySlug(selectedSlug.value) : null
})

const post = computed(() => (isRemote ? remotePost.value : localPost.value))

async function refreshPost() {
  if (!isRemote) return
  const slug = selectedSlug.value
  if (!slug) {
    remotePost.value = null
    return
  }

  loadingPost.value = true
  loadError.value = ''
  try {
    remotePost.value = await apiGetPost(slug)
  } catch (err) {
    loadError.value = err?.message || String(err)
    remotePost.value = null
  } finally {
    loadingPost.value = false
  }
}

watch(selectedSlug, refreshPost, { immediate: true })
watch(adminPostsRevision, refreshPost)

const title = ref('')
const content = ref('')
const dirty = ref(false)
const savedDate = ref('')
const confirmOpen = ref(false)

watch(
  post,
  (p) => {
    title.value = p?.title || ''
    savedDate.value = p?.date === '未设置日期' ? '' : p?.date || ''
    content.value = p?.content || ''
    dirty.value = false
  },
  { immediate: true },
)

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

async function onSave() {
  if (!selectedSlug.value) return

  try {
    const payload = {
      slug: selectedSlug.value,
      title: title.value,
      content: content.value,
    }

    const data = isRemote ? await apiSavePost(payload) : await adminPost('/__admin/save', payload)

    dirty.value = false
    if (data?.date) savedDate.value = data.date

    if (data?.slug && data.slug !== selectedSlug.value) {
      const nextQuery = { ...route.query, slug: data.slug }
      await router.replace({ name: 'admin', query: nextQuery })
    }

    bumpAdminPosts()
  } catch (err) {
    window.alert(err?.message || String(err))
  }
}

async function doDelete() {
  if (!selectedSlug.value) return

  try {
    if (isRemote) await apiDeletePost(selectedSlug.value)
    else await adminPost('/__admin/delete', { slug: selectedSlug.value })
    const nextQuery = { ...route.query }
    delete nextQuery.slug
    await router.replace({ name: 'admin', query: nextQuery })
    bumpAdminPosts()
  } catch (err) {
    window.alert(err?.message || String(err))
  }
}

function openPost() {
  if (!selectedSlug.value) return
  window.open(router.resolve({ name: 'post', params: { slug: selectedSlug.value } }).href, '_blank')
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
})

const previewHtml = computed(() => md.render(content.value || ''))
</script>

<template>
  <div class="admin-page">
    <div v-if="!selectedSlug" class="post-block admin-empty">
      <h1 class="admin-empty__title">管理模式</h1>
      <div class="admin-empty__desc">在左侧选择文章，或点击“新建”创建一篇新文章。</div>
    </div>

    <div v-else class="post-block admin-editor">
      <div class="admin-editor__bar">
        <div class="admin-editor__left">
          <div class="admin-editor__title" :title="selectedSlug">
            {{ title || selectedSlug }}
          </div>
          <div class="admin-editor__hint">
            更新时间：{{ savedDate || '未保存' }}（保存时自动更新到秒）
          </div>
          <div v-if="isRemote" class="admin-editor__hint">
            远程模式：保存/删除会提交到 GitHub 仓库（src/posts/）。如果你启用了 GitHub Actions 部署 Pages，通常 1-2
            分钟后站点会更新。
          </div>
          <div v-if="isRemote && !adminKey" class="admin-editor__hint">请先设置管理密钥。</div>
          <div v-if="isRemote && loadingPost" class="admin-editor__hint">加载中...</div>
          <div v-if="isRemote && loadError" class="admin-editor__hint">{{ loadError }}</div>
        </div>

        <div class="admin-editor__actions">
          <button v-if="isRemote" class="btn" type="button" @click="keyDialogOpen = true">密钥</button>
          <button class="btn" type="button" @click="openPost">查看</button>
          <button
            class="btn"
            type="button"
            :disabled="!dirty || (isRemote && !adminKey)"
            @click="onSave"
          >
            保存
          </button>
          <button
            class="btn btn--danger"
            type="button"
            :disabled="isRemote && !adminKey"
            @click="confirmOpen = true"
          >
            删除
          </button>
        </div>
      </div>

      <div class="admin-editor__grid">
        <div class="admin-panel">
          <div class="admin-fields">
            <label class="field">
              <span class="field__label">标题</span>
              <input v-model="title" class="field__input" type="text" @input="dirty = true" />
            </label>
          </div>

          <label class="field field--textarea">
            <span class="field__label">内容</span>
            <textarea
              v-model="content"
              class="field__textarea"
              rows="18"
              spellcheck="false"
              @input="dirty = true"
            />
          </label>
        </div>

        <div class="admin-preview">
          <div class="admin-preview__title">预览</div>
          <div class="markdown" v-html="previewHtml" />
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-model:open="confirmOpen"
      title="确认删除"
      :message="`确认删除「${String(title.trim() || selectedSlug || '').trim()}」？`"
      confirm-text="删除"
      :danger="true"
      @confirm="doDelete"
    />

    <AdminKeyDialog v-model:open="keyDialogOpen" :value="adminKey" @save="setAdminKey" />
  </div>
</template>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.admin-empty__title {
  margin: 0;
  font-size: 22px;
  color: var(--next-heading);
  text-align: center;
}

.admin-empty__desc {
  margin-top: 10px;
  color: var(--next-muted);
  text-align: center;
}

.admin-editor {
  padding: 16px;
  /* Keep the preview column stable so wide content doesn't affect the editor column. */
  --admin-preview-width: 520px;
}

.admin-editor__bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--next-border);
}

.admin-editor__title {
  font-weight: 900;
  color: var(--next-heading);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.admin-editor__hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--next-muted);
}

.admin-editor__actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.btn {
  border: 1px solid var(--next-border);
  background: rgba(255, 255, 255, 0.03);
  color: #ffffff;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.btn:hover:not(:disabled) {
  background: #666666;
  border-color: #666666;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--danger:hover:not(:disabled) {
  background: #8a3b3b;
  border-color: #8a3b3b;
}

.admin-editor__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--admin-preview-width);
  gap: 16px;
  padding-top: 14px;
  /* Make both columns match the tallest one (usually the preview). */
  align-items: stretch;
}

.admin-panel,
.admin-preview {
  /* Allow grid items to shrink; prevents wide markdown content from widening the whole grid. */
  min-width: 0;
}

.admin-panel {
  /* Let the textarea grow to match the preview's height. */
  display: flex;
  flex-direction: column;
  height: 100%;
}

.field--textarea {
  flex: 1 1 auto;
  min-height: 0;
}

.field__textarea {
  flex: 1 1 auto;
  min-height: 0;
}

.admin-preview__title {
  font-weight: 900;
  color: var(--next-heading);
  margin-bottom: 10px;
}

.admin-fields {
  display: grid;
  grid-template-columns: 1fr;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field__label {
  font-size: 12px;
  color: var(--next-muted);
  font-weight: 700;
}

.field__input,
.field__textarea {
  border: 1px solid var(--next-border);
  background: rgba(255, 255, 255, 0.03);
  color: var(--next-text);
  border-radius: 10px;
  padding: 9px 10px;
  outline: none;
}

.field__textarea {
  resize: vertical;
  font-family: var(--next-font-mono);
  line-height: 1.6;
}

.field__input:focus,
.field__textarea:focus {
  border-color: #666666;
  box-shadow: 0 0 0 3px rgba(102, 102, 102, 0.35);
}

.field--textarea {
  margin-top: 14px;
}

@media (max-width: 960px) {
  .admin-editor__grid {
    grid-template-columns: 1fr;
  }

  .admin-fields {
    grid-template-columns: 1fr;
  }
}
</style>
