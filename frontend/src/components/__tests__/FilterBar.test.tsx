/**
 * FilterBar unit tests (§16). The bar is a pure controlled component — state
 * lives in the Search page — so every interaction must surface as exactly one
 * onChange(nextFilters) call with a correct patch. That contract (not pixels)
 * is what these tests pin down.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Category, SearchFilters } from "../../types";
import { FilterBar } from "../FilterBar";

const EMPTY: SearchFilters = {
  q: "",
  categories: [],
  min_rating: 0,
  price_levels: [],
  open_now: false,
  sort: "best_match",
};

const CATEGORIES: Category[] = [
  { id: 1, name: "Coffee" },
  { id: 2, name: "Bookstore" },
];

function renderBar(filters: SearchFilters = EMPTY) {
  const onChange = vi.fn();
  render(
    <FilterBar filters={filters} categories={CATEGORIES} onChange={onChange} />,
  );
  return onChange;
}

/** The controlled-component contract: exactly ONE call, with this patch. */
function expectOnlyCall(
  onChange: ReturnType<typeof vi.fn>,
  expected: SearchFilters,
) {
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith(expected);
}

describe("FilterBar", () => {
  it("patches open_now without touching other filters", () => {
    const onChange = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Open now" }));
    expectOnlyCall(onChange, {
      ...EMPTY,
      open_now: true,
    });
  });

  it("announces toggle state via aria-pressed", () => {
    renderBar({ ...EMPTY, open_now: true });
    expect(
      screen
        .getByRole("button", { name: "Open now" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("changes the sort mode through the select", () => {
    const onChange = renderBar();
    fireEvent.change(screen.getByLabelText("Sort results"), {
      target: { value: "rating" },
    });
    expectOnlyCall(onChange, {
      ...EMPTY,
      sort: "rating",
    });
  });

  it("keeps the panel filters hidden until the disclosure is opened", () => {
    const onChange = renderBar();
    expect(screen.queryByRole("button", { name: "Coffee" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.click(screen.getByRole("button", { name: "Coffee" }));
    expectOnlyCall(onChange, {
      ...EMPTY,
      categories: ["Coffee"],
    });
  });

  it("adds a price level alongside ones already selected", () => {
    const onChange = renderBar({ ...EMPTY, price_levels: [1] });
    fireEvent.click(screen.getByRole("button", { name: /Filters/ }));
    fireEvent.click(screen.getByRole("button", { name: "Price level 2" }));
    expectOnlyCall(onChange, {
      ...EMPTY,
      price_levels: [1, 2],
    });
  });

  it("clears every filter at once via the Clear button", () => {
    const active: SearchFilters = {
      ...EMPTY,
      categories: ["Coffee"],
      price_levels: [2],
      min_rating: 4,
      open_now: true,
    };
    const onChange = renderBar(active);
    // 4 active filters → the button shows the count.
    fireEvent.click(screen.getByRole("button", { name: "Clear (4)" }));
    expectOnlyCall(onChange, {
      ...active,
      categories: [],
      price_levels: [],
      min_rating: 0,
      open_now: false,
    });
  });
});
