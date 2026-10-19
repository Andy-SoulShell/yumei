/** 以本地日期字符串为边界的日历选择器，避免 UTC 时区导致生日偏移。 */
import { useState } from "react";
import { format, isValid, parse } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/** 日期以 yyyy-MM-dd 存取；最大日期同样按本地日历解释。 */
interface DatePickerProps {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  maxDate?: Date;
  id?: string;
}

/** 提供本地化月份、年份及键盘选日，选中后将焦点归还触发按钮。 */
export function DatePicker({
  value,
  onValueChange,
  label,
  maxDate = new Date(),
  id,
}: DatePickerProps) {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  const selected = isValid(parsed) ? parsed : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={label}
          className="w-full justify-start font-normal"
        >
          <CalendarIcon className="size-4" />
          {selected
            ? selected.toLocaleDateString(locale, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto max-w-[calc(100vw-2rem)] p-0"
        aria-label={label}
      >
        <Calendar
          mode="single"
          selected={selected}
          locale={locale === "en" ? enUS : zhCN}
          captionLayout="dropdown"
          startMonth={new Date(1900, 0, 1)}
          endMonth={maxDate}
          defaultMonth={selected ?? new Date(maxDate.getFullYear() - 25, 0, 1)}
          disabled={{ after: maxDate }}
          onSelect={date => {
            if (!date) return;
            onValueChange(format(date, "yyyy-MM-dd"));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
