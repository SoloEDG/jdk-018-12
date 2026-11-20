<script setup lang="ts">
import { computed, ref } from "vue";
import {
  PenLine,
  Undo2,
  Redo2,
  Trash2,
  TriangleAlert,
  MapPin,
  Layers,
  Ban,
} from "lucide-vue-next";
import { useRetouch } from "../model/useRetouch";
import type { RetouchConflict } from "../../../shared/document";

const r = useRetouch();
const glyphDraft = ref("");
const colorDraft = ref("#f1f3ec");

const outOfCrop = computed(() =>
  r.conflicts.value.filter((c) => c.kind === "out-of-crop"),
);
const collisions = computed(() =>
  r.conflicts.value.filter((c) => c.kind === "collision"),
);
const charsetConflicts = computed(() =>
  r.conflicts.value.filter((c) => c.kind === "charset"),
);

const kindLabel: Record<RetouchConflict["kind"], string> = {
  "out-of-crop": "裁剪移出",
  collision: "同单元冲突",
  charset: "字符集移除",
};

function glyphOf(id: string): string {
  return r.editMap.value.get(id)?.glyph ?? "?";
}
function applyDraft() {
  r.applyToSelection(glyphDraft.value, colorDraft.value);
}
</script>

<template>
  <section class="panel retouch-panel">
    <div class="section-title">
      <span>04 / RETOUCH LAYER</span><PenLine :size="15" />
    </div>

    <div class="retouch-head">
      <button
        class="retouch-mode-btn"
        :class="{ active: r.retouchMode.value }"
        @click="r.toggleMode"
      >
        <PenLine :size="13" />
        {{ r.retouchMode.value ? "退出框选" : "进入修版框选" }}
      </button>
      <div class="history-buttons">
        <button
          class="icon-button"
          aria-label="撤销修版"
          :disabled="!r.canUndo.value"
          @click="r.undo"
        >
          <Undo2 :size="14" />
        </button>
        <button
          class="icon-button"
          aria-label="重做修版"
          :disabled="!r.canRedo.value"
          @click="r.redo"
        >
          <Redo2 :size="14" />
        </button>
        <button
          class="icon-button danger"
          aria-label="清空全部手改"
          :disabled="r.editCount.value === 0"
          @click="r.clearEdits"
        >
          <Trash2 :size="14" />
        </button>
      </div>
    </div>
    <small class="mono muted retouch-count"
      >{{ r.editCount.value }} 处手改 · 撤销恢复完整修版意图</small
    >

    <div v-if="r.selection.value.length" class="retouch-form">
      <div class="form-row">
        <input
          v-model="glyphDraft"
          class="glyph-input"
          aria-label="替换字符"
          maxlength="4"
          placeholder="输入字符"
          @keydown.enter="applyDraft"
        />
        <input
          v-model="colorDraft"
          type="color"
          class="color-input"
          aria-label="替换颜色"
        />
      </div>
      <div class="glyph-palette" aria-label="字符集快选">
        <button
          v-for="(g, i) in r.charset.value"
          :key="i"
          class="palette-glyph"
          :title="g === ' ' ? '空格' : g"
          @click="glyphDraft = g"
        >
          {{ g === " " ? "␠" : g }}
        </button>
      </div>
      <button class="mini-primary wide" @click="applyDraft">
        替换 {{ r.selection.value.length }} 个所选单元
      </button>
    </div>
    <p v-else class="retouch-hint">
      开启修版模式后在右侧画布拖动框选，即可批量替换字符与颜色；每次替换只产生
      一次可撤销记录。
    </p>

    <div class="strategy-block">
      <div class="strategy-title">
        <Layers :size="12" /> 重新生成时如何保留手改
      </div>
      <label
        class="strategy-option"
        :class="{ active: r.doc.retouch.strategy === 'reproject' }"
      >
        <input
          type="radio"
          name="migration"
          value="reproject"
          :checked="r.doc.retouch.strategy === 'reproject'"
          @change="r.setStrategy('reproject')"
        />
        <span><b>按原图位置重投影</b><small>跟随新裁剪与新密度重新落点</small></span>
      </label>
      <label
        class="strategy-option"
        :class="{ active: r.doc.retouch.strategy === 'layout' }"
      >
        <input
          type="radio"
          name="migration"
          value="layout"
          :checked="r.doc.retouch.strategy === 'layout'"
          @change="r.setStrategy('layout')"
        />
        <span><b>保留旧版布局</b><small>沿用旧网格行列，不生硬套用新坐标</small></span>
      </label>
    </div>

    <div v-if="r.hasConflicts.value" class="conflict-block">
      <div class="conflict-head">
        <TriangleAlert :size="13" /> 待处理冲突（{{ r.conflicts.value.length }}）
      </div>

      <div v-for="(conflict, i) in outOfCrop" :key="'oc' + i" class="conflict-item">
        <div class="conflict-meta">
          <span class="tag tag-red">{{ kindLabel[conflict.kind] }}</span>
          <span class="conflict-glyph">「{{ glyphOf(conflict.editIds[0]!) }}」</span>
        </div>
        <p>{{ conflict.detail }}</p>
        <div class="conflict-actions">
          <button
            v-if="r.doc.retouch.strategy === 'layout'"
            class="mini-ghost"
            @click="r.setStrategy('reproject')"
          >
            <MapPin :size="12" /> 改走重投影
          </button>
          <button
            class="mini-danger"
            @click="r.discardEdits(conflict.editIds)"
          >
            丢弃该手改
          </button>
        </div>
      </div>

      <div v-for="(conflict, i) in collisions" :key="'co' + i" class="conflict-item">
        <div class="conflict-meta">
          <span class="tag tag-amber">{{ kindLabel[conflict.kind] }}</span>
          <span class="conflict-glyph">
            {{ conflict.editIds.map(glyphOf).join(" / ") }}
          </span>
        </div>
        <p>{{ conflict.detail }}</p>
        <div class="conflict-actions">
          <button class="mini-primary" @click="r.keepWinner(conflict)">
            保留最早一条
          </button>
          <button
            class="mini-danger"
            @click="r.discardEdits(conflict.editIds.slice(1))"
          >
            移除其余 {{ conflict.editIds.length - 1 }} 条
          </button>
        </div>
      </div>

      <div v-for="(conflict, i) in charsetConflicts" :key="'cs' + i" class="conflict-item">
        <div class="conflict-meta">
          <span class="tag tag-purple">{{ kindLabel[conflict.kind] }}</span>
          <span class="conflict-glyph">「{{ glyphOf(conflict.editIds[0]!) }}」</span>
        </div>
        <p>{{ conflict.detail }}</p>
        <div class="conflict-actions charset-fix">
          <select
            class="charset-select"
            aria-label="选择替换字符"
            @change="
              r.replaceGlyph(conflict.editIds[0]!, ($event.target as HTMLSelectElement).value)
            "
          >
            <option value="">替换为…</option>
            <option v-for="(g, gi) in r.charset.value" :key="gi" :value="g">
              {{ g === " " ? "空格" : g }}
            </option>
          </select>
          <button
            class="mini-danger"
            @click="r.discardEdits(conflict.editIds)"
          >
            <Ban :size="12" /> 丢弃
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
