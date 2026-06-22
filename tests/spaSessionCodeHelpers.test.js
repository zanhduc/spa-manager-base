import { describe, expect, it } from "vitest";
import {
  incrementPrefixedCode,
  nextSessionCodeFromRows,
  nextTreatmentProgressCodeFromRows,
} from "../src/client/api/spaSessionCodeHelpers.js";

describe("spaSessionCodeHelpers", () => {
  it("returns the default code when no rows exist", () => {
    expect(nextSessionCodeFromRows([], "maPhien", "LT", "LT00001")).toBe("LT00001");
    expect(nextSessionCodeFromRows([], "maLichHen", "BK", "BK00001")).toBe("BK00001");
  });

  it("increments from the highest existing code instead of the first row", () => {
    const rows = [
      { maPhien: "LT00001" },
      { maPhien: "LT00008" },
      { maPhien: "LT00003" },
    ];
    expect(nextSessionCodeFromRows(rows, "maPhien", "LT", "LT00001")).toBe("LT00009");
  });

  it("ignores unrelated prefixes and temp codes", () => {
    const rows = [
      { maPhien: "TEMP-1730000000000" },
      { maPhien: "BK00001" },
      { maPhien: "LT00004" },
    ];
    expect(nextSessionCodeFromRows(rows, "maPhien", "LT", "LT00001")).toBe("LT00005");
  });

  it("increments prefixed codes with fixed width", () => {
    expect(incrementPrefixedCode("LT00001", "LT00001")).toBe("LT00002");
    expect(incrementPrefixedCode("", "LT00001")).toBe("LT00001");
  });

  it("returns the first progress code when sheet is empty", () => {
    expect(nextTreatmentProgressCodeFromRows([])).toBe("TTK00001");
  });

  it("increments progress code from the highest TTK value", () => {
    const rows = [
      { maTienTrinh: "TTK00003" },
      { maTienTrinh: "TTK00011" },
      { maTienTrinh: "TTK00007" },
    ];
    expect(nextTreatmentProgressCodeFromRows(rows)).toBe("TTK00012");
  });
});
