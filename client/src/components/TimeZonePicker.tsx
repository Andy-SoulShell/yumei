import { useMemo, useState } from "react";
import { SearchSelect } from "./ui/search-select";
import { deviceTimeZone, timeZoneLabel } from "@/lib/timeZone";
import { useI18n } from "@/lib/i18n";

export function TimeZonePicker({
  value,
  onChange,
  id,
  disabled,
  invalid,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  id: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const options = useMemo(() => {
    let zones: string[];
    try {
      zones = Intl.supportedValuesOf("timeZone");
    } catch {
      zones = [
        "Asia/Shanghai",
        "Asia/Tokyo",
        "Asia/Seoul",
        "Europe/London",
        "America/New_York",
        "America/Los_Angeles",
      ];
    }
    return Array.from(new Set(["UTC", deviceTimeZone(), value, ...zones])).map(
      zone => ({
        value: zone,
        label: timeZoneLabel(zone, locale),
        description: zone,
      })
    );
  }, [value, locale]);
  const keyword = search.trim().toLocaleLowerCase();
  return (
    <SearchSelect
      id={id}
      label={t("settings:proactiveTimeZone")}
      value={value}
      selectedLabel={timeZoneLabel(value, locale)}
      disabled={disabled}
      invalid={invalid}
      describedBy={describedBy}
      search={search}
      onSearchChange={setSearch}
      onValueChange={onChange}
      placeholder={t("settings:timeZoneSearch")}
      emptyText={t("settings:timeZoneEmpty")}
      options={options.filter(option =>
        `${option.label} ${option.value}`.toLocaleLowerCase().includes(keyword)
      )}
    />
  );
}
