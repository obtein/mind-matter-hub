import { describe, expect, it } from "vitest";
import { appointmentsForHour, scheduleHours } from "./schedule";

// Regression for bug-hunt H5 (2026-11-27): the day grid showed only 08–20 and one appointment
// per hour (Array.find). Measured: 113 of 1166 appointments start outside 08–20 (80 at 07:xx),
// and one hour slot held two appointments.

const at = (h: number, m = 0, status = "scheduled", id = `${h}:${m}:${status}`) => {
  const d = new Date(2026, 10, 27, h, m);
  return { id, appointment_date: d.toISOString(), status };
};

describe("scheduleHours", () => {
  it("shows the standard 08–20 rows on an empty day", () => {
    expect(scheduleHours([])).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });

  it("adds rows for appointments before 08:00 and after 20:59", () => {
    const hours = scheduleHours([at(7, 30), at(21), at(1)]);
    expect(hours[0]).toBe(1);
    expect(hours).toContain(7);
    expect(hours).toContain(21);
    expect(hours).toEqual([...hours].sort((a, b) => a - b));
  });
});

describe("appointmentsForHour", () => {
  it("returns every appointment in the hour, live before cancelled, by start time", () => {
    const list = [at(9, 45), at(9, 0, "cancelled"), at(9, 15, "completed"), at(10)];
    const nine = appointmentsForHour(list, 9).map((a) => a.id);
    expect(nine).toEqual(["9:15:completed", "9:45:scheduled", "9:0:cancelled"]);
  });

  it("returns an empty list for a free hour", () => {
    expect(appointmentsForHour([at(9)], 11)).toEqual([]);
  });
});
