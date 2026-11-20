// 纯逻辑验证：projection.ts 的重投影/布局保留/三类冲突/合成行为
// 用 node --experimental-strip-types 直接跑 TS（仅类型导入，无 .vue 依赖）
import assert from "node:assert/strict";
import {
  planRetargets,
  recomputeConflicts,
  composeGrid,
  blockedEditIds,
  retouchedCells,
  conflictCells,
  type RetargetPlan,
} from "/workspace/jdk-018-0-1代码生成-12/src/features/retouch/lib/projection.ts";
import type { Grid, RetouchEdit, Crop } from "/workspace/jdk-018-0-1代码生成-12/src/shared/document.ts";

function grid(cols: number, rows: number): Grid {
  return {
    columns: cols,
    rows,
    cells: Array.from({ length: cols * rows }, (_, i) => ({
      glyph: ".",
      color: "#111111",
    })),
    revision: 1,
  };
}
function edit(
  id: string,
  ix: number,
  iy: number,
  gx: number,
  gy: number,
  glyph = "@",
  color = "#ff0000",
): RetouchEdit {
  return { id, anchor: { ix, iy, gx, gy }, glyph, color };
}
const fullCrop: Crop = { x: 0, y: 0, width: 1, height: 1 };
const standard = [" ", ".", ":", "-", "=", "+", "*", "#", "%", "@"];

// 1) 重投影：原图坐标映射到新密度网格
{
  const g = grid(100, 50);
  const edits = [edit("e000001", 0.5, 0.5, 50, 25)];
  const plans = planRetargets(edits, {
    grid: g,
    crop: fullCrop,
    strategy: "reproject",
    charset: standard,
  });
  assert.equal(plans[0]!.cell, 25 * 100 + 50, "中心手改应重投影到新网格中心");
  console.log("✓ 重投影落点正确");
}

// 2) 布局保留：密度变化后仍沿用旧网格坐标，不生硬套用
{
  const g = grid(200, 100);
  const edits = [edit("e000001", 0.5, 0.5, 50, 25)];
  const plans = planRetargets(edits, {
    grid: g,
    crop: fullCrop,
    strategy: "layout",
    charset: standard,
  });
  assert.equal(plans[0]!.cell, 25 * 200 + 50, "布局模式必须沿用旧 gx/gy");
  console.log("✓ 布局保留沿用旧坐标");
}

// 3) 裁剪移出原区域 -> out-of-crop 冲突，确定为越界
{
  const g = grid(100, 50);
  // 手改原图坐标在 (0.1, 0.1)，新裁剪只取右下四分之一
  const crop: Crop = { x: 0.5, y: 0.5, width: 0.5, height: 0.5 };
  const edits = [edit("e000001", 0.1, 0.1, 10, 5)];
  const plans = planRetargets(edits, {
    grid: g,
    crop,
    strategy: "reproject",
    charset: standard,
  });
  assert.equal(plans[0]!.cell, null, "裁剪移出后应为越界");
  const conflicts = recomputeConflicts(edits, plans, standard);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]!.kind, "out-of-crop");
  // 同一条手改在布局模式下若仍在范围内则不冲突（两条路径行为独立）
  const layoutPlans = planRetargets(edits, {
    grid: g,
    crop,
    strategy: "layout",
    charset: standard,
  });
  assert.equal(layoutPlans[0]!.cell, 5 * 100 + 10);
  console.log("✓ 裁剪移出产生 out-of-crop 冲突，布局模式可独立规避");
}

