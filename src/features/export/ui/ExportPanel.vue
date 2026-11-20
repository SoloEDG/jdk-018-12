<script setup lang="ts">
import { Download, Copy, ArrowUpRight, TriangleAlert } from "lucide-vue-next";
import { useExport } from "../model/useExport";
const e = useExport();
</script>
<template>
  <section class="export-bar" :class="{ locked: e.retouch.hasConflicts.value }">
    <div>
      <span class="eyebrow">READY TO SHARE</span>
      <h3>带走你的字符作品</h3>
      <small
        >文本保留完整字符布局，PNG 保留当前配色，均为自动层 + 修版层的同一份合成布局。</small
      >
      <small v-if="e.retouch.hasConflicts.value" class="lock-note">
        <TriangleAlert :size="12" />
        {{ e.retouch.conflicts.value.length }} 项冲突未解决，导出已锁定
      </small>
    </div>
    <div class="export-actions">
      <button
        class="secondary"
        :disabled="!e.ready()"
        :title="e.retouch.hasConflicts.value ? '请先解决修版冲突' : ''"
        @click="e.copy"
      >
        <Copy :size="15" /> 复制字符</button
      ><button
        class="secondary"
        :disabled="!e.ready()"
        :title="e.retouch.hasConflicts.value ? '请先解决修版冲突' : ''"
        @click="e.png"
      >
        PNG <ArrowUpRight :size="15" /></button
      ><button
        class="primary"
        :disabled="!e.ready()"
        :title="e.retouch.hasConflicts.value ? '请先解决修版冲突' : ''"
        @click="e.saveText"
      >
        <Download :size="16" /> 导出 .TXT
      </button>
    </div>
  </section>
</template>
