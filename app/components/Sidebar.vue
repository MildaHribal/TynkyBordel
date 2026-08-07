<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  categoryTree: any[],
  currentSlug: string | null
}>()

// Helper to check if a category or its children contains the current slug
const isActiveBranch = (cat: any): boolean => {
  if (cat.slug === props.currentSlug) return true
  if (cat.children && cat.children.length > 0) {
    return cat.children.some((child: any) => isActiveBranch(child))
  }
  return false
}
</script>

<template>
  <aside class="w-64 flex-shrink-0 pr-6 pl-4">
    <div class="glass-card p-5 sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto custom-scrollbar">
      <h3 class="font-bold text-lg mb-5 text-white neon-text flex items-center gap-2">
        <span>🌌</span>
        <span>Kolekce</span>
      </h3>
      <nav>
        <ul class="space-y-1.5">
          <li>
            <NuxtLink
              to="/category/vsechny"
              class="category-btn w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium block relative"
              :class="currentSlug === 'vsechny' || !currentSlug ? 'category-btn--active' : ''"
            >
              <span
                  v-if="currentSlug === 'vsechny' || !currentSlug"
                  class="category-btn__active-bg"
                  style="view-transition-name: category-pill-desktop"
                  aria-hidden="true"
              ></span>
              <span class="relative z-10 flex items-center">
                ✨ Všechny produkty
              </span>
            </NuxtLink>
          </li>
          
          <li v-for="cat in categoryTree" :key="cat.id" class="mt-2 text-sm font-medium">
            <div class="mb-1">
              <NuxtLink
                :to="`/category/${cat.slug}`"
                class="category-btn w-full flex items-center px-4 py-2.5 rounded-xl transition-all duration-300 group relative"
                :class="cat.slug === currentSlug
                  ? 'category-btn--active'
                  : isActiveBranch(cat) 
                    ? 'text-primary-300 bg-white/5 font-semibold' 
                    : ''"
              >
                <span
                    v-if="cat.slug === currentSlug"
                    class="category-btn__active-bg"
                    style="view-transition-name: category-pill-desktop"
                    aria-hidden="true"
                ></span>
                <div class="relative z-10 flex items-center w-full">
                  <Icon v-if="cat.children.length > 0" :name="isActiveBranch(cat) ? 'mdi:chevron-down' : 'mdi:chevron-right'" class="mr-2 opacity-50 transition-transform group-hover:text-primary-400" />
                  <span v-else class="mr-2 text-xs opacity-50">✨</span>
                  {{ cat.name }}
                </div>
              </NuxtLink>
            </div>
            
            <!-- Children (Level 2) -->
            <ul v-if="cat.children.length > 0 && isActiveBranch(cat)" class="ml-4 space-y-1 border-l border-white/10 pl-2">
              <li v-for="sub in cat.children" :key="sub.id">
                <NuxtLink
                  :to="`/category/${sub.slug}`"
                  class="category-btn w-full flex items-center px-3 py-2 rounded-lg transition-all duration-300 text-[13px] group relative"
                  :class="sub.slug === currentSlug
                    ? 'category-btn--active'
                    : isActiveBranch(sub)
                      ? 'text-primary-300 bg-white/5'
                      : ''"
                >
                  <span
                      v-if="sub.slug === currentSlug"
                      class="category-btn__active-bg"
                      style="view-transition-name: category-pill-desktop"
                      aria-hidden="true"
                  ></span>
                  <div class="relative z-10 flex items-center w-full">
                    <Icon v-if="sub.children.length > 0" :name="isActiveBranch(sub) ? 'mdi:chevron-down' : 'mdi:chevron-right'" class="mr-1.5 opacity-50 transition-transform group-hover:text-primary-400 w-3 h-3" />
                    {{ sub.name }}
                  </div>
                </NuxtLink>
                
                <!-- Children (Level 3) -->
                <ul v-if="sub.children.length > 0 && isActiveBranch(sub)" class="ml-4 space-y-1 border-l border-white/10 pl-2 mt-1">
                  <li v-for="third in sub.children" :key="third.id">
                    <NuxtLink
                      :to="`/category/${third.slug}`"
                      class="category-btn w-full block px-3 py-1.5 rounded-md transition-all duration-300 text-xs relative"
                      :class="third.slug === currentSlug
                        ? 'category-btn--active'
                        : ''"
                    >
                      <span
                          v-if="third.slug === currentSlug"
                          class="category-btn__active-bg"
                          style="view-transition-name: category-pill-desktop"
                          aria-hidden="true"
                      ></span>
                      <span class="relative z-10">
                        {{ third.name }}
                      </span>
                    </NuxtLink>
                  </li>
                </ul>
              </li>
            </ul>
          </li>
        </ul>
      </nav>
    </div>
  </aside>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
/* This whole component is mounted INSIDE .glass-card, which zine.css re-skins to
   `background: var(--pop-panel)` — a surface that is dark in BOTH themes
   (#201c19 light, #241934 dark). So every foreground here is the constant
   --pop-on-dark, never --pop-ink: ink flips to near-white on paper and there is
   no paper in this component.
   The rose accents on the active pill keep their own literals — they are the
   legacy "cosmic" magenta, a different hue from --pop-pink (which is a pastel
   for cream paper and would wash the pill out), and they sit on that same
   theme-invariant panel. */
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--pop-on-dark) 10%, transparent);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--pop-on-dark) 20%, transparent);
}

.category-btn {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    border: 1px solid transparent;
    color: color-mix(in srgb, var(--pop-on-dark) 62%, transparent);
    transition:
        color 0.3s var(--ease-snappy),
        border-color 0.3s var(--ease-snappy),
        transform 0.3s var(--ease-snappy);
}

.category-btn:hover {
    color: var(--pop-on-dark);
    border-color: color-mix(in srgb, var(--pop-on-dark) 16%, transparent);
    background: color-mix(in srgb, var(--pop-on-dark) 4%, transparent);
}

.category-btn--active {
    --pill-rose: #b3324c;
    color: var(--pop-on-dark);
    border-color: color-mix(in srgb, var(--pill-rose) 38%, transparent);
    box-shadow: 0 8px 28px color-mix(in srgb, var(--pill-rose) 14%, transparent);
}

.category-btn__active-bg {
    --pill-rose: #b3324c;
    --pill-magenta: #ec4899;
    position: absolute;
    inset: 2px;
    border-radius: 0.62rem;
    background: linear-gradient(120deg, color-mix(in srgb, var(--pill-rose) 30%, transparent), color-mix(in srgb, var(--pill-magenta) 32%, transparent));
    border: 1px solid color-mix(in srgb, var(--pill-rose) 32%, transparent);
    pointer-events: none;
    z-index: 0;
}

@media (prefers-reduced-motion: reduce) {
    .category-btn {
        transition: none !important;
    }
}
</style>
