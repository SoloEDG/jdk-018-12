import { reactive, ref, provide, watch } from "vue";
import { createDocument } from "../shared/defaults";
import { studioKey } from "../shared/context";
import { generate } from "../features/mapping";
import { useRetouch } from "../features/retouch/model/useRetouch";
export function useWorkspace() {
  const doc = reactive(createDocument());
  const busy = ref(false),
    notice = ref("所有处理均在你的浏览器中完成");
  provide(studioKey, { doc, busy, notice, invalidate });
  // 修版控制器在 provide 之后创建；框选状态在每次重新生成时失效，
  // 但手改编辑通过原图坐标重投影或旧版布局保留（见 retouch/lib/projection）
  const retouch = useRetouch();
  let timer: ReturnType<typeof setTimeout>;
  function invalidate() {
    doc.revision++;
    busy.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        doc.grid = generate(doc);
        retouch.onGridReplaced();
      } catch (e) {
        notice.value = e instanceof Error ? e.message : "生成失败";
      } finally {
        busy.value = false;
      }
    }, 60);
  }
  watch(() => doc.settings.background, invalidate);
  return { doc, busy, notice };
}
