/** 基于 Radix Popover 和 shadcn Command 的搜索选择器。 */
import { useId, useState, type ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";

/** 选项展示数据；value 始终为业务标识，不受翻译影响。 */
export interface SearchSelectOption {
  value: string;
  label: string;
  description?: ReactNode;
  detail?: ReactNode;
  group?: string;
}

/** 受控搜索与选择，以及当前高亮选项的独立操作。 */
interface SearchSelectProps {
  value: string;
  label: string;
  placeholder: string;
  emptyText: string;
  options: SearchSelectOption[];
  search: string;
  onSearchChange: (search: string) => void;
  onValueChange: (value: string) => void;
  /** 在列表之外展示试听、收藏等操作，避免选项内嵌交互元素。 */
  renderActions?: (value: string) => ReactNode;
}

/** 支持方向键高亮、回车选择、Escape 关闭与焦点归还，过滤由调用方负责。 */
export function SearchSelect({
  value,
  label,
  placeholder,
  emptyText,
  options,
  search,
  onSearchChange,
  onValueChange,
  renderActions,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(value);
  const listId = useId();
  const selected = options.find(option => option.value === value);
  const activeOption = options.find(option => option.value === active);
  const groups = new Map<string, SearchSelectOption[]>();
  for (const option of options) {
    const key = option.group ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(option);
  }
  return (
    <Popover
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (next) setActive(value);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={label}
          className="w-full min-w-0 justify-between"
        >
          <span className="truncate">{selected?.label || value || label}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"
        aria-label={label}
      >
        <Command shouldFilter={false} value={active} onValueChange={setActive}>
          <CommandInput
            placeholder={placeholder}
            aria-label={placeholder}
            value={search}
            onValueChange={onSearchChange}
          />
          <CommandList id={listId} aria-label={label}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {Array.from(groups).map(([group, items]) => (
              <CommandGroup key={group} heading={group || undefined}>
                {items.map(option => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                    className="gap-2 py-2.5"
                  >
                    <Check
                      aria-hidden="true"
                      className={`size-4 shrink-0 ${value === option.value ? "opacity-100 text-primary" : "opacity-0"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </span>
                    {option.detail && (
                      <span className="shrink-0 text-right text-xs text-muted-foreground">
                        {option.detail}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        {activeOption && renderActions && (
          <div className="border-t p-2">
            <p className="mb-2 truncate text-xs text-muted-foreground">
              {activeOption.label}
            </p>
            <div className="flex flex-wrap gap-2">
              {renderActions(activeOption.value)}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
