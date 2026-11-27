import { describe, expect, it } from "vitest";
import { validateDateOfBirth, validatePhone } from "./validation";

const today = new Date("2026-10-12T12:00:00Z");

describe("validateDateOfBirth", () => {
  it("accepts empty (optional field)", () => {
    expect(validateDateOfBirth("", today)).toBeNull();
  });
  it("accepts a normal date", () => {
    expect(validateDateOfBirth("1985-03-10", today)).toBeNull();
  });
  it("rejects the year-20022 typo that broke the cloud sync", () => {
    expect(validateDateOfBirth("20022-10-01", today)).not.toBeNull();
  });
  it("rejects years before 1900 and after today", () => {
    expect(validateDateOfBirth("1899-12-31", today)).toMatch(/1900/);
    expect(validateDateOfBirth("2027-01-01", today)).toMatch(/1900/);
  });
  it("rejects a date later than today in the current year", () => {
    expect(validateDateOfBirth("2026-12-31", today)).toBe("Doğum tarihi gelecekte olamaz");
  });
  it("rejects impossible calendar dates", () => {
    expect(validateDateOfBirth("2001-02-30", today)).toBe("Geçersiz doğum tarihi");
  });
});

describe("validatePhone", () => {
  it("accepts empty and common formats", () => {
    expect(validatePhone("")).toBe(true);
    expect(validatePhone("+90 555 123 45 67")).toBe(true);
    expect(validatePhone("(0212) 555-1234")).toBe(true);
  });
  it("rejects letters and too-short values", () => {
    expect(validatePhone("abc")).toBe(false);
    expect(validatePhone("123")).toBe(false);
  });
});

// bug-hunt L6 (2026-11-27): junk phones passed; "today" was the UTC date, so between 00:00 and
// 03:00 in Turkey a baby born today was rejected as born in the future.
describe("validatePhone (bug-hunt L6)", () => {
  it("rejects values without enough digits", () => {
    expect(validatePhone("------")).toBe(false);
    expect(validatePhone("((((((")).toBe(false);
    expect(validatePhone("12-34-5")).toBe(false);
  });
  it("treats spaces-only as empty (optional field; stored as null)", () => {
    expect(validatePhone("      ")).toBe(true);
  });
  it("accepts surrounding spaces", () => {
    expect(validatePhone(" 0555 123 45 67 ")).toBe(true);
  });
});

describe("validateDateOfBirth local today (bug-hunt L6)", () => {
  it("accepts a birth today at 01:30 local time, when the UTC date is still yesterday", () => {
    // 2026-11-27 01:30 in a UTC+3 zone is 2026-11-26 22:30 UTC.
    const lateNight = new Date(2026, 10, 27, 1, 30);
    const localToday = "2026-11-27";
    expect(validateDateOfBirth(localToday, lateNight)).toBeNull();
  });
  it("handles leap days", () => {
    expect(validateDateOfBirth("2024-02-29", today)).toBeNull();
    expect(validateDateOfBirth("2023-02-29", today)).toBe("Geçersiz doğum tarihi");
  });
});
