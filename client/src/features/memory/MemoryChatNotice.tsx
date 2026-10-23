/** 从记忆管理返回时解释上下文变化，不替换或自动发送原聊天草稿。 */
import { useLocation, useSearch } from "wouter";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
export function MemoryChatNotice() {
  const search = useSearch();
  const [location, navigate] = useLocation();
  const { t } = useI18n();
  const parameters = new URLSearchParams(search);
  if (parameters.get("memoryUpdated") !== "1") return null;
  return (
    <div className="mx-3 mt-2 flex max-h-28 shrink-0 items-start gap-2 overflow-y-auto rounded-xl border border-primary/20 bg-primary/5 p-3 sm:mx-4">
      <p role="status" className="min-w-0 flex-1 text-xs leading-relaxed">
        {t("memoryFlow:handoff")}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 shrink-0"
        aria-label={t("memoryFlow:dismiss")}
        onClick={() => {
          parameters.delete("memoryUpdated");
          navigate(location + (parameters.size ? `?${parameters}` : ""), {
            replace: true,
          });
        }}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
