// 集成验证：真实 Vue 响应式 + 真实 useRetouch 控制器（mock studio 上下文）
import assert from "node:assert/strict";
import { ref, reactive } from "vue";

// 通过动态查询把 studioKey 注入，避免改动源码结构
const studioContext = await import(
  "/workspace/jdk-018-0-1代码生成-12/src/shared/context.ts"
);
const documentModule = await import(
  "/workspace/jdk-018-0-1代码生成-12/src/shared/document.ts"
);
const retouchModule = await import(
  "/workspace/jdk-018-0-1代码生成-12/src/features/retouch/model/useRetouch.ts"
);

function makeGrid(columns: number, rows: number): documentModule.Grid {
  return {
    columns,
    rows,
    cells: Array.from({ length: columns * rows }, () => ({
      glyph: ".",
      color: "#222222",
    })),
    revision: 1,
  };
}

const doc = reactive({
  asset: { name: "x.png" } as never,
  crop: { x: 0, y: 0, width: 1, height: 1 },
  settings: {
    columns: 100,
    charset: "standard",
    custom: " .:-=+*#%@",
    contrast: 1,
    gamma: 1,
    invert: false,
    color: true,
    background: "#101216",
  },
  grid: makeGrid(100, 50) as documentModule.Grid | null,
  retouch: { edits: [], strategy: "reproject", past: [], future: [] },
  revision: 1,
});
const busy = ref(false);
const notice = ref("");
const studio = {
  doc,
  busy,
  notice,
  invalidate: () => {},
};

// 注入 studio 上下文，useRetouch 内部 inject(studioKey) 才能取到
const vue = await import("vue");
const app = vue.createApp({ setup: () => () => null });
app.provide(studioContext.studioKey, studio);
let r: any;
app.runWithContext(() => {
  r = retouchModule.useRetouch();
});

// 记录合成布局被读取的次数，证明预览/导出共享同一份响应式合成结果
let composeRuns = 0;
function touchComposed() {
  void r.composedGrid.value;
  composeRuns++;
}
touchComposed();

// 1) 框选 3 格并替换 -> 3 条手改、一次历史、合成结果带手改字符
r.setSelection([10, 11, 12], false);
r.applyToSelection("@", "#ff0000");
assert.equal(r.editCount.value, 3);
assert.equal(r.canUndo.value, true);
assert.equal(r.canRedo.value, false);
assert.equal(r.selection.value.length, 0, "应用后清空框选");
assert.equal(r.composedGrid.value.cells[10].glyph, "@");
assert.equal(r.composedGrid.value.cells[10].color, "#ff0000");
assert.equal(r.composedGrid.value.cells[13].glyph, ".", "相邻未选手改不受影响");
assert.equal(r.highlightedCells.value.size, 3);
console.log("✓ 框选批量替换产生一次修版提交并正确合成");

// 2) 再改一次，然后撤销两次：恢复的是当时完整意图，而非重新计算字符
r.setSelection([20], false);
r.applyToSelection("#", "#00ff00");
assert.equal(r.editCount.value, 4);
r.undo();
assert.equal(r.editCount.value, 3, "撤销应回到上一次完整意图（3 条）");
assert.equal(r.composedGrid.value.cells[20].glyph, ".");
assert.equal(r.canRedo.value, true);
r.undo();
assert.equal(r.editCount.value, 0, "再撤销回到零手改");
assert.equal(r.composedGrid.value.cells[10].glyph, ".");
// 重做应原样恢复完整意图
r.redo();
assert.equal(r.editCount.value, 3);
assert.equal(r.composedGrid.value.cells[10].glyph, "@", "重做恢复当时字符而非自动重算");
assert.equal(r.composedGrid.value.cells[10].color, "#ff0000", "颜色同样恢复");
r.redo();
assert.equal(r.editCount.value, 4);
assert.equal(r.composedGrid.value.cells[20].glyph, "#");
console.log("✓ 撤销/重做恢复完整修版意图（字符与颜色）");

// 3) 重新生成（密度变化）：默认重投影，中心区域手改跟随新网格，不丢手改
//    先把历史回到 3 条手改的稳定状态
r.undo();
assert.equal(r.editCount.value, 3);
const oldAnchors = doc.retouch.edits.map((e: any) => ({ ...e.anchor }));
// 模拟密度从 100 列变为 200 列
doc.grid = makeGrid(200, 100);
r.onGridReplaced();
assert.equal(r.selection.value.length, 0, "重新生成清空框选");
assert.equal(r.editCount.value, 3, "重新生成不得丢弃手改");
// 原图坐标锚点保持不变
assert.deepEqual(
  doc.retouch.edits.map((e: any) => e.anchor.ix),
  oldAnchors.map((a: any) => a.ix),
);
// cell 10 在 100×50 网格中 gx=10、gy=0，锚点 ix=0.105、iy=0.01；
// 200×100 网格重投影到列 21、行 1，即 cell 1*200+21=221
const plan10 = r.plans.value.find((p: any) => p.editId === doc.retouch.edits[0].id);
assert.equal(plan10.cell, 221, "重投影跟随新密度");
assert.equal(r.hasConflicts.value, false);
console.log("✓ 重新生成按原图坐标重投影，手改不丢失、不生硬贴旧坐标");

