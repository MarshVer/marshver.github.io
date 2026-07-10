<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { focusFirstDescendant, restoreFocus, trapFocusKeydown } from '@/lib/focusTrap'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '确认操作' },
  message: { type: String, default: '' },
  confirmText: { type: String, default: '确认' },
  cancelText: { type: String, default: '取消' },
  danger: { type: Boolean, default: false },
})

const emit = defineEmits(['update:open', 'confirm', 'cancel'])

const show = computed({
  get: () => props.open,
  set: (v) => emit('update:open', Boolean(v)),
})

const dialogRef = ref(null)
let previousActiveElement = null

function closeAsCancel() {
  show.value = false
  emit('cancel')
}

function onConfirm() {
  show.value = false
  emit('confirm')
}

function onKeyDown(e) {
  if (!props.open) return
  if (e.key === 'Escape') closeAsCancel()
  else trapFocusKeydown(e, dialogRef.value)
}

watch(
  () => props.open,
  async (v) => {
    if (typeof window === 'undefined') return
    if (v) {
      previousActiveElement = document.activeElement
      window.addEventListener('keydown', onKeyDown)
      await nextTick()
      focusFirstDescendant(dialogRef.value)
    } else {
      window.removeEventListener('keydown', onKeyDown)
      restoreFocus(previousActiveElement)
      previousActiveElement = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener('keydown', onKeyDown)
  restoreFocus(previousActiveElement)
  previousActiveElement = null
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="confirm-mask" role="presentation" @click.self="closeAsCancel">
      <div
        ref="dialogRef"
        class="confirm-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
      >
        <div class="confirm-dialog__title">{{ title }}</div>
        <div v-if="message" class="confirm-dialog__message">{{ message }}</div>

        <div class="confirm-dialog__actions">
          <button class="confirm-btn" type="button" @click="closeAsCancel">{{ cancelText }}</button>
          <button
            class="confirm-btn"
            :class="{ 'confirm-btn--danger': danger }"
            type="button"
            @click="onConfirm"
          >
            {{ confirmText }}
          </button>
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
  width: min(420px, 100%);
  background: var(--next-content-bg-alpha);
  border: 1px solid var(--next-border);
  border-radius: var(--next-radius);
  box-shadow: var(--next-shadow);
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
  white-space: pre-wrap;
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

.confirm-btn--danger:hover {
  background: #8a3b3b;
  border-color: #8a3b3b;
}
</style>
