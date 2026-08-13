<script setup lang="ts">
import { ref } from 'vue';
import ProductCard from "~/components/products/ProductCard.vue";

const props = defineProps<{
  products: Array<any>;
}>();

const carouselRef = ref<HTMLElement | null>(null);

let startX = 0;
let startY = 0;
let startScrollLeft = 0;
let isDragging = false;
let isHorizontalDrag = false;

const onTouchStart = (e: TouchEvent) => {
  if (!carouselRef.value || !e.touches[0]) return;
  startX = e.touches[0].clientX;
  startY = e.touches[0].clientY;
  startScrollLeft = carouselRef.value.scrollLeft;
  isDragging = true;
  isHorizontalDrag = false;
};

const onTouchMove = (e: TouchEvent) => {
  if (!isDragging || !carouselRef.value || !e.touches[0]) return;
  const currentX = e.touches[0].clientX;
  const currentY = e.touches[0].clientY;

  const diffX = startX - currentX;
  const diffY = startY - currentY;

  if (!isHorizontalDrag) {
    if (Math.abs(diffX) > Math.abs(diffY) + 5) {
      isHorizontalDrag = true;
    } else if (Math.abs(diffY) > Math.abs(diffX) + 5) {
      isDragging = false;
      return;
    } else {
      return;
    }
  }

  if (isHorizontalDrag) {
    if (e.cancelable) {
      e.preventDefault();
    }
    carouselRef.value.scrollLeft = startScrollLeft + diffX;
  }
};

const onTouchEnd = () => {
  isDragging = false;
  isHorizontalDrag = false;
};

const scroll = (direction: 'next' | 'prev') => {
  if (!carouselRef.value) return;

  const scrollAmount = carouselRef.value.offsetWidth;
  const maxScrollLeft = carouselRef.value.scrollWidth - carouselRef.value.offsetWidth;

  if (direction === 'next') {
    if (carouselRef.value.scrollLeft + scrollAmount >= maxScrollLeft - 10) {
      carouselRef.value.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      carouselRef.value.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  } else {
    if (carouselRef.value.scrollLeft - scrollAmount <= 10) {
      carouselRef.value.scrollTo({ left: maxScrollLeft, behavior: 'smooth' });
    } else {
      carouselRef.value.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    }
  }
};

defineExpose({
  next: () => scroll('next'),
  prev: () => scroll('prev'),
});
</script>

<template>
  <div class="relative">
    <div
      ref="carouselRef"
      class="flex overflow-hidden hide-scrollbar"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    >
      <div

        v-for="(product, index) in products"
        :key="product.id || product.name"
        class="flex-shrink-0 w-1/2 sm:w-1/2 md:w-1/3 lg:w-1/3 xl:w-1/4 2xl:w-1/5 p-1.5 md:p-2"
        v-fly="{
          direction: index % 2 === 0 ? 'up' : 'zoom',
          distance: 20,
          duration: 560,
          delay: Math.min(index * 34, 220),
          threshold: 0.12,
        }"
      >
        <!-- Never priority: this carousel is the "podobné kousky" rail at the
             very bottom of the product page, far below the fold. Marking the
             first two as priority made them load eagerly at high fetch priority
             and compete with the product's own hero photo — i.e. it slowed down
             the LCP of the page they sit on. -->
        <ProductCard :product="product" class="h-full" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>