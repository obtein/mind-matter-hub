import { describe, expect, it } from "vitest";
import { searchKey, matchesText, matchesPhone } from "./search";

// Regression for bug-hunt H7/L16 (2026-11-27): search used locale-free toLowerCase, so
// "ibrahim" did not find "İbrahim" ("İ".toLowerCase() is "i" + U+0307), and phone search
// compared raw strings with spaces.

describe("searchKey / matchesText", () => {
  it.each([
    ["İbrahim Yılmaz", "ibrahim"],
    ["İBRAHİM", "ibrahim"],
    ["ibrahim", "İBRAHİM"],
    ["ISMAIL", "ismail"],
    ["Işık", "isik"],
    ["Işık", "IŞIK"],
    ["Şükrü Çağlar", "sukru caglar"],
    ["Gökhan Öztürk", "gokhan ozturk"],
    ["Ali Veli", "  ali "],
  ])("%s matches %s", (text, term) => {
    expect(matchesText(text, term)).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesText("Ayşe", "mehmet")).toBe(false);
  });

  it("treats an empty term as a match and null text as no match", () => {
    expect(matchesText("x", "  ")).toBe(true);
    expect(matchesText(null, "a")).toBe(false);
  });

  it("produces equal keys for spelling variants (grouping)", () => {
    expect(searchKey(" Sertralin ")).toBe(searchKey("SERTRALİN"));
    expect(searchKey("F41.1")).toBe(searchKey("f41.1 "));
  });
});

describe("matchesPhone", () => {
  it("compares digits only", () => {
    expect(matchesPhone("0555 123 45 67", "0555123")).toBe(true);
    expect(matchesPhone("(0555) 123-45-67", "123 45")).toBe(true);
  });

  it("needs at least 3 digits in the term and ignores letters", () => {
    expect(matchesPhone("0555 123 45 67", "05")).toBe(false);
    expect(matchesPhone("0555 123 45 67", "ali")).toBe(false);
    expect(matchesPhone(null, "0555")).toBe(false);
  });
});
