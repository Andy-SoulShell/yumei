/** 按用户任务展开；首次访问才挂载，折叠后保留草稿和子组件状态。 */
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
export function SettingsSection({
  id,
  title,
  description,
  icon: Icon,
  open,
  onOpenChange,
  status,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status?: string;
  children: ReactNode;
}) {
  const [visited, setVisited] = useState(open);
  useEffect(() => {
    if (open) setVisited(true);
  }, [open]);
  return (
    <section
      id={id}
      className="settings-section surface-card rounded-2xl"
      aria-labelledby={`${id}-title`}
    >
      <h2>
        <Button
          id={`${id}-title`}
          type="button"
          variant="plain"
          size="none"
          className="settings-section-trigger w-full rounded-2xl p-4 text-left"
          aria-expanded={open}
          aria-controls={`${id}-content`}
          onClick={() => onOpenChange(!open)}
        >
          <span className="settings-section-icon rounded-xl bg-primary/10 p-2.5 text-primary">
            <Icon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">{title}</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              {description}
            </span>
            {status && (
              <span className="mt-2 block text-xs font-medium text-primary">
                {status}
              </span>
            )}
          </span>
          <ChevronDown
            className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </Button>
      </h2>
      {(open || visited) && (
        <div
          id={`${id}-content`}
          role="region"
          aria-labelledby={`${id}-title`}
          hidden={!open}
          className="settings-section-body"
        >
          {children}
        </div>
      )}
    </section>
  );
}
