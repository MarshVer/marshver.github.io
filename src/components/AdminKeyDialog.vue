<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  value: { type: String, default: '' },
})

const emit = defineEmits(['update:open', 'save'])

const show = computed({
  get: () => props.open,
  set: (v) => emit('update:open', Boolean(v)),
})

const input = ref(String(props.value || ''))

watch(
  () => props.open,
  (v) => {
    if (v) input.value = String(props.value || '')
  },
)

function close() {
  show.value = false
}

function onSave() {
  emit('save', String(input.value || '').trim())
  show.value = false
}

function onKeyDown(e) {
  if (!props.open) return
  if (e.key === 'Escape') close()
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onSave()
}

watch(
  () => props.open,
  (v) => {
    if (v) window.addEventListener('keydown', onKeyDown)
    else window.removeEventListener('keydown', onKeyDown)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="confirm-mask" role="presentation" @click.self="close">
      <div class="confirm-dialog" role="dialog" aria-modal="true" aria-label="设置管理密钥">
        <div class="confirm-dialog__title">设置管理密钥</div>
        <div class="confirm-dialog__message">
          该密钥只保存在你的浏览器中，用于调用 Cloudflare Worker 写入 GitHub 仓库。
        </div>

        <label class="key-field">
          <span class="key-field__label">ADMIN_KEY</span>
          <input v-model="input" class="key-field__input" type="password" autocomplete="off" />
          <span class="key-field__hint">Ctrl/⌘ + Enter 保存</span>
        </label>

        <div class="confirm-dialog__actions">
          <button class="confirm-btn" type="button" @click="close">取消</button>
          <button class="confirm-btn" type="button" @click="onSave">保存</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-mask {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.55);
}

.confirm-dialog {
  width: min(520px, 100%);
  background: var(--next-content-bg-alpha);
  border: 1px solid var(--next-border);
  border-radius: var(--next-radius);
  box-shadow: var(--next-shadow);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  padding: 16px;
}

.confirm-dialog__title {
  font-weight: 900;
  color: var(--next-heading);
  font-size: 16px;
}

.confirm-dialog__message {
  margin-top: 10px;
  color: var(--next-text);
  line-height: 1.75;
}

.key-field {
  margin-top: 12px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.key-field__label {
  font-size: 12px;
  color: var(--next-muted);
  font-weight: 700;
}

.key-field__input {
  border: 1px solid var(--next-border);
  background: rgba(255, 255, 255, 0.03);
  color: var(--next-text);
  border-radius: 10px;
  padding: 9px 10px;
  outline: none;
}

.key-field__input:focus {
  border-color: #666666;
  box-shadow: 0 0 0 3px rgba(102, 102, 102, 0.35);
}

.key-field__hint {
  font-size: 12px;
  color: var(--next-muted);
}

.confirm-dialog__actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.confirm-btn {
  border: 1px solid var(--next-border);
  background: rgba(255, 255, 255, 0.03);
  color: #ffffff;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.confirm-btn:hover {
  background: #666666;
  border-color: #666666;
}
</style>

