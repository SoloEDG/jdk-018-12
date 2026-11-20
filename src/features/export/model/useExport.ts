import { useStudio } from "../../../shared/useStudio";
import { textContent } from "../lib/text";
import { download, exportName } from "../lib/download";
import { drawGrid } from "../../preview";
import { useRetouch } from "../../retouch/model/useRetouch";
export function useExport() {
  const { doc, notice, busy } = useStudio();
  const retouch = useRetouch();
  function ready() {
    // 未解决冲突不得静默导出：合成布局会跳过冲突手改，必须先处理
    if (retouch.hasConflicts.value) return false;
    return (
      retouch.composedGrid.value &&
      doc.grid?.revision === doc.revision &&
      !busy.value
    );
  }
  function blockedReason(): string {
    if (retouch.hasConflicts.value)
      return `有 ${retouch.conflicts.value.length} 项手改冲突未解决，无法导出`;
    return "正在生成，请稍候";
  }
  function saveText() {
    if (!ready()) {
      notice.value = blockedReason();
      return;
    }
    const grid = retouch.composedGrid.value!;
    download(
      new Blob([textContent(grid)], { type: "text/plain;charset=utf-8" }),
      exportName(doc.asset?.name ?? "art", "txt"),
    );
    notice.value = "文本已导出（含修版层）";
  }
  async function copy() {
    if (!ready()) {
      notice.value = blockedReason();
      return;
    }
    try {
      await navigator.clipboard.writeText(
        textContent(retouch.composedGrid.value!),
      );
      notice.value = "字符画已复制（含修版层）";
    } catch {
      notice.value = "无法访问剪贴板，请使用文本导出";
    }
  }
  function png() {
    if (!ready()) {
      notice.value = blockedReason();
      return;
    }
    const c = document.createElement("canvas");
    drawGrid(
      c,
      retouch.composedGrid.value!,
      doc.settings.color,
      doc.settings.background,
    );
    c.toBlob((b) => {
      if (b) download(b, exportName(doc.asset?.name ?? "art", "png"));
    }, "image/png");
  }
  return { doc, busy, ready, saveText, copy, png, retouch };
}
