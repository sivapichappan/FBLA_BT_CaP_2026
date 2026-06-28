/**
 * printDoc HTML builders (§16). These pure functions assemble the print
 * document's markup; the tests pin the contract that matters — values land in
 * the right cells, numbers are right-aligned, deltas render with direction, and
 * (critically) every dynamic string is HTML-escaped so a name with < or " can
 * never break or inject into the document.
 */

import { describe, expect, it } from "vitest";
import { barList, dataTable, esc, kpiGrid, narrativeBlock } from "../printDoc";

describe("esc", () => {
  it("escapes all HTML-significant characters", () => {
    expect(esc(`<b>"a" & 'b'`)).toBe(
      "&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;",
    );
  });
  it("stringifies numbers", () => {
    expect(esc(42)).toBe("42");
  });
});

describe("dataTable", () => {
  it("renders a header + body and flags numeric columns", () => {
    const html = dataTable(
      [{ label: "Business" }, { label: "Visits", num: true }],
      [["Joe's", 3]],
    );
    expect(html).toContain("<thead>");
    expect(html).toContain('<th class="num">Visits</th>');
    expect(html).toContain('<td class="num">3</td>');
    // The business name is escaped (apostrophe → &#39;).
    expect(html).toContain("Joe&#39;s");
  });
});

describe("barList", () => {
  it("scales widths to the largest value", () => {
    const html = barList([
      { label: "Coffee", value: 100, display: "$100" },
      { label: "Books", value: 50, display: "$50" },
    ]);
    expect(html).toContain("width:100%");
    expect(html).toContain("width:50%");
    expect(html).toContain("$100");
  });
});

describe("kpiGrid", () => {
  it("shows an up delta for positive change and 'new' for a null base", () => {
    const html = kpiGrid([
      { label: "Views", value: "120", change: { abs: 20, pct: 25 } },
      { label: "Reviews", value: "3", change: { abs: 3, pct: null } },
      { label: "Tenure", value: "10 days" },
    ]);
    expect(html).toContain("▲ 25%");
    expect(html).toContain(">new<");
    expect(html).toContain("Views");
  });
});

describe("narrativeBlock", () => {
  it("is empty for no lines and lists each highlight otherwise", () => {
    expect(narrativeBlock([])).toBe("");
    expect(narrativeBlock(["Kept $144 local"])).toContain(
      "<li>Kept $144 local</li>",
    );
  });
});
