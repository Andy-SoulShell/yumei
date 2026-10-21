import { productFixture } from "./testProductConfig";
import { DEFAULT_PROACTIVE_PREFERENCES } from "./testProductConfig";
import { describe, expect, it } from "vitest";
import {
  isProactiveQuiet,
  proactiveContactWindow as windowWithRules,
  proactiveLocalClock,
  proactiveDeliveryExpiresAt,
  proactivePreferencesSchema,
} from "../shared/proactiveContact";

describe("explicit proactive contact windows", () => {
  const prefs = { ...DEFAULT_PROACTIVE_PREFERENCES, proactiveEnabled: true };
  it("defaults off and rejects invalid time zones or frequency", () => {
    expect(
      proactiveContactWindow({
        preferences: DEFAULT_PROACTIVE_PREFERENCES,
        now: new Date(),
      }).allowed
    ).toBe(false);
    expect(
      proactivePreferencesSchema.safeParse({ ...prefs, timeZone: "+08:00" })
        .success
    ).toBe(false);
    expect(
      proactivePreferencesSchema.safeParse({ ...prefs, frequencyDays: 0 })
        .success
    ).toBe(false);
  });
  it("handles overnight quiet hours and explicitly disabled equal bounds", () => {
    for (const minute of [0, 479, 1320, 1439])
      expect(isProactiveQuiet(minute, 1320, 480)).toBe(true);
    for (const minute of [480, 900, 1319])
      expect(isProactiveQuiet(minute, 1320, 480)).toBe(false);
    expect(isProactiveQuiet(0, 0, 0)).toBe(false);
  });
  it.each([
    ["2026-03-08T06:30:00Z", 90],
    ["2026-03-08T07:30:00Z", 210],
    ["2026-11-01T05:30:00Z", 90],
    ["2026-11-01T06:30:00Z", 90],
  ] as const)("uses IANA daylight saving time at %s", (instant, minute) => {
    expect(
      proactiveLocalClock(new Date(instant), "America/New_York")?.minute
    ).toBe(minute);
  });
  it("backs off ignored contacts and blocks active conversations or quick time zone changes", () => {
    const now = new Date("2026-10-20T12:00:00Z"),
      last = new Date("2026-10-19T12:00:00Z");
    expect(
      proactiveContactWindow({
        preferences: prefs,
        now,
        lastContactAt: last,
        unreadContacts: 0,
      }).allowed
    ).toBe(true);
    expect(
      proactiveContactWindow({
        preferences: prefs,
        now,
        lastContactAt: last,
        unreadContacts: 2,
      }).reason
    ).toBe("cadence");
    expect(
      proactiveContactWindow({ preferences: prefs, now, hasActiveChat: true })
        .reason
    ).toBe("active");
    expect(
      proactiveContactWindow({
        preferences: {
          ...prefs,
          timeZone: "Pacific/Kiritimati",
          quietStart: 0,
          quietEnd: 0,
        },
        now,
        lastContactAt: new Date(now.getTime() - 60_000),
      }).allowed
    ).toBe(false);
  });
  it("expires an offline push at the next local quiet boundary or midnight", () => {
    const now = new Date("2026-10-20T13:59:30Z");
    expect(
      proactiveDeliveryExpiresAt(
        now,
        { ...prefs, timeZone: "Asia/Shanghai" },
        new Date("2026-10-20T15:59:30Z")
      ).toISOString()
    ).toBe("2026-10-20T14:00:00.000Z");
    const late = new Date("2026-10-20T15:59:30Z");
    expect(
      proactiveDeliveryExpiresAt(
        late,
        { ...prefs, timeZone: "Asia/Shanghai", quietStart: 0, quietEnd: 0 },
        new Date("2026-10-20T17:59:30Z")
      ).toISOString()
    ).toBe("2026-10-20T16:00:00.000Z");
  });
});

function proactiveContactWindow(input: Parameters<typeof windowWithRules>[0]) {
  return windowWithRules(input, productFixture.proactive);
}

it("does not shorten a user interval longer than the unread backoff cap", () => {
  const config = structuredClone(productFixture.proactive);
  config.frequencyDays.max = 60;
  const preferences = {
    ...config.defaults,
    proactiveEnabled: true,
    frequencyDays: 45,
    quietStart: 0,
    quietEnd: 0,
  };
  expect(
    windowWithRules(
      {
        preferences,
        now: new Date("2026-10-20T12:00:00Z"),
        lastContactAt: new Date("2026-09-10T12:00:00Z"),
        unreadContacts: 10,
      },
      config
    ).reason
  ).toBe("cadence");
  expect(
    windowWithRules(
      {
        preferences,
        now: new Date("2026-10-20T12:00:00Z"),
        lastContactAt: new Date("2026-09-01T12:00:00Z"),
        unreadContacts: 10,
      },
      config
    ).allowed
  ).toBe(true);
});
