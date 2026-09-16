import assert from "node:assert/strict";
import test from "node:test";
import {
  formatOnlineOrderingAvailabilityMessage,
  formatOnlineOrderingDateTime,
  generateOnlineOrderingAvailableDateOptions,
  generateOnlineOrderingSlots,
  getOnlineOrderingAvailability,
  readOnlineOrderingSettings,
} from "../src/lib/online-ordering.ts";

function settingsForHours(businessHours: Record<string, { enabled?: boolean; opening_time?: string; closing_time?: string }> = {}, maxDaysAhead = 2) {
  return readOnlineOrderingSettings({
    online_ordering: {
      enabled: true,
      schedule: {
        opening_time: "09:00",
        closing_time: "18:00",
        slot_interval_minutes: 30,
        max_days_ahead: maxDaysAhead,
        business_hours: businessHours,
      },
    },
  });
}

test("closed days have no slots and expose the next ordering date and time in PHT", () => {
  const settings = settingsForHours({ wed: { enabled: false } });
  const now = new Date("2026-09-16T01:00:00.000Z");
  const availability = getOnlineOrderingAvailability(settings, now);
  const availableDates = generateOnlineOrderingAvailableDateOptions(settings, now);

  assert.equal(availability.status, "closed_day");
  assert.deepEqual(availability.nextSlot, { dateKey: "2026-09-17", slot: "09:00" });
  assert.deepEqual(availableDates[0], { value: "2026-09-17", label: "Thu, Sep 17" });
  assert.deepEqual(generateOnlineOrderingSlots(settings, "2026-09-16", now), []);
  assert.match(formatOnlineOrderingAvailabilityMessage(availability, settings) ?? "", /closed today/i);
  assert.match(formatOnlineOrderingAvailabilityMessage(availability, settings) ?? "", /next available ordering date and time \(Philippine time\): Thu, Sep 17 at 9:00 AM PHT/i);
});

test("server and client slot calculations agree before opening and after closing", () => {
  const settings = settingsForHours();
  const beforeOpen = new Date("2026-09-16T00:00:00.000Z");
  const afterClose = new Date("2026-09-16T10:30:00.000Z");

  const beforeAvailability = getOnlineOrderingAvailability(settings, beforeOpen);
  const beforeDates = generateOnlineOrderingAvailableDateOptions(settings, beforeOpen);
  assert.equal(beforeAvailability.status, "before_open");
  assert.deepEqual(beforeAvailability.nextSlot, { dateKey: beforeDates[0]?.value, slot: "09:00" });

  const afterAvailability = getOnlineOrderingAvailability(settings, afterClose);
  const afterDates = generateOnlineOrderingAvailableDateOptions(settings, afterClose);
  assert.equal(afterAvailability.status, "after_close");
  assert.deepEqual(afterAvailability.nextSlot, { dateKey: afterDates[0]?.value, slot: "09:00" });
});

test("a closed schedule window keeps the next slot unavailable instead of inventing a date", () => {
  const settings = settingsForHours({ wed: { enabled: false } }, 0);
  const now = new Date("2026-09-16T01:00:00.000Z");
  const availability = getOnlineOrderingAvailability(settings, now);

  assert.equal(availability.nextSlot, null);
  assert.match(formatOnlineOrderingAvailabilityMessage(availability, settings) ?? "", /no upcoming ordering slots/i);
  assert.equal(generateOnlineOrderingAvailableDateOptions(settings, now).length, 0);
  assert.equal(formatOnlineOrderingDateTime("2026-09-17", "09:00"), "Thu, Sep 17 at 9:00 AM PHT");
});
