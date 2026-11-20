import type {
  Cell,
  Crop,
  Grid,
  MigrationStrategy,
  RetouchConflict,
  RetouchEdit,
} from "../../../shared/document";

/** 单条手改向新网格的落点规划 */
export interface RetargetPlan {
  editId: string;
  /** 目标单元索引；null 表示落在新网格之外 */
  cell: number | null;
}

export interface MigrationContext {
  grid: Grid;
  crop: Crop;
  strategy: MigrationStrategy;
  charset: string[];
}

/**
 * 依据策略规划每条手改的新单元。
 * - reproject：按原图归一化坐标重新投影到当前裁剪/密度结果
 * - layout：保留旧版布局，沿用创建时的网格坐标
 */
export function planRetargets(
  edits: RetouchEdit[],
  ctx: MigrationContext,
): RetargetPlan[] {
  const { grid, crop, strategy } = ctx;
  return edits.map((edit) => {
    let gx: number;
    let gy: number;
    if (strategy === "layout") {
      gx = edit.anchor.gx;
      gy = edit.anchor.gy;
    } else {
      const rx = (edit.anchor.ix - crop.x) / crop.width;
      const ry = (edit.anchor.iy - crop.y) / crop.height;
      gx = Math.floor(rx * grid.columns);
      gy = Math.floor(ry * grid.rows);
    }
    if (gx < 0 || gy < 0 || gx >= grid.columns || gy >= grid.rows)
      return { editId: edit.id, cell: null };
    return { editId: edit.id, cell: gy * grid.columns + gx };
  });
}

function editById(edits: RetouchEdit[], id: string): RetouchEdit {
  const edit = edits.find((e) => e.id === id);
  if (!edit) throw new Error("未知手改 " + id);
  return edit;
}

/**
 * 计算迁移后的全部冲突。三类冲突均为确定行为：
 * 1) out-of-crop：裁剪/密度变化使手改落到新网格之外
 * 2) collision：多条手改落入同一新单元，最早创建者（id 较小）胜出
 * 3) charset：手改字符已不在当前字符集中
 */
export function recomputeConflicts(
  edits: RetouchEdit[],
  plans: RetargetPlan[],
  charset: string[],
): RetouchConflict[] {
  const conflicts: RetouchConflict[] = [];
  const available = new Set(charset);
  const planById = new Map(plans.map((p) => [p.editId, p]));

  // 1) 越界冲突
  for (const plan of plans) {
    if (plan.cell === null) {
      conflicts.push({
        kind: "out-of-crop",
        editIds: [plan.editId],
        cell: null,
        detail:
          "该手改已落在当前裁剪/密度范围之外：可丢弃，或按原图位置重新投影",
      });
    }
  }

  // 2) 同单元碰撞冲突
  const groups = new Map<number, RetouchEdit[]>();
  for (const edit of edits) {
    const cell = planById.get(edit.id)?.cell;
    if (cell === null || cell === undefined) continue;
    const bucket = groups.get(cell);
    if (bucket) bucket.push(edit);
    else groups.set(cell, [edit]);
  }
  for (const [cell, bucket] of groups) {
    if (bucket.length < 2) continue;
    const sorted = [...bucket].sort((a, b) => (a.id < b.id ? -1 : 1));
    const winner = sorted[0]!;
    conflicts.push({
      kind: "collision",
      editIds: sorted.map((e) => e.id),
      cell,
      detail: `多条手改落入同一单元，默认保留最早的「${winner.glyph}」，其余需移除`,
    });
  }

  // 3) 字符集移除冲突
  for (const edit of edits) {
    if (!available.has(edit.glyph)) {
      conflicts.push({
        kind: "charset",
        editIds: [edit.id],
        cell: planById.get(edit.id)?.cell ?? null,
        detail: `字符「${edit.glyph}」已不在当前字符集中：可替换为现有字符或丢弃`,
      });
  }
  }
  return conflicts;
}

/** 被任意冲突阻塞、不参与合成的手改 id */
export function blockedEditIds(conflicts: RetouchConflict[]): Set<string> {
  const ids = new Set<string>();
  for (const conflict of conflicts) for (const id of conflict.editIds) ids.add(id);
  return ids;
}

/**
 * 将自动层与修版层合成为同一份布局。
 * 存在冲突的手改一律不合成，必须先解决，避免静默导出歧义结果。
 */
export function composeGrid(
  auto: Grid,
  edits: RetouchEdit[],
  plans: RetargetPlan[],
  conflicts: RetouchConflict[],
): Grid {
  const cells: Cell[] = auto.cells.map((c) => ({ ...c }));
  const blocked = blockedEditIds(conflicts);
  for (const plan of plans) {
    if (plan.cell === null || blocked.has(plan.editId)) continue;
    const edit = editById(edits, plan.editId);
    cells[plan.cell] = { glyph: edit.glyph, color: edit.color };
  }
  return {
    columns: auto.columns,
    rows: auto.rows,
    cells,
    revision: auto.revision,
  };
}

/** 修版层实际覆盖到的单元索引（无冲突时），用于预览角标与高亮 */
export function retouchedCells(
  plans: RetargetPlan[],
  conflicts: RetouchConflict[],
): Set<number> {
  const blocked = blockedEditIds(conflicts);
  const cells = new Set<number>();
  for (const plan of plans) {
    if (plan.cell === null || blocked.has(plan.editId)) continue;
    cells.add(plan.cell);
  }
  return cells;
}

/** 冲突涉及的单元索引，用于预览红框提示 */
export function conflictCells(conflicts: RetouchConflict[]): Set<number> {
  const cells = new Set<number>();
  for (const conflict of conflicts)
    if (conflict.cell !== null) cells.add(conflict.cell);
  return cells;
}
