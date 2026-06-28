/**
 * Export/format helpers (§16). formatDay is the regression guard for the PDF
 * date off-by-one: a YYYY-MM-DD must render on the SAME calendar day regardless
 * of the runner's timezone (the naive `new Date("2026-05-29")` parsed as UTC and
 * displayed the prior day in western zones).
 */

import { describe, expect, it } from "vitest";
import { dollars, formatDay, toCsv } from "../export";

describe("formatDay", () => {
  it("keeps the calendar day — no timezone shift", () => {
    expect(formatDay("2026-05-29")).toContain("29");
    expect(formatDay("2026-05-29")).not.toContain("28");
    expect(formatDay("2026-05-29")).toContain("2026");
  });
  it("treats a full ISO timestamp the same as the bare date", () => {
    expect(formatDay("2026-05-29T00:00:00+00:00")).toBe(
      formatDay("2026-05-29"),
    );
  });
});

describe("dollars", () => {
  it("rounds cents to whole dollars", () => {
    expect(dollars(7322)).toBe("$73");
  });
});

describe("toCsv", () => {
  it("quotes cells and doubles embedded quotes", () => {
    expect(toCsv([["a,b", 'x"y', 3]])).toBe('"a,b","x""y","3"');
  });
});
