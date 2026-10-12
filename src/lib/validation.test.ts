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
