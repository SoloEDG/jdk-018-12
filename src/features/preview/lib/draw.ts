import type { Grid } from "../../../shared/document";

export interface GridOverlays {
  selection?: Set<number>;
  retouched?: Set<number>;
  conflicts?: Set<number>;
}

export function drawGrid(
  canvas: HTMLCanvasElement,
  grid: Grid,
  color: boolean,
  background: string,
  overlays: GridOverlays = {},
) {
  const cellW = 8;
  const cellH = 16;
  canvas.width = grid.columns * cellW;
  canvas.height = grid.rows * cellH;
  const g = canvas.getContext("2d")!;
  g.fillStyle = background;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.font = "14px monospace";
  g.textBaseline = "middle";
  g.textAlign = "center";
  for (let i = 0; i < grid.cells.length; i++) {
    const c = grid.cells[i]!;
    g.fillStyle = color ? c.color : "#e9eceb";
    g.fillText(
      c.glyph,
      (i % grid.columns) * cellW + cellW / 2,
      Math.floor(i / grid.columns) * cellH + cellH / 2,
    );
  }
  drawOverlays(g, grid, overlays);
}

function frame(
  g: CanvasRenderingContext2D,
  index: number,
  columns: number,
  stroke: string,
  lineWidth: number,
) {
  const x = (index % columns) * 8;
  const y = Math.floor(index / columns) * 16;
  g.strokeStyle = stroke;
  g.lineWidth = lineWidth;
  g.strokeRect(x + 0.5, y + 0.5, 7, 15);
}

function drawOverlays(
  g: CanvasRenderingContext2D,
  grid: Grid,
  overlays: GridOverlays,
) {
  const { selection, retouched, conflicts } = overlays;
  // 未解决冲突：红色底纹 + 红框
  if (conflicts?.size) {
    g.fillStyle = "rgba(255, 92, 92, 0.22)";
    for (const index of conflicts) {
      if (index < 0 || index >= grid.cells.length) continue;
      g.fillRect((index % grid.columns) * 8, Math.floor(index / grid.columns) * 16, 8, 16);
    }
  }
  // 已被修版层覆盖的单元：右下角小绿点
  if (retouched?.size) {
    g.fillStyle = "#d4eb98";
    for (const index of retouched) {
      if (index < 0 || index >= grid.cells.length) continue;
      g.fillRect((index % grid.columns) * 8 + 5.5, Math.floor(index / grid.columns) * 16 + 13, 2, 2);
    }
  }
  // 框选：亮绿描边（冲突框之后绘制，保证可见）
  if (selection?.size) {
    for (const index of selection) {
      if (index < 0 || index >= grid.cells.length) continue;
      frame(g, index, grid.columns, "#d4eb98", 1.4);
    }
  }
  if (conflicts?.size) {
    for (const index of conflicts) {
      if (index < 0 || index >= grid.cells.length) continue;
      frame(g, index, grid.columns, "#ff5c5c", 1.2);
    }
  }
}
