export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Asset {
  name: string;
  url: string;
  width: number;
  height: number;
  image: HTMLImageElement;
}
export interface Settings {
  columns: number;
  charset: string;
  custom: string;
  contrast: number;
  gamma: number;
  invert: boolean;
  color: boolean;
  background: string;
}
export interface Cell {
  glyph: string;
  color: string;
}
export interface Grid {
  columns: number;
  rows: number;
  cells: Cell[];
  revision: number;
}
/** 手改在重新生成时的迁移策略 */
export type MigrationStrategy = "reproject" | "layout";
/** 冲突类型：裁剪移出 / 多改落入同一单元 / 字符集移除 */
export type ConflictKind = "out-of-crop" | "collision" | "charset";
/** 一处手改的双重锚点：原图归一化坐标 + 创建时的网格坐标 */
export interface RetouchAnchor {
  ix: number;
  iy: number;
  gx: number;
  gy: number;
}
export interface RetouchEdit {
  id: string;
  anchor: RetouchAnchor;
  glyph: string;
  color: string;
}
export interface RetouchConflict {
  kind: ConflictKind;
  /** 冲突涉及的全部手改（碰撞时可能有多条） */
  editIds: string[];
  /** 命中的新单元索引；越界时为 null */
  cell: number | null;
  detail: string;
}
export interface RetouchLayer {
  edits: RetouchEdit[];
  strategy: MigrationStrategy;
  /** 完整修版意图快照栈，保证撤销恢复的是当时的手改而非重新计算的偶然字符 */
  past: RetouchEdit[][];
  future: RetouchEdit[][];
}
export interface StudioDocument {
  asset: Asset | null;
  crop: Crop;
  settings: Settings;
  grid: Grid | null;
  retouch: RetouchLayer;
  revision: number;
}