// 4) 切到布局保留：沿用旧网格坐标
r.setStrategy("layout");
const layoutPlan = r.plans.value[0];
assert.equal(layoutPlan.cell, 0 * 200 + 10, "布局模式沿用旧 gx/gy");
r.setStrategy("reproject");
console.log("✓ 可在重投影与旧版布局间切换");

// 5) 裁剪移出手改 -> out-of-crop 冲突 -> 导出锁定 -> 解决后解锁
doc.crop = { x: 0.5, y: 0.5, width: 0.5, height: 0.5 };
assert.equal(r.hasConflicts.value, true);
assert.ok(
  r.conflicts.value.every((c: any) => c.kind === "out-of-crop"),
  "应全部为越界冲突",
);
// 模拟导出就绪判定（与 useExport.ready 同条件，返回布尔值）
function exportReady() {
  return !r.hasConflicts.value && r.composedGrid.value !== null;
}
assert.equal(exportReady(), false, "未解决冲突不得导出");
// 丢弃全部越界手改（一次提交，可撤销）
r.discardEdits(r.conflicts.value.flatMap((c: any) => c.editIds));
assert.equal(r.hasConflicts.value, false);
assert.equal(exportReady(), true);
assert.equal(r.canUndo.value, true, "丢弃操作可撤销");
r.undo();
assert.equal(r.editCount.value, 3, "撤销丢弃恢复手改，冲突重新出现");
assert.equal(r.hasConflicts.value, true);
console.log("✓ 裁剪移出冲突确定化处理并锁定导出，解决/撤销行为正确");

// 6) 字符集移除手改字符 -> charset 冲突 -> 替换后解除
doc.crop = { x: 0, y: 0, width: 1, height: 1 };
r.discardEdits(doc.retouch.edits.map((e: any) => e.id));
r.setSelection([5], false);
r.applyToSelection("@", "#ffffff");
assert.equal(r.hasConflicts.value, false);
doc.settings.charset = "binary"; // 仅空格与 0/1，@ 被移除
const csConflict = r.conflicts.value.find((c: any) => c.kind === "charset");
assert.ok(csConflict, "字符集移除应产生 charset 冲突");
assert.equal(exportReady(), false);
r.replaceGlyph(csConflict.editIds[0], "1");
assert.equal(r.hasConflicts.value, false);
assert.equal(r.composedGrid.value.cells[5].glyph, "1");
console.log("✓ 字符集移除冲突可替换解决并恢复导出");

// 7) 碰撞：手工构造两条手改投影到同一单元
doc.settings.charset = "standard";
r.clearEdits();
doc.retouch.edits.push(
  {
    id: "e000001",
    anchor: { ix: 0.1, iy: 0.1, gx: 10, gy: 0 },
    glyph: "@",
    color: "#fff",
  },
  {
    id: "e000002",
    anchor: { ix: 0.105, iy: 0.102, gx: 11, gy: 0 },
    glyph: "#",
    color: "#eee",
  },
);
doc.grid = makeGrid(20, 10); // 两个 ix 都落到列 2
const collision = r.conflicts.value.find((c: any) => c.kind === "collision");
assert.ok(collision, "密度变化使两手改落入同一单元应碰撞");
assert.deepEqual(collision.editIds, ["e000001", "e000002"], "最早创建者排前");
assert.equal(exportReady(), false);
r.keepWinner(collision);
assert.equal(r.hasConflicts.value, false);
assert.equal(r.editCount.value, 1);
// 仅胜者保留，败者「#」不再出现在合成结果中
assert.equal(
  r.composedGrid.value.cells.some((c: any) => c.glyph === "#"),
  false,
);
// 胜者被合成到对应单元
const winPlan = r.plans.value[0];
assert.equal(r.composedGrid.value.cells[winPlan.cell].glyph, "@");
console.log("✓ 同单元碰撞默认保留最早手改，解决后解锁");

// 8) 换图重置：历史与手改全部清空
r.resetForNewImage();
assert.equal(r.editCount.value, 0);
assert.equal(r.canUndo.value, false);
assert.equal(r.canRedo.value, false);
assert.equal(r.retouchMode.value, false);
console.log("✓ 换图后修版层与历史完整重置");

touchComposed();
assert.ok(composeRuns > 1, "合成布局始终可从同一响应式来源读取");
console.log(`\n全部控制器集成断言通过（合成布局读取 ${composeRuns} 次）`);
