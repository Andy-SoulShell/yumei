/** 少量选项用 Radix Select，较长候选用可搜索的 Command / Popover 组合。 */
import { useState } from "react";
import { SearchSelect } from "@/components/ui/search-select";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { FieldChoice } from "./ConfigForm";
export function ChoiceField({
  id,
  label,
  value,
  choices,
  disabled,
  error,
  describedBy,
  onChange,
  searchable = false,
}: {
  id: string;
  label: string;
  value: string;
  choices: FieldChoice[];
  disabled: boolean;
  error?: string;
  describedBy: string;
  onChange: (value: string) => void;
  searchable?: boolean;
}) {
  const [search, setSearch] = useState("");
  const selected = choices.find(item => item.value === value);
  if (searchable || choices.length > 9)
    return (
      <SearchSelect
        id={id}
        label={label}
        disabled={disabled}
        invalid={!!error}
        describedBy={describedBy}
        selectedLabel={selected?.label || value || "请选择"}
        value={value}
        placeholder={`搜索${label}`}
        emptyText="没有匹配的选项"
        search={search}
        onSearchChange={setSearch}
        options={choices.filter(item =>
          `${item.label} ${item.value}`
            .toLowerCase()
            .includes(search.toLowerCase())
        )}
        onValueChange={onChange}
      />
    );
  return (
    <Select
      value={value || undefined}
      disabled={disabled}
      onValueChange={onChange}
    >
      <SelectTrigger
        id={id}
        aria-label={label}
        aria-invalid={!!error}
        aria-describedby={describedBy}
      >
        <SelectValue placeholder="请选择" />
      </SelectTrigger>
      <SelectContent>
        {!selected && value && (
          <SelectItem value={value} disabled>
            当前值需要重新选择
          </SelectItem>
        )}
        {choices.map(item => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
