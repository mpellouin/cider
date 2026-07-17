<script setup lang="ts">
import { ref } from "vue";
import Icon from "./Icon.vue";
import MediaTile from "./MediaTile.vue";

defineProps<{
  title: string;
  items: MusicKit.MediaItem[];
  round?: boolean;
  size?: "s" | "m" | "l";
}>();

const scroller = ref<HTMLElement | null>(null);

function nudge(direction: 1 | -1) {
  scroller.value?.scrollBy({ left: direction * 640, behavior: "smooth" });
}
</script>

<template>
  <section v-if="items.length" class="shelf fade-up">
    <div class="shelf-head">
      <h2 class="section-title">{{ title }}</h2>
      <div class="shelf-arrows">
        <button class="icon-btn" @click="nudge(-1)"><Icon name="chevron-left" /></button>
        <button class="icon-btn" @click="nudge(1)"><Icon name="chevron-right" /></button>
      </div>
    </div>
    <div ref="scroller" class="shelf-scroll">
      <MediaTile v-for="item in items" :key="item.id" :item="item" :round="round" :size="size" />
    </div>
  </section>
</template>

<style scoped>
.shelf {
  margin-bottom: 34px;
}
.shelf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.shelf-head .section-title {
  margin-bottom: 12px;
}
.shelf-arrows {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}
.shelf:hover .shelf-arrows {
  opacity: 1;
}
.shelf-scroll {
  display: flex;
  gap: 18px;
  overflow-x: auto;
  padding: 4px 2px 14px;
  scrollbar-width: none;
}
.shelf-scroll::-webkit-scrollbar {
  display: none;
}
</style>