// 4) 密度提高导致多个改动落入同一新单元 -> collision，最早 id 胜出
{
  const g = grid(10, 10);
  const edits = [
    edit("e000002", 0.15, 0.15, 3, 3, "#"),
    edit("e000001", 0.12, 0.12, 2, 2, "@"),
  ];
  // 两者重投影后都进 cell (1,1)
  const plans: RetargetPlan[] = [
    { editId: "e000002", cell: 11 },
    { editId: "e000001", cell: 11 },
  ];
  const conflicts = recomputeConflicts(edits, plans, standard);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]!.kind, "collision");
  assert.deepEqual(conflicts[0]!.editIds, ["e000001", "e000002"], "按 id 排序，最早创建者在前");
  assert.equal(conflicts[0]!.cell, 11);
  // 冲突未解决时：两条都不参与合成，保持自动字符，不静默选一条
  const auto = grid(10, 10);
  const composed = composeGrid(auto, edits, plans, conflicts);
  assert.equal(composed.cells[11]!.glyph, ".", "未解决碰撞不得写入任何手改");
  assert.ok(blockedEditIds(conflicts).has("e000001"));
  assert.ok(blockedEditIds(conflicts).has("e000002"));
  // 解决（保留胜者 e000001）后：胜者正常合成
  const resolved: typeof conflicts = [];
  const remaining = edits.filter((e) => e.id === "e000001");
  const remainingPlans = plans.filter((p) => p.editId === "e000001");
  const composed2 = composeGrid(auto, remaining, remainingPlans, resolved);
  assert.equal(composed2.cells[11]!.glyph, "@");
  assert.equal(composed2.cells[11]!.color, "#ff0000");
  console.log("✓ 同单元碰撞冲突、阻塞与解决后合成行为正确");
}

// 5) 字符集移除手改字符 -> charset 冲突；替换或丢弃后恢复
{
  const g = grid(10, 10);
  const edits = [edit("e000001", 0.5, 0.5, 5, 5, "@")];
  const plans = planRetargets(edits, {
    grid: g,
    crop: fullCrop,
    strategy: "reproject",
    charset: [" ", ".", ":"], // @ 被移除
  });
  const conflicts = recomputeConflicts(edits, plans, [" ", ".", ":"]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]!.kind, "charset");
  const auto = grid(10, 10);
  const blockedComposed = composeGrid(auto, edits, plans, conflicts);
  assert.equal(blockedComposed.cells[55]!.glyph, ".", "字符集冲突手改不得静默导出");
  // 替换为字符集内字符后冲突消失
  const fixed = [{ ...edits[0]!, glyph: ":" }];
  const fixedConflicts = recomputeConflicts(fixed, plans, [" ", ".", ":"]);
  assert.equal(fixedConflicts.length, 0);
  const fixedComposed = composeGrid(auto, fixed, plans, fixedConflicts);
  assert.equal(fixedComposed.cells[55]!.glyph, ":");
  console.log("✓ 字符集移除冲突可检测、可替换解决");
}

// 6) 无冲突时合成布局 = 自动层 + 全部手改，且自动单元不被污染
{
  const g = grid(4, 2);
  const edits = [
    edit("e000001", 0.2, 0.25, 0, 0, "@", "#aaaaaa"),
    edit("e000002", 0.8, 0.75, 3, 1, "#", "#bbbbbb"),
  ];
  const plans = planRetargets(edits, {
    grid: g,
    crop: fullCrop,
    strategy: "reproject",
    charset: standard,
  });
  const conflicts = recomputeConflicts(edits, plans, standard);
  assert.equal(conflicts.length, 0);
  const composed = composeGrid(g, edits, plans, conflicts);
  assert.equal(composed.cells[0]!.glyph, "@");
  assert.equal(composed.cells[7]!.glyph, "#");
  assert.equal(composed.cells[3]!.glyph, ".", "未手改单元保持自动结果");
  assert.equal(composed.revision, g.revision, "合成结果沿用自动层修订号");
  const touched = retouchedCells(plans, conflicts);
  assert.deepEqual([...touched].sort(), [0, 7]);
  console.log("✓ 无冲突合成与高亮单元正确");
}

// 7) 越界单元不进 conflictCells（画布无对应格子），但冲突仍被导出阻塞
{
  const g = grid(5, 5);
  const edits = [edit("e000001", 0.1, 0.1, 0, 0)];
  const plans: RetargetPlan[] = [{ editId: "e000001", cell: null }];
  const conflicts = recomputeConflicts(edits, plans, standard);
  assert.equal(conflictCells(conflicts).size, 0);
  assert.equal(blockedEditIds(conflicts).size, 1);
  console.log("✓ 越界冲突阻塞导出但不产生无效高亮");
}

console.log("\n全部 projection 逻辑断言通过");
