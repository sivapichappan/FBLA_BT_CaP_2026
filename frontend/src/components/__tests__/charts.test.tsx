/**
 * Chart unit tests (§16). The charts are hand-rolled HTML (no library), so
 * these tests pin the two things that actually broke once or matter most:
 * bars must scale relative to the MAX value (the SVG text-stretch bug's
 * replacement contract), and every chart must stay readable to screen
 * readers through its aria-label.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarChart, FunnelChart, TrendChart } from "../charts";

describe("BarChart", () => {
  const DIST = [
    { label: "1★", value: 0 },
    { label: "3★", value: 5 },
    { label: "5★", value: 20 },
  ];

  it("describes the whole distribution in one aria-label", () => {
    render(<BarChart data={DIST} />);
    expect(
      screen.getByRole("img", { name: "Bar chart: 1★: 0, 3★: 5, 5★: 20" }),
    ).toBeTruthy();
  });

  it("scales bar heights against the max value", () => {
    const { container } = render(<BarChart data={DIST} />);
    const bars = container.querySelectorAll<HTMLElement>("[style*='height']");
    // 5/20 → 25% of the 75% band; 20/20 → the full 75% band.
    const heights = Array.from(bars).map((b) => b.style.height);
    expect(heights).toContain("18.75%");
    expect(heights).toContain("75%");
  });

  it("labels every bar but only prints non-zero values", () => {
    render(<BarChart data={DIST} />);
    expect(screen.getByText("1★")).toBeTruthy();
    expect(screen.getByText("20")).toBeTruthy();
    // A zero-count bar shows no number (less ink, same information).
    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("FunnelChart", () => {
  const FUNNEL = [
    { label: "Views", value: 200 },
    { label: "Favorites", value: 50, pctOfPrev: 25 },
    { label: "Redemptions", value: 10, pctOfPrev: 20 },
  ];

  it("renders each step with its count and conversion percentage", () => {
    render(<FunnelChart steps={FUNNEL} />);
    expect(screen.getByText("Views")).toBeTruthy();
    expect(screen.getByText("200")).toBeTruthy();
    expect(screen.getByText("↓ 25% convert")).toBeTruthy();
    expect(screen.getByText("↓ 20% convert")).toBeTruthy();
  });

  it("scales step widths against the FIRST step (the funnel mouth)", () => {
    const { container } = render(<FunnelChart steps={FUNNEL} />);
    const widths = Array.from(
      container.querySelectorAll<HTMLElement>("[style*='width']"),
    ).map((el) => el.style.width);
    expect(widths).toEqual(["100%", "25%", "6%"]); // 10/200=5% floors to the 6% min so the count stays legible
  });
});

describe("TrendChart", () => {
  it("shows a friendly empty state instead of a blank axis", () => {
    render(<TrendChart data={[]} />);
    expect(screen.getByText("No activity in this range.")).toBeTruthy();
  });

  it("renders one bar per day with month-day labels", () => {
    render(
      <TrendChart
        data={[
          { day: "2026-06-01", count: 2 },
          { day: "2026-06-02", count: 7 },
        ]}
      />,
    );
    expect(screen.getByText("06-01")).toBeTruthy();
    expect(screen.getByText("06-02")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /2026-06-01: 2, 2026-06-02: 7/ }),
    ).toBeTruthy();
  });
});
