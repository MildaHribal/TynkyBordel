<script setup lang="ts">
const { toasts, remove } = useCosmicToast()

// Opaque backgrounds + light text so toasts are readable on ANY page background
// (the light checkout/pastel pages made the old translucent variants invisible).
// The colours moved out of Tailwind utilities and into the scoped stylesheet
// below so the neutral toast can follow the palette tokens; the two status
// toasts stay deliberately constant — see the comment there.
const variantClasses = (variant: string) => {
  switch (variant) {
    case 'success':
      return 'toast-item--success'
    case 'error':
      return 'toast-item--error'
    default:
      return 'toast-item--info'
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
  /* Every toast fill is dark in BOTH themes, so the hairline is a constant
     light alpha rather than --pop-line (which is dark ink in light mode and
     would disappear against the fill it is supposed to outline). */
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(14px);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.45);
}

/* ── Variants ───────────────────────────────────────────────────────────────
   The neutral toast is the app's dark panel, so it takes --pop-panel /
   --pop-on-dark and drifts with the theme.

   The two status toasts do NOT: green and red carry meaning, and a status
   colour that changed between themes would be a different signal. They stay
   constant — and they are the one place where the light theme moves. The old
   fills were Tailwind green-600 / red-600, which measure 3.30:1 and 3.82:1
   against the white body text (AA wants 4.5:1) in BOTH themes. Stepping to
   green-800 / red-700 keeps the same hue and clears it at 5.66:1 and 5.01:1.
   White, not --pop-on-dark: the cream is only 4.08:1 on green-800. */
.toast-item--info {
  background: var(--pop-panel, #201c19);
  color: var(--pop-on-dark, #F0E7D2);
  border-color: rgba(255, 255, 255, 0.15);
}
.toast-item--success {
  background: #166534;
  color: #ffffff;
  border-color: rgba(74, 222, 128, 0.4);   /* green-400/40, unchanged */
}
.toast-item--error {
  background: #b91c1c;
  color: #ffffff;
  border-color: rgba(248, 113, 113, 0.4);  /* red-400/40, unchanged */
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

