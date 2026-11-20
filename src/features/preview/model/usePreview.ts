import { ref, computed } from "vue";
import { useStudio } from "../../../shared/useStudio";
import { useRetouch } from "../../retouch/model/useRetouch";
export function usePreview() {
  const { doc, busy } = useStudio();
  const retouch = useRetouch();
  const mode = ref<"art" | "text">("art");
  const zoom = ref(100);
  const count = computed(
    () => retouch.composedGrid.value?.cells.length.toLocaleString() ?? "0",
  );
  return { doc, busy, mode, zoom, count };
}
