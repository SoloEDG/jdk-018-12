<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import type { Grid } from "../../../shared/document";
import { drawGrid, type GridOverlays } from "../lib/draw";
const props = defineProps<{
  grid: Grid;
  color: boolean;
  background: string;
  zoom: number;
  retouchMode: boolean;
  overlays?: GridOverlays;
}>();
const emit = defineEmits<{
  (e: "select", cells: number[], additive: boolean): void;
}>();
const canvas = ref<HTMLCanvasElement>();
const cellW = 8;
const cellH = 16;
function draw() {
  if (canvas.value)
    drawGrid(
      canvas.value,
      props.grid,
      props.color,
      props.background,
      props.overlays ?? {},
    );
}
onMounted(draw);
watch(
  () => [props.grid, props.color, props.background, props.overlays],
  draw,
);

interface DragState {
  startCol: number;
  startRow: number;
  additive: boolean;
  pointerId: number;
}
const drag = ref<DragState | null>(null);

function cellFromEvent(e: PointerEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const col = Math.floor(
    ((e.clientX - rect.left) / rect.width) * props.grid.columns,
  );
  const row = Math.floor(
    ((e.clientY - rect.top) / rect.height) * props.grid.rows,
  );
  return {
    col: Math.max(0, Math.min(props.grid.columns - 1, col)),
    row: Math.max(0, Math.min(props.grid.rows - 1, row)),
  };
}

function cellsInRect(
  c0: number,
  r0: number,
  c1: number,
  r1: number,
): number[] {
  const x0 = Math.min(c0, c1);
  const x1 = Math.max(c0, c1);
  const y0 = Math.min(r0, r1);
  const y1 = Math.max(r0, r1);
  const out: number[] = [];
  for (let r = y0; r <= y1; r++)
    for (let c = x0; c <= x1; c++) out.push(r * props.grid.columns + c);
  return out;
}

function down(e: PointerEvent) {
  if (!props.retouchMode) return;
  const { col, row } = cellFromEvent(e);
  drag.value = {
    startCol: col,
    startRow: row,
    additive: e.shiftKey,
    pointerId: e.pointerId,
  };
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function up(e: PointerEvent) {
  const state = drag.value;
  if (!state || state.pointerId !== e.pointerId) return;
  const { col, row } = cellFromEvent(e);
  emit("select", cellsInRect(state.startCol, state.startRow, col, row), state.additive);
  drag.value = null;
}
</script>
<template>
  <canvas
    ref="canvas"
    aria-label="字符画预览"
    :class="{ 'retouch-canvas': retouchMode }"
    :style="{
      width: (grid.columns * cellW * zoom) / 100 + 'px',
      height: (grid.rows * cellH * zoom) / 100 + 'px',
    }"
    @pointerdown="down"
    @pointerup="up"
    @pointercancel="drag = null"
  />
</template>
