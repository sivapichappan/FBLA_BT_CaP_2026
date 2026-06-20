/**
 * VerifiedRating unit tests — the headline "Verified reviews only" toggle.
 * Covers the raw→verified number swap, the toggle + caption visibility rules,
 * and the empty cases (no verified reviews / no reviews at all).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VerifiedRating } from "../VerifiedRating";

function setup(props: Partial<Parameters<typeof VerifiedRating>[0]> = {}) {
  const onToggle = vi.fn();
  render(
    <VerifiedRating
      rawRating={4.5}
      rawCount={21}
      verifiedRating={3.9}
      verifiedCount={7}
      verifiedOnly={false}
      onToggle={onToggle}
      {...props}
    />,
  );
  return { onToggle };
}

describe("VerifiedRating (the trust toggle)", () => {
  it("shows the raw average by default", () => {
    setup();
    expect(screen.getByText(/4\.5 · 21 reviews/)).toBeTruthy();
  });

  it("shows the toggle and caption when verified reviews exist", () => {
    setup();
    expect(screen.getByRole("button", { name: "All" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Verified only/ })).toBeTruthy();
    expect(
      screen.getByText(/7 of 21 reviews are from confirmed visits/),
    ).toBeTruthy();
  });

  it("swaps to the verified average when toggled on", () => {
    setup({ verifiedOnly: true });
    expect(screen.getByText(/3\.9 · 7 verified reviews/)).toBeTruthy();
  });

  it("calls onToggle when a segment is clicked", () => {
    const { onToggle } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Verified only/ }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("hides the toggle when there are no verified reviews", () => {
    setup({ verifiedCount: 0, verifiedRating: null });
    expect(screen.queryByRole("button", { name: /Verified only/ })).toBeNull();
  });

  it("renders nothing when there are no reviews at all", () => {
    const { container } = render(
      <VerifiedRating
        rawRating={0}
        rawCount={0}
        verifiedRating={null}
        verifiedCount={0}
        verifiedOnly={false}
        onToggle={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
