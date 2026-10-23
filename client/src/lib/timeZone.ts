import { validCompanionTimeZone } from "@shared/proactiveContact";

export function deviceTimeZone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return validCompanionTimeZone(zone) ? zone : "UTC";
  } catch {
    return "UTC";
  }
}

/** 使用浏览器提供的本地化名称和当前偏移，IANA 标识只用于保存和搜索。 */
export function timeZoneLabel(zone: string, locale: string) {
  try {
    const name =
      new Intl.DateTimeFormat(locale, {
        timeZone: zone,
        timeZoneName: "longGeneric",
      })
        .formatToParts()
        .find(p => p.type === "timeZoneName")?.value ?? zone;
    const offset = new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      timeZoneName: "shortOffset",
    })
      .formatToParts()
      .find(p => p.type === "timeZoneName")?.value;
    return offset && offset !== name ? `${name} (${offset})` : name;
  } catch {
    return zone;
  }
}
