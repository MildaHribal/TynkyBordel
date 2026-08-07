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
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

.category-btn {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    border: 1px solid transparent;
    color: rgba(255, 255, 255, 0.62);
    transition:
        color 0.3s var(--ease-snappy),
        border-color 0.3s var(--ease-snappy),
        transform 0.3s var(--ease-snappy);
}

.category-btn:hover {
    color: white;
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.04);
}

.category-btn--active {
    color: white;
    border-color: rgba(179, 50, 76, 0.38);
    box-shadow: 0 8px 28px rgba(179, 50, 76, 0.14);
}

.category-btn__active-bg {
    position: absolute;
    inset: 2px;
    border-radius: 0.62rem;
    background: linear-gradient(120deg, rgba(179, 50, 76, 0.3), rgba(236, 72, 153, 0.32));
    border: 1px solid rgba(179, 50, 76, 0.32);
    pointer-events: none;
    z-index: 0;
}

@media (prefers-reduced-motion: reduce) {
    .category-btn {
        transition: none !important;
    }
}
</style>
