<script setup lang="ts">
import { computed, ref } from "vue";
import { Code2, Scan, Minus, Plus, PenLine, TriangleAlert } from "lucide-vue-next";
import { usePreview } from "../model/usePreview";
import { gridRows } from "../lib/rows";
import ArtCanvas from "./ArtCanvas.vue";
import { useRetouch } from "../../retouch/model/useRetouch";
const p = usePreview();
const r = useRetouch();
const grid = computed(() => r.composedGrid.value);
const text = computed(() =>
  grid.value ? gridRows(grid.value).join("\n") : "",
);
const overlays = computed(() => ({
  selection: new Set(r.selection.value),
  retouched: r.highlightedCells.value,
  conflicts: r.conflictCellSet.value,
}));
const draftGlyph = ref("");
const draftColor = ref("#f1f3ec");
function onSelect(cells: number[], additive: boolean) {
  r.setSelection(cells, additive);
  if (cells.length === 1) {
    const cell = cells[0]!;
    draftGlyph.value = grid.value?.cells[cell]?.glyph ?? "";
    draftColor.value = grid.value?.cells[cell]?.color ?? draftColor.value;
  }
}
</script>
<template>
  <main class="workspace">
    <div class="preview-toolbar">
      <div class="tabs">
        <button
          :class="{ active: p.mode.value === 'art' }"
          @click="p.mode.value = 'art'"
        >
          <Scan :size="14" /> 字符预览</button
        ><button
          :class="{ active: p.mode.value === 'text' }"
          @click="p.mode.value = 'text'"
        >
          <Code2 :size="14" /> 纯文本
        </button>
      </div>
      <div class="toolbar-right">
        <button
          class="retouch-toggle"
          :class="{ active: r.retouchMode.value }"
          :disabled="!grid"
          @click="r.toggleMode"
        >
          <PenLine :size="13" /> 修版模式
        </button>
        <label class="color-toggle"
          ><span class="color-dot" /> 彩色<input
            aria-label="彩色预览"
            type="checkbox"
            v-model="p.doc.settings.color"
        /></label>
      </div>
    </div>
    <div v-if="r.hasConflicts.value" class="conflict-banner">
      <TriangleAlert :size="14" />
      <span
        >有 {{ r.conflicts.value.length }} 项手改冲突未解决，导出已锁定，请在
        04 / 修版层 中处理</span
      >
    </div>
    <div class="art-stage">
      <div class="stage-label">OUTPUT / LIVE RENDER <span>●</span></div>
      <div class="art-scroll" :class="{ selecting: r.retouchMode.value }">
        <ArtCanvas
          v-if="grid && p.mode.value === 'art'"
          :grid="grid"
          :color="p.doc.settings.color"
          :background="p.doc.settings.background"
          :zoom="p.zoom.value"
          :retouch-mode="r.retouchMode.value"
          :overlays="overlays"
          @select="onSelect"
        />
        <pre
          v-else-if="grid"
          data-testid="text-preview"
          :style="{
            fontSize: (14 * p.zoom.value) / 100 + 'px',
            lineHeight: (16 * p.zoom.value) / 100 + 'px',
          }"
          >{{ text }}</pre
        >
        <span v-else>正在准备字符画…</span>
      </div>
      <div class="stage-corner">
        {{ grid?.columns }} COL × {{ grid?.rows }} ROW
      </div>
    </div>
    <div class="retouch-inline" v-if="r.retouchMode.value && grid">
      <template v-if="r.selection.value.length">
        <span class="sel-count"
          >已选 {{ r.selection.value.length }} 格 · Shift 拖动可追加</span
        >
        <input
          v-model="draftGlyph"
          class="glyph-input"
          aria-label="替换字符"
          maxlength="4"
          placeholder="字符"
          @keydown.enter="r.applyToSelection(draftGlyph, draftColor)"
        />
        <input
          v-model="draftColor"
          type="color"
          class="color-input"
          aria-label="替换颜色"
        />
        <button
          class="mini-primary"
          @click="r.applyToSelection(draftGlyph, draftColor)"
        >
          替换所选
        </button>
        <button class="mini-ghost" @click="r.clearSelection()">取消选择</button>
      </template>
      <span v-else class="sel-hint"
        >在画布上拖动框选要替换的单元，单击可选单格</span
      >
    </div>
    <div class="preview-bottom">
      <span class="mono"
        ><i class="status-dot" />{{
          p.busy.value
            ? "生成中"
            : p.doc.grid?.revision === p.doc.revision
              ? "已同步"
              : "待重新生成"
        }}
        <span class="muted">/ {{ p.count.value }} 个字符</span>
        <span class="muted" v-if="r.editCount.value"
          >/ {{ r.editCount.value }} 处手改</span
        ></span
      >
      <div class="zoom">
        <button
          aria-label="缩小"
          @click="p.zoom.value = Math.max(25, p.zoom.value - 25)"
        >
          <Minus :size="14" /></button
        ><span>{{ p.zoom.value }}%</span
        ><button
          aria-label="放大"
          @click="p.zoom.value = Math.min(200, p.zoom.value + 25)"
        >
          <Plus :size="14" />
        </button>
      </div>
    </div>
    <div class="workspace-note">
      <span>从像素，到字符。</span
      ><small>每一个符号，都是光影的另一种表达。</small
      ><span class="note-symbol">{ Aa }</span>
    </div>
  </main>
</template>
