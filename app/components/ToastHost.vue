<script setup lang="ts">
const { toasts, remove } = useCosmicToast()

// Opaque backgrounds + white text so toasts are readable on ANY page background
// (the light checkout/pastel pages made the old translucent variants invisible).
const variantClasses = (variant: string) => {
  switch (variant) {
    case 'success':
      return 'border-green-400/40 bg-green-600 text-white'
    case 'error':
      return 'border-red-400/40 bg-red-600 text-white'
    default:
      return 'border-white/15 bg-[#221d19] text-white'
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-host">
      <TransitionGroup name="toast" tag="div" class="toast-stack">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="toast-item"
          :class="variantClasses(t.variant)"
          role="status"
          aria-live="polite"
        >
          <div class="toast-content">
            <div class="toast-title">{{ t.title }}</div>
            <div v-if="t.description" class="toast-desc">{{ t.description }}</div>
          </div>
          <button class="toast-close" type="button" @click="remove(t.id)" aria-label="Zavřít">
            ✕
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9999;
  pointer-events: none;
}

.toast-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(420px, calc(100vw - 32px));
}

.toast-item {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(14px);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
}

.toast-title {
  font-weight: 800;
  font-size: 14px;
  line-height: 1.2;
}

.toast-desc {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.35;
  opacity: 0.85;
}

.toast-close {
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  opacity: 0.7;
  padding: 2px 6px;
  border-radius: 10px;
  cursor: pointer;
}
.toast-close:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.08);
}

.toast-enter-active,
.toast-leave-active {
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
</style>

