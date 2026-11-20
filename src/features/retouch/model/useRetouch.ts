import { computed, ref, type Ref } from "vue";
import { useStudio } from "../../../shared/useStudio";
import type { StudioContext } from "../../../shared/context";
import type {
  MigrationStrategy,
  RetouchConflict,
  RetouchEdit,
} from "../../../shared/document";
import { glyphs } from "../../mapping/lib/charsets";
import {
  blockedEditIds,
  composeGrid,
  conflictCells,
  planRetargets,
  recomputeConflicts,
  retouchedCells,
  type RetargetPlan,
} from "../lib/projection";

function cloneEdits(edits: RetouchEdit[]): RetouchEdit[] {
  return edits.map((e) => ({ ...e, anchor: { ...e.anchor } }));
}

function createRetouchController(studio: StudioContext) {
  const { doc } = studio;
  /** 当前框选的单元索引（相对于当前网格） */
  const selection: Ref<number[]> = ref([]);
  /** 修版模式：开启后可在画布上框选 */
  const retouchMode = ref(false);
  let seq = 0;

  const charset = computed(() =>
    glyphs(doc.settings.charset, doc.settings.custom),
  );

  const plans = computed<RetargetPlan[]>(() => {
    if (!doc.grid) return [];
    return planRetargets(doc.retouch.edits, {
      grid: doc.grid,
      crop: doc.crop,
      strategy: doc.retouch.strategy,
      charset: charset.value,
    });
  });

  const conflicts = computed<RetouchConflict[]>(() =>
    recomputeConflicts(doc.retouch.edits, plans.value, charset.value),
  );

  /** 自动层 + 修版层合成的唯一布局，预览/复制/下载全部取自这里 */
  const composedGrid = computed(() => {
    if (!doc.grid) return null;
    return composeGrid(
      doc.grid,
      doc.retouch.edits,
      plans.value,
      conflicts.value,
    );
  });

  const hasConflicts = computed(() => conflicts.value.length > 0);
  const blocked = computed(() => blockedEditIds(conflicts.value));
  const highlightedCells = computed(() =>
    retouchedCells(plans.value, conflicts.value),
  );
  const conflictCellSet = computed(() => conflictCells(conflicts.value));
  const canUndo = computed(() => doc.retouch.past.length > 0);
  const canRedo = computed(() => doc.retouch.future.length > 0);
  const editCount = computed(() => doc.retouch.edits.length);
  const editMap = computed(() => new Map(doc.retouch.edits.map((e) => [e.id, e])));

  /** 一次修版操作 = 一次完整快照入栈，撤销恢复的是当时的完整修版意图 */
  function commit(next: RetouchEdit[]) {
    doc.retouch.past.push(cloneEdits(doc.retouch.edits));
    if (doc.retouch.past.length > 100) doc.retouch.past.shift();
    doc.retouch.future = [];
    doc.retouch.edits = next;
  }

  function undo() {
    const prev = doc.retouch.past.pop();
    if (!prev) return;
    doc.retouch.future.push(cloneEdits(doc.retouch.edits));
    doc.retouch.edits = prev;
    selection.value = [];
  }

  function redo() {
    const next = doc.retouch.future.pop();
    if (!next) return;
    doc.retouch.past.push(cloneEdits(doc.retouch.edits));
    doc.retouch.edits = next;
    selection.value = [];
  }

  function nextId(): string {
    seq += 1;
    return "e" + String(seq).padStart(6, "0");
  }

  function planOfCell(cell: number): RetargetPlan | undefined {
    return plans.value.find((p) => p.cell === cell);
  }

  /**
   * 对框选单元批量替换字符与颜色；整批只产生一次历史记录。
   * 已被手改覆盖的单元更新原手改，其余单元新建带双重锚点的手改。
   */
  function applyToSelection(glyph: string, color: string) {
    if (!doc.grid || selection.value.length === 0) return;
    const chars = Array.from(glyph);
    const ch = chars[0] ?? "";
    if (!ch) {
      studio.notice.value = "请输入要替换的字符";
      return;
    }
    const { columns, rows } = doc.grid;
    const affected = selection.value.length;
    const next = cloneEdits(doc.retouch.edits);
    for (const cell of selection.value) {
      const existingId = planOfCell(cell)?.editId;
      const existing = existingId
        ? next.find((e) => e.id === existingId)
        : undefined;
      if (existing) {
        existing.glyph = ch;
        existing.color = color;
        continue;
      }
      const gx = cell % columns;
      const gy = Math.floor(cell / columns);
      next.push({
        id: nextId(),
        anchor: {
          gx,
          gy,
          ix: doc.crop.x + ((gx + 0.5) / columns) * doc.crop.width,
          iy: doc.crop.y + ((gy + 0.5) / rows) * doc.crop.height,
        },
        glyph: ch,
        color,
      });
    }
    commit(next);
    selection.value = [];
    studio.notice.value = `已修版 ${affected} 个单元`;
  }

  function setSelection(cells: number[], additive: boolean) {
    selection.value = additive
      ? Array.from(new Set([...selection.value, ...cells]))
      : [...cells];
  }
  function clearSelection() {
    selection.value = [];
  }
  /** 重新生成后旧索引失效，清空框选（手改本身由投影/布局策略保留） */
  function onGridReplaced() {
    selection.value = [];
  }

  function toggleMode(): void {
    retouchMode.value = !retouchMode.value;
    if (!retouchMode.value) selection.value = [];
  }

  function setStrategy(strategy: MigrationStrategy) {
    if (doc.retouch.strategy === strategy) return;
    doc.retouch.strategy = strategy;
    selection.value = [];
  }

  /** 丢弃指定手改（可撤销） */
  function discardEdits(ids: string[]) {
    const remove = new Set(ids);
    if (!remove.size) return;
    commit(doc.retouch.edits.filter((e) => !remove.has(e.id)));
  }

  /** 碰撞冲突：保留最早创建者，移除其余手改 */
  function keepWinner(conflict: RetouchConflict) {
    const [winner, ...losers] = conflict.editIds;
    if (!winner || losers.length === 0) return;
    discardEdits(losers);
  }

  /** 字符集冲突：用当前字符集中的字符替换（可撤销） */
  function replaceGlyph(id: string, glyph: string) {
    const ch = Array.from(glyph)[0] ?? "";
    if (!ch) return;
    commit(
      doc.retouch.edits.map((e) =>
        e.id === id ? { ...e, glyph: ch } : e,
      ),
    );
  }

  /** 清空全部手改，保留一次撤销机会 */
  function clearEdits() {
    if (doc.retouch.edits.length === 0) return;
    commit([]);
    selection.value = [];
  }

  /** 载入新图片：旧锚点全部失效，连历史一起重置 */
  function resetForNewImage() {
    doc.retouch = {
      edits: [],
      strategy: "reproject",
      past: [],
      future: [],
    };
    selection.value = [];
    seq = 0;
  }

  return {
    doc,
    selection,
    retouchMode,
    charset,
    plans,
    conflicts,
    composedGrid,
    hasConflicts,
    blocked,
    highlightedCells,
    conflictCellSet,
    canUndo,
    canRedo,
    editCount,
    editMap,
    undo,
    redo,
    applyToSelection,
    setSelection,
    clearSelection,
    onGridReplaced,
    toggleMode,
    setStrategy,
    discardEdits,
    keepWinner,
    replaceGlyph,
    clearEdits,
    resetForNewImage,
  };
}

let instance: ReturnType<typeof createRetouchController> | null = null;

export function useRetouch() {
  if (!instance) instance = createRetouchController(useStudio());
  return instance;
}

export type RetouchController = ReturnType<typeof createRetouchController>;
